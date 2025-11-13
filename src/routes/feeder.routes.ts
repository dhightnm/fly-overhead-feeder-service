import express, { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import axios, { AxiosError } from 'axios';
import feederService from '../services/FeederService';
import dataIngestionService from '../services/DataIngestionService';
import statsService from '../services/StatsService';
import { authenticate } from '../middlewares/auth';
import { handleValidationErrors } from '../middlewares/validator';
import {
  registrationLimiter,
  generalLimiter,
} from '../middlewares/rateLimiter';
import config from '../config';
import logger from '../utils/logger';
import { ExpressRequest } from '../types';

const router: Router = express.Router();

router.post(
  '/register',
  registrationLimiter,
  [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Name is required')
      .isLength({ min: 3, max: 100 })
      .withMessage('Name must be between 3 and 100 characters'),
    body('location.latitude')
      .optional()
      .isFloat({ min: -90, max: 90 })
      .withMessage('Latitude must be between -90 and 90'),
    body('location.longitude')
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage('Longitude must be between -180 and 180'),
    body('metadata')
      .optional()
      .isObject()
      .withMessage('Metadata must be an object'),
  ],
  handleValidationErrors,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Extract optional JWT token from Authorization header for user account linking
      const authHeader = req.headers.authorization;
      const userJwtToken = authHeader && authHeader.startsWith('Bearer ') 
        ? authHeader.substring(7) 
        : undefined;
      
      const result = await feederService.registerFeeder(req.body, userJwtToken);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/data',
  authenticate,
  // No rate limiting on data ingestion - feeders can submit unlimited data
  // Tier-based limits only apply to other API operations (stats, health, etc.)
  [
    body('timestamp')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Timestamp must be a positive integer (Unix timestamp)'),
    body('states')
      .isArray({ min: 1 })
      .withMessage('States must be a non-empty array'),
    body('states.*.icao24')
      .notEmpty()
      .withMessage('ICAO24 is required')
      .isLength({ min: 6, max: 6 })
      .withMessage('ICAO24 must be 6 characters')
      .matches(/^[0-9a-fA-F]{6}$/)
      .withMessage('ICAO24 must be hexadecimal'),
  ],
  handleValidationErrors,
  async (req: ExpressRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.feeder) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
        return;
      }

      // Extract API key from Authorization header to forward to main service
      const authHeader = req.headers.authorization;
      const apiKey = authHeader?.replace('Bearer ', '') || '';
      
      logger.info('📡 Feeder data endpoint called', {
        feederId: req.feeder.feeder_id,
        feederName: req.feeder.name,
        stateCount: req.body.states?.length || 0,
        hasApiKey: !!apiKey,
        ip: req.ip || req.connection.remoteAddress,
      });

      const result = await dataIngestionService.ingestData(
        req.feeder.feeder_id,
        req.body,
        apiKey
      );

      feederService.updateLastSeen(req.feeder.feeder_id).catch(() => {
        // Non-critical, silently fail
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/me',
  authenticate,
  generalLimiter,
  async (req: ExpressRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.feeder) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
        return;
      }

      // Forward request to main service
      const mainServiceUrl = `${config.mainService.url}${config.mainService.authEndpoint}`;
      const apiKey = req.headers.authorization?.replace('Bearer ', '') || '';

      try {
        const response = await axios.get(mainServiceUrl, {
          timeout: config.mainService.timeout,
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        });

        // Return the main service's response
        res.status(200).json(response.data);
      } catch (error) {
        const axiosError = error as AxiosError;
        
        if (axiosError.response) {
          // Forward the main service's error response
          res.status(axiosError.response.status).json(axiosError.response.data);
        } else {
          // Network/timeout error
          res.status(503).json({
            success: false,
            error: 'Main service unavailable',
          });
        }
      }
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/me/stats',
  authenticate,
  generalLimiter,
  async (req: ExpressRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.feeder) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
        return;
      }

      const days = parseInt(req.query.days as string, 10) || 7;

      if (days < 1 || days > 90) {
        res.status(400).json({
          success: false,
          error: 'Invalid days parameter',
          message: 'Days must be between 1 and 90',
        });
        return;
      }

      const stats = await statsService.getFeederStatistics(req.feeder.feeder_id, days);

      res.status(200).json(stats);
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/me/health',
  authenticate,
  generalLimiter,
  async (req: ExpressRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.feeder) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
        return;
      }

      const health = await statsService.getFeederHealth(req.feeder.feeder_id);

      res.status(200).json(health);
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/me/quality',
  authenticate,
  generalLimiter,
  async (req: ExpressRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.feeder) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
        return;
      }

      const quality = await statsService.getDataQualityFeedback(req.feeder.feeder_id);

      res.status(200).json({
        success: true,
        data: quality,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;


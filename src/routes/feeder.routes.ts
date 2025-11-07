import express, { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import feederService from '../services/FeederService';
import dataIngestionService from '../services/DataIngestionService';
import statsService from '../services/StatsService';
import { authenticate } from '../middlewares/auth';
import { handleValidationErrors } from '../middlewares/validator';
import {
  dataIngestionLimiter,
  registrationLimiter,
  generalLimiter,
} from '../middlewares/rateLimiter';
import logger from '../utils/logger';
import { ExpressRequest } from '../types';

const router: Router = express.Router();

/**
 * POST /api/v1/feeders/register
 * Register a new feeder
 */
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
      const result = await feederService.registerFeeder(req.body);

      logger.info('Feeder registered', {
        feeder_id: result.feeder_id,
        name: req.body.name,
        ip: req.ip,
      });

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/feeders/data
 * Submit aircraft state data
 */
router.post(
  '/data',
  authenticate,
  dataIngestionLimiter,
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

      const result = await dataIngestionService.ingestData(
        req.feeder.feeder_id,
        req.body
      );

      // Update last seen timestamp (fire and forget)
      feederService.updateLastSeen(req.feeder.feeder_id).catch((err) => {
        logger.warn('Failed to update last seen', {
          error: err.message,
          feeder_id: req.feeder?.feeder_id,
        });
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/feeders/me
 * Get authenticated feeder information
 */
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

      const feederInfo = await feederService.getFeederInfo(req.feeder.feeder_id);
      const feederStats = await feederService.getFeederStats(req.feeder.feeder_id);

      res.status(200).json({
        ...feederInfo,
        stats: feederStats,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/feeders/me/stats
 * Get detailed statistics for authenticated feeder
 */
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

/**
 * GET /api/v1/feeders/me/health
 * Get health status for authenticated feeder
 */
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

/**
 * GET /api/v1/feeders/me/quality
 * Get data quality feedback for authenticated feeder
 */
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


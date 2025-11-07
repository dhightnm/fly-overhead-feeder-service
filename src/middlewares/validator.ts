import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import logger from '../utils/logger';
import { ExpressRequest } from '../types';

interface AppError extends Error {
  statusCode?: number;
  details?: any;
  code?: string;
}

export function handleValidationErrors(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const errorDetails = errors.array().map((err) => {
      let field = '';
      if (err.type === 'field') {
        field = Array.isArray(err.path) ? err.path.join('.') : String(err.path);
      } else if (err.type === 'alternative') {
        field = err.nestedErrors?.[0]?.type === 'field' 
          ? (Array.isArray(err.nestedErrors[0].path) ? err.nestedErrors[0].path.join('.') : String(err.nestedErrors[0].path))
          : '';
      }
      return {
        field,
        message: err.msg,
        value: 'value' in err ? err.value : undefined,
      };
    });

    logger.warn('Validation failed', {
      path: req.path,
      errors: errorDetails,
      feeder_id: (req as ExpressRequest).feeder?.feeder_id,
    });

    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errorDetails,
    });
    return;
  }

  next();
}

export function errorHandler(err: AppError, req: Request, res: Response, _next: NextFunction): void {
  logger.error('Request error', {
    error: err.message,
    path: req.path,
    method: req.method,
    feeder_id: (req as ExpressRequest).feeder?.feeder_id,
  });

  if (err.statusCode) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      details: err.details || undefined,
    });
    return;
  }

  if (err.code === '23505') {
    res.status(409).json({
      success: false,
      error: 'Resource already exists',
      message: err.message,
    });
    return;
  }

  if (err.code === '23503') {
    res.status(400).json({
      success: false,
      error: 'Invalid reference',
      message: 'Referenced resource does not exist',
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  logger.warn('Route not found', { path: req.path, method: req.method });
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.path,
  });
}


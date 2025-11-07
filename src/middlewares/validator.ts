import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import logger from '../utils/logger';
import { ExpressRequest } from '../types';

interface AppError extends Error {
  statusCode?: number;
  details?: any;
  code?: string;
}

/**
 * Middleware to handle validation results from express-validator
 */
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
      } else {
        field = '';
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

/**
 * Error handling middleware
 * Catches and formats errors from route handlers
 */
export function errorHandler(err: AppError, req: Request, res: Response, _next: NextFunction): void {
  // Log error
  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    feeder_id: (req as ExpressRequest).feeder?.feeder_id,
  });

  // Handle known error types
  if (err.statusCode) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      details: err.details || undefined,
    });
    return;
  }

  // Handle database errors
  if (err.code === '23505') {
    // Unique constraint violation
    res.status(409).json({
      success: false,
      error: 'Resource already exists',
      message: err.message,
    });
    return;
  }

  if (err.code === '23503') {
    // Foreign key violation
    res.status(400).json({
      success: false,
      error: 'Invalid reference',
      message: 'Referenced resource does not exist',
    });
    return;
  }

  // Default error response
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
}

/**
 * 404 handler for unknown routes
 */
export function notFoundHandler(req: Request, res: Response): void {
  logger.warn('Route not found', {
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.path,
  });
}


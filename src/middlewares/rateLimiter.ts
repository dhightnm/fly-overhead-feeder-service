import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import config from '../config';
import logger from '../utils/logger';
import { ExpressRequest } from '../types';

export const dataIngestionLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    success: false,
    error: 'Too many requests',
    message: `Rate limit exceeded. Maximum ${config.rateLimit.maxRequests} requests per ${config.rateLimit.windowMs / 1000} seconds.`,
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: ExpressRequest) => req.feeder?.feeder_id || req.ip || 'unknown',
  handler: (req: ExpressRequest, res) => {
    logger.warn('Rate limit exceeded', {
      feeder_id: req.feeder?.feeder_id,
      ip: req.ip,
    });
    res.status(429).json({
      success: false,
      error: 'Too many requests',
      message: `Rate limit exceeded. Maximum ${config.rateLimit.maxRequests} requests per ${config.rateLimit.windowMs / 1000} seconds.`,
      retry_after: Math.ceil(config.rateLimit.windowMs / 1000),
    });
  },
  skip: (_req: ExpressRequest) => config.nodeEnv === 'development' && process.env.SKIP_RATE_LIMIT === 'true',
});

export const registrationLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    error: 'Too many registration attempts',
    message: 'Maximum 5 registrations per hour. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: ExpressRequest) => req.ip || 'unknown',
  handler: (req: ExpressRequest, res) => {
    logger.warn('Registration rate limit exceeded', { ip: req.ip });
    res.status(429).json({
      success: false,
      error: 'Too many registration attempts',
      message: 'Maximum 5 registrations per hour. Please try again later.',
      retry_after: 3600,
    });
  },
});

export const generalLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: ExpressRequest) => req.feeder?.feeder_id || req.ip || 'unknown',
  handler: (req: ExpressRequest, res) => {
    logger.warn('General rate limit exceeded', {
      feeder_id: req.feeder?.feeder_id,
      ip: req.ip,
    });
    res.status(429).json({
      success: false,
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      retry_after: 900,
    });
  },
});


import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import config from '../config';
import logger from '../utils/logger';
import { ExpressRequest } from '../types';

/**
 * Create rate limiter for data ingestion endpoints
 * Per-feeder rate limiting based on IP and/or API key
 */
export const dataIngestionLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    success: false,
    error: 'Too many requests',
    message: `Rate limit exceeded. Maximum ${config.rateLimit.maxRequests} requests per ${config.rateLimit.windowMs / 1000} seconds.`,
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  
  // Key generator: Use feeder_id if authenticated, otherwise use IP
  keyGenerator: (req: ExpressRequest) => {
    return req.feeder?.feeder_id || req.ip || 'unknown';
  },

  // Custom handler for rate limit exceeded
  handler: (req: ExpressRequest, res) => {
    logger.warn('Rate limit exceeded', {
      feeder_id: req.feeder?.feeder_id,
      ip: req.ip,
      path: req.path,
    });

    res.status(429).json({
      success: false,
      error: 'Too many requests',
      message: `Rate limit exceeded. Maximum ${config.rateLimit.maxRequests} requests per ${config.rateLimit.windowMs / 1000} seconds.`,
      retry_after: Math.ceil(config.rateLimit.windowMs / 1000),
    });
  },

  // Skip rate limiting in development (optional)
  skip: (_req: ExpressRequest) => {
    return config.nodeEnv === 'development' && process.env.SKIP_RATE_LIMIT === 'true';
  },
});

/**
 * Create rate limiter for registration endpoints
 * Stricter limits to prevent abuse
 */
export const registrationLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 registrations per hour per IP
  message: {
    success: false,
    error: 'Too many registration attempts',
    message: 'Maximum 5 registrations per hour. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req: ExpressRequest) => {
    return req.ip || 'unknown';
  },

  handler: (req: ExpressRequest, res) => {
    logger.warn('Registration rate limit exceeded', {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(429).json({
      success: false,
      error: 'Too many registration attempts',
      message: 'Maximum 5 registrations per hour. Please try again later.',
      retry_after: 3600, // 1 hour in seconds
    });
  },
});

/**
 * Create rate limiter for general API endpoints
 */
export const generalLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: {
    success: false,
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req: ExpressRequest) => {
    return req.feeder?.feeder_id || req.ip || 'unknown';
  },

  handler: (req: ExpressRequest, res) => {
    logger.warn('General rate limit exceeded', {
      feeder_id: req.feeder?.feeder_id,
      ip: req.ip,
      path: req.path,
    });

    res.status(429).json({
      success: false,
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      retry_after: 900, // 15 minutes in seconds
    });
  },
});


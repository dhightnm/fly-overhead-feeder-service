import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import logger from '../utils/logger';
import { ExpressRequest } from '../types';

// Note: Data ingestion (/data endpoint) has NO rate limiting - feeders can submit unlimited data
// Tier-based limits only apply to other API operations (stats, health, etc.) via generalLimiter

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

// Tier-based rate limiter for API operations (stats, health, etc.)
// Data ingestion is unlimited - this only applies to other endpoints
export const generalLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  // Use dynamic max based on tier for API operations
  max: (req: ExpressRequest) => {
    const tier = req.feeder?.tier || 'production'; // Default to production for existing sk_live_ keys
    // Apply tier-based limits to API operations (not data ingestion)
    // Production: 100 req/15min, Standard: 200 req/15min, Premium: 500 req/15min
    const tierLimits = {
      production: 100,
      standard: 200,
      premium: 500,
    };
    return tierLimits[tier] || tierLimits.production;
  },
  message: {
    success: false,
    error: 'Too many requests',
    message: 'Rate limit exceeded',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: ExpressRequest) => req.feeder?.feeder_id || req.ip || 'unknown',
  handler: (req: ExpressRequest, res) => {
    const tier = req.feeder?.tier || 'production';
    const tierLimits = {
      production: 100,
      standard: 200,
      premium: 500,
    };
    const maxRequests = tierLimits[tier] || tierLimits.production;
    
    logger.warn('API rate limit exceeded', {
      feeder_id: req.feeder?.feeder_id,
      tier,
      max_requests: maxRequests,
      ip: req.ip,
    });
    
    res.status(429).json({
      success: false,
      error: 'Too many requests',
      message: `Rate limit exceeded. Maximum ${maxRequests} API requests per 15 minutes for ${tier} tier. Note: Data ingestion is unlimited.`,
      tier,
      max_requests: maxRequests,
      retry_after: 900,
    });
  },
});


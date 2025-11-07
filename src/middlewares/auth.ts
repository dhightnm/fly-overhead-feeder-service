import { Response, NextFunction } from 'express';
import postgresRepository from '../repositories/PostgresRepository';
import authService from '../services/AuthService';
import logger from '../utils/logger';
import { FeederData, ExpressRequest } from '../types';

/**
 * Authentication middleware
 * Validates API key and attaches feeder information to request
 */
export async function authenticate(req: ExpressRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    // Extract API key from Authorization header
    const authHeader = req.headers.authorization;
    const apiKey = authService.extractBearerToken(authHeader);

    if (!apiKey) {
      res.status(401).json({
        success: false,
        error: 'Missing or invalid Authorization header',
        message: 'Expected format: Authorization: Bearer <api_key>',
      });
      return;
    }

    // Validate API key format
    if (!authService.validateApiKeyFormat(apiKey)) {
      res.status(401).json({
        success: false,
        error: 'Invalid API key format',
      });
      return;
    }

    // Look up feeder by API key
    // Note: This is a simplified implementation
    // In production, implement a proper API key -> feeder_id lookup table
    // or use a caching layer (Redis) to avoid database queries on every request
    
    const feeder = await findFeederByApiKey(apiKey);

    if (!feeder) {
      logger.warn('Authentication failed: Invalid API key', {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(401).json({
        success: false,
        error: 'Invalid API key',
      });
      return;
    }

    // Check feeder status
    if (feeder.status === 'suspended') {
      logger.warn('Authentication failed: Feeder suspended', {
        feeder_id: feeder.feeder_id,
      });

      res.status(403).json({
        success: false,
        error: 'Feeder account suspended',
        message: 'Please contact support for assistance',
      });
      return;
    }

    if (feeder.status === 'inactive') {
      logger.warn('Authentication failed: Feeder inactive', {
        feeder_id: feeder.feeder_id,
      });

      res.status(403).json({
        success: false,
        error: 'Feeder account inactive',
      });
      return;
    }

    // Attach feeder to request
    req.feeder = {
      id: feeder.id,
      feeder_id: feeder.feeder_id,
      name: feeder.name,
      status: feeder.status,
    };

    logger.debug('Authentication successful', {
      feeder_id: feeder.feeder_id,
    });

    next();
  } catch (error) {
    const err = error as Error;
    logger.error('Authentication error', {
      error: err.message,
      stack: err.stack,
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error during authentication',
    });
  }
}

/**
 * Find feeder by API key
 * This is a helper function that should be optimized in production
 */
async function findFeederByApiKey(apiKey: string): Promise<FeederData | null> {
  // WARNING: This implementation is not scalable
  // For production, implement one of these solutions:
  // 1. Create a separate api_keys table with indexed lookups
  // 2. Use Redis cache for API key -> feeder_id mapping
  // 3. Use JWT tokens instead of API keys

  try {
    // Get all active feeders (this is inefficient!)
    const query = `
      SELECT id, feeder_id, api_key_hash, name, status
      FROM feeders
      WHERE status IN ('active', 'inactive', 'suspended')
      LIMIT 1000;
    `;

    const feeders = await (postgresRepository as any).db.manyOrNone(query) as FeederData[];

    // Check each feeder's API key hash
    for (const feeder of feeders) {
      const isValid = await authService.verifyApiKey(apiKey, feeder.api_key_hash);
      if (isValid) {
        return feeder;
      }
    }

    return null;
  } catch (error) {
    const err = error as Error;
    logger.error('Error finding feeder by API key', {
      error: err.message,
    });
    return null;
  }
}


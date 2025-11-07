import { Response, NextFunction } from 'express';
import postgresRepository from '../repositories/PostgresRepository';
import authService from '../services/AuthService';
import logger from '../utils/logger';
import { FeederData, ExpressRequest } from '../types';

export async function authenticate(req: ExpressRequest, res: Response, next: NextFunction): Promise<void> {
  try {
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

    if (!authService.validateApiKeyFormat(apiKey)) {
      res.status(401).json({ success: false, error: 'Invalid API key format' });
      return;
    }

    const feeder = await findFeederByApiKey(apiKey);

    if (!feeder) {
      res.status(401).json({ success: false, error: 'Invalid API key' });
      return;
    }

    if (feeder.status === 'suspended') {
      res.status(403).json({
        success: false,
        error: 'Feeder account suspended',
        message: 'Please contact support for assistance',
      });
      return;
    }

    if (feeder.status === 'inactive') {
      res.status(403).json({ success: false, error: 'Feeder account inactive' });
      return;
    }

    req.feeder = {
      id: feeder.id,
      feeder_id: feeder.feeder_id,
      name: feeder.name,
      status: feeder.status,
    };

    next();
  } catch (error) {
    const err = error as Error;
    logger.error('Authentication error', { error: err.message });
    res.status(500).json({ success: false, error: 'Internal server error during authentication' });
  }
}

async function findFeederByApiKey(apiKey: string): Promise<FeederData | null> {
  try {
    const query = `
      SELECT id, feeder_id, api_key_hash, name, status
      FROM feeders
      WHERE status IN ('active', 'inactive', 'suspended')
      LIMIT 1000;
    `;
    const feeders = await (postgresRepository as any).db.manyOrNone(query) as FeederData[];

    for (const feeder of feeders) {
      const isValid = await authService.verifyApiKey(apiKey, feeder.api_key_hash);
      if (isValid) return feeder;
    }
    return null;
  } catch (error) {
    const err = error as Error;
    logger.error('Error finding feeder by API key', { error: err.message });
    return null;
  }
}


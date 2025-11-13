import { Response, NextFunction } from 'express';
import authService from '../services/AuthService';
import logger from '../utils/logger';
import config from '../config';
import { FeederData, ExpressRequest } from '../types';
import axios, { AxiosError } from 'axios';

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
      tier: feeder.tier || 'production', // Default to production tier for existing keys
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
    const mainServiceUrl = `${config.mainService.url}${config.mainService.authEndpoint}`;
    
    try {
      const response = await axios.get(mainServiceUrl, {
        timeout: config.mainService.timeout,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (response.data && response.data.feeder_id) {
        const tier = response.data.tier || 'production';
        
        return {
          id: 0,
          feeder_id: response.data.feeder_id,
          name: response.data.name || 'Unknown',
          status: response.data.status || 'active',
          tier: tier as 'production' | 'standard' | 'premium',
          api_key_hash: '',
        } as FeederData;
      }
      
      return null;
    } catch (error) {
      const axiosError = error as AxiosError;
      
      if (axiosError.response) {
        if (axiosError.response.status === 401 || axiosError.response.status === 403) {
          return null;
        }
        logger.warn('Main service authentication error', {
          status: axiosError.response.status,
          feederId: 'unknown',
        });
      } else {
        logger.error('Main service unavailable for authentication', {
          error: axiosError.message,
        });
      }
      
      return null;
    }
  } catch (error) {
    const err = error as Error;
    logger.error('Error authenticating with main service', { error: err.message });
    return null;
  }
}


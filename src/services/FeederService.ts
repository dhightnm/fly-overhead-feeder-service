import postgresRepository from '../repositories/PostgresRepository';
import authService from './AuthService';
import logger from '../utils/logger';
import config from '../config';
import { validateFeederRegistration } from '../utils/validator';
import { FeederRegistrationData, FeederData, FeederStats } from '../types';
import axios, { AxiosError } from 'axios';

interface AppError extends Error {
  statusCode?: number;
  details?: any;
  code?: string;
}

class FeederService {
  async registerFeeder(
    data: FeederRegistrationData,
    userJwtToken?: string
  ): Promise<{ feeder_id: string; api_key: string; message: string; linked_to_user?: boolean; user_id?: number }> {
    // Validate input
    const { valid, errors } = validateFeederRegistration(data);
    if (!valid) {
      const error = new Error('Validation failed') as AppError;
      error.statusCode = 400;
      error.details = errors;
      throw error;
    }

    // Generate feeder ID and API key
    const feederId = authService.generateFeederId();
    const apiKey = authService.generateApiKey();
    const apiKeyHash = await authService.hashApiKey(apiKey);

    // Prepare feeder data
    const feederData = {
      feeder_id: feederId,
      api_key_hash: apiKeyHash,
      name: data.name.trim(),
      location: data.location || null,
      metadata: data.metadata || {},
    };

    try {
      // Forward registration to main service
      const mainServiceUrl = `${config.mainService.url}${config.mainService.registerEndpoint}`;
      
      const payload = {
        feeder_id: feederId,
        api_key_hash: apiKeyHash,
        key_prefix: 'fd_', // Use fd_ prefix for feeder keys
        name: feederData.name,
        ...(feederData.location ? {
          latitude: feederData.location.latitude,
          longitude: feederData.location.longitude,
        } : {}),
        metadata: feederData.metadata,
      };

      // Prepare headers - include JWT token if provided for user account linking
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (userJwtToken) {
        headers['Authorization'] = `Bearer ${userJwtToken}`;
      }

      try {
        const response = await axios.post(mainServiceUrl, payload, {
          timeout: config.mainService.timeout,
          headers,
        });

        // Check if feeder was linked to user account
        const linkedToUser = response.data?.linked_to_user === true;
        const userId = response.data?.user_id || undefined;

        return {
          feeder_id: feederId,
          api_key: apiKey,
          message: linkedToUser
            ? 'Feeder registered successfully and linked to your account. Store this API key securely.'
            : 'Store this API key securely. It will not be shown again.',
          linked_to_user: linkedToUser,
          user_id: userId,
        };
      } catch (error) {
        const axiosError = error as AxiosError;
        
        if (axiosError.response) {
          logger.error('Main service rejected feeder registration', {
            status: axiosError.response.status,
            data: axiosError.response.data,
            feederId,
          });

          const appError = new Error('Failed to register feeder') as AppError;
          appError.statusCode = axiosError.response.status || 500;
          appError.details = axiosError.response.data;
          throw appError;
        } else {
          logger.error('Main service unavailable', {
            error: axiosError.message,
            feederId,
          });

          const appError = new Error('Main service unavailable') as AppError;
          appError.statusCode = 503;
          throw appError;
        }
      }
    } catch (error) {
      const err = error as AppError;
      if (err.statusCode) {
        throw error;
      }
      logger.error('Error registering feeder', { error: err.message });
      const appError = new Error('Failed to register feeder') as AppError;
      appError.statusCode = 500;
      throw appError;
    }
  }

  async getFeederInfo(feederId: string): Promise<Partial<FeederData>> {
    try {
      // Try to get feeder from database if available (optional)
      let feeder = null;
      if (postgresRepository.isConnected) {
        try {
          feeder = await postgresRepository.getFeederById(feederId);
        } catch (error) {
          // Database error, continue without feeder info
        }
      }

      if (!feeder) {
        const error = new Error('Feeder not found') as AppError;
        error.statusCode = 404;
        throw error;
      }

      // Format response
      return {
        feeder_id: feeder.feeder_id,
        name: feeder.name,
        status: feeder.status,
        metadata: feeder.metadata,
        created_at: feeder.created_at,
        last_seen_at: feeder.last_seen_at,
        ...(feeder.latitude && feeder.longitude ? {
          location: {
            latitude: feeder.latitude,
            longitude: feeder.longitude,
          }
        } : {}),
      } as Partial<FeederData> & { location?: { latitude: number; longitude: number } | null };
    } catch (error) {
      const err = error as AppError;
      if (err.statusCode) {
        throw error;
      }
      logger.error('Error getting feeder info', { error: err.message, feederId });
      throw error;
    }
  }

  async getFeederStats(feederId: string): Promise<FeederStats> {
    try {
      // Get today's stats
      const today = new Date().toISOString().split('T')[0];
      const todayStats = await postgresRepository.getFeederStatsByDate(feederId, today);

      // Get last 24 hours stats (sum of today and yesterday)
      const statsLast2Days = await postgresRepository.getFeederStatsLastNDays(feederId, 2);

      const last24hStats = statsLast2Days.reduce(
        (acc, stat) => {
          acc.messages_received += stat.messages_received || 0;
          acc.unique_aircraft = Math.max(acc.unique_aircraft, stat.unique_aircraft || 0);
          return acc;
        },
        { messages_received: 0, unique_aircraft: 0 }
      );

      return {
        today: {
          messages_received: todayStats?.messages_received || 0,
          unique_aircraft: todayStats?.unique_aircraft || 0,
        },
        last_24h: last24hStats,
      };
    } catch (error) {
      const err = error as Error;
      logger.error('Error getting feeder stats', { error: err.message, feederId });
      return {
        today: { messages_received: 0, unique_aircraft: 0 },
        last_24h: { messages_received: 0, unique_aircraft: 0 },
      };
    }
  }

  async authenticateFeeder(apiKey: string): Promise<FeederData> {
    if (!apiKey || !authService.validateApiKeyFormat(apiKey)) {
      const error = new Error('Invalid API key format') as AppError;
      error.statusCode = 401;
      throw error;
    }

    const error = new Error('Authentication requires database query optimization') as AppError;
    error.statusCode = 500;
    throw error;
  }

  async updateLastSeen(feederId: string): Promise<void> {
    try {
      await axios.put(
        `${config.mainService.url}${config.mainService.lastSeenEndpoint}`,
        { feeder_id: feederId },
        { timeout: config.mainService.timeout, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      // Non-critical, silently fail
    }
  }
}

export default new FeederService();


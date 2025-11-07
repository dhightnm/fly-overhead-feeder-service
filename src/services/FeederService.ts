import postgresRepository from '../repositories/PostgresRepository';
import authService from './AuthService';
import logger from '../utils/logger';
import { validateFeederRegistration } from '../utils/validator';
import { FeederRegistrationData, FeederData, FeederStats } from '../types';

interface AppError extends Error {
  statusCode?: number;
  details?: any;
  code?: string;
}

class FeederService {
  /**
   * Register a new feeder
   */
  async registerFeeder(data: FeederRegistrationData): Promise<{ feeder_id: string; api_key: string; message: string }> {
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
      // Create feeder in database
      await postgresRepository.createFeeder(feederData);

      logger.info('Feeder registered successfully', {
        feeder_id: feederId,
        name: feederData.name,
      });

      return {
        feeder_id: feederId,
        api_key: apiKey, // Only returned once!
        message: 'Store this API key securely. It will not be shown again.',
      };
    } catch (error) {
      const err = error as AppError;
      logger.error('Error registering feeder', {
        error: err.message,
        name: data.name,
      });

      // Check for duplicate feeder_id (should be rare)
      if (err.code === '23505') {
        throw new Error('Feeder ID conflict. Please try again.');
      }

      throw error;
    }
  }

  /**
   * Get feeder information by feeder ID
   */
  async getFeederInfo(feederId: string): Promise<Partial<FeederData>> {
    try {
      const feeder = await postgresRepository.getFeederById(feederId);

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

      logger.error('Error getting feeder info', {
        error: err.message,
        feederId,
      });
      throw error;
    }
  }

  /**
   * Get feeder statistics
   */
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
      logger.error('Error getting feeder stats', {
        error: err.message,
        feederId,
      });
      // Return empty stats on error
      return {
        today: { messages_received: 0, unique_aircraft: 0 },
        last_24h: { messages_received: 0, unique_aircraft: 0 },
      };
    }
  }

  /**
   * Authenticate a feeder by API key
   */
  async authenticateFeeder(apiKey: string): Promise<FeederData> {
    if (!apiKey || !authService.validateApiKeyFormat(apiKey)) {
      const error = new Error('Invalid API key format') as AppError;
      error.statusCode = 401;
      throw error;
    }

    // In production, you'd want to cache this lookup
    // For now, we need to iterate through feeders to find a match
    // This is not ideal for scale - consider adding an API key prefix -> feeder_id lookup table

    try {
      // For MVP, we'll extract a hash of the API key and search
      // Better approach: Use a separate api_keys table with feeder_id foreign key
      
      // This is a temporary solution - hash the key and do a direct lookup
      // In production, implement a proper API key lookup mechanism
      const error = new Error('Authentication requires database query optimization') as AppError;
      error.statusCode = 500;
      (error as any).note = 'Consider implementing API key -> feeder_id lookup table for production';
      
      // For now, return a mock authentication approach
      // You should enhance this with proper key management
      throw error;
      
    } catch (error) {
      const err = error as Error;
      logger.error('Error authenticating feeder', { error: err.message });
      throw error;
    }
  }

  /**
   * Update feeder last seen timestamp
   */
  async updateLastSeen(feederId: string): Promise<void> {
    try {
      await postgresRepository.updateFeederLastSeen(feederId);
    } catch (error) {
      const err = error as Error;
      // Non-critical, just log
      logger.warn('Failed to update last seen', {
        error: err.message,
        feederId,
      });
    }
  }
}

export default new FeederService();


import postgresRepository from '../repositories/PostgresRepository';
import logger from '../utils/logger';

interface AppError extends Error {
  statusCode?: number;
}

interface FeederStatsRecord {
  date: Date | string;
  messages_received: number;
  unique_aircraft: number;
  data_quality_score: number | null;
  avg_latency_ms: number | null;
  error_count: number;
}

interface FeederStatisticsResponse {
  feeder_id: string;
  period_days: number;
  statistics: Array<{
    date: Date | string;
    messages_received: number;
    unique_aircraft: number;
    data_quality_score: number | null;
    avg_latency_ms: number | null;
    error_count: number;
  }>;
  summary: {
    total_messages: number;
    total_unique_aircraft: number;
    avg_daily_messages: number;
    avg_data_quality: number;
  };
}

interface FeederHealthResponse {
  feeder_id: string;
  status: string;
  health: string;
  last_seen_at: Date | null;
  minutes_since_last_seen: number | null;
  location: { latitude: number; longitude: number } | null;
}

class StatsService {
  /**
   * Get comprehensive feeder statistics
   */
  async getFeederStatistics(feederId: string, days: number = 7): Promise<FeederStatisticsResponse> {
    try {
      const stats = await postgresRepository.getFeederStatsLastNDays(feederId, days);

      if (stats.length === 0) {
        return {
          feeder_id: feederId,
          period_days: days,
          statistics: [],
          summary: {
            total_messages: 0,
            total_unique_aircraft: 0,
            avg_daily_messages: 0,
            avg_data_quality: 0,
          },
        };
      }

      // Calculate summary statistics
      const summary = {
        total_messages: 0,
        total_unique_aircraft: 0,
        avg_daily_messages: 0,
        avg_data_quality: 0,
      };

      let qualityCount = 0;

      stats.forEach((stat) => {
        summary.total_messages += stat.messages_received || 0;
        summary.total_unique_aircraft = Math.max(
          summary.total_unique_aircraft,
          stat.unique_aircraft || 0
        );

        if (stat.data_quality_score !== null && stat.data_quality_score !== undefined) {
          summary.avg_data_quality += stat.data_quality_score;
          qualityCount++;
        }
      });

      summary.avg_daily_messages = Math.round(summary.total_messages / days);
      summary.avg_data_quality =
        qualityCount > 0 ? Math.round(summary.avg_data_quality / qualityCount) : 0;

      return {
        feeder_id: feederId,
        period_days: days,
        statistics: stats.map((stat) => ({
          date: stat.date,
          messages_received: stat.messages_received,
          unique_aircraft: stat.unique_aircraft,
          data_quality_score: stat.data_quality_score ?? null,
          avg_latency_ms: stat.avg_latency_ms ?? null,
          error_count: stat.error_count ?? 0,
        })),
        summary,
      };
    } catch (error) {
      const err = error as Error;
      logger.error('Error getting feeder statistics', {
        error: err.message,
        feederId,
      });
      throw error;
    }
  }

  /**
   * Get real-time statistics for all feeders
   */
  async getAllFeedersStats(): Promise<FeederStatsRecord[]> {
    // This would require a new query in PostgresRepository
    // For now, return empty array
    logger.warn('getAllFeedersStats not yet implemented');
    return [];
  }

  /**
   * Get feeder health status
   */
  async getFeederHealth(feederId: string): Promise<FeederHealthResponse> {
    try {
      const feeder = await postgresRepository.getFeederById(feederId);

      if (!feeder) {
        const error = new Error('Feeder not found') as AppError;
        error.statusCode = 404;
        throw error;
      }

      const now = new Date();
      const lastSeen = feeder.last_seen_at ? new Date(feeder.last_seen_at) : null;
      const minutesSinceLastSeen = lastSeen
        ? Math.floor((now.getTime() - lastSeen.getTime()) / 1000 / 60)
        : null;

      let healthStatus = 'unknown';
      if (feeder.status === 'suspended') {
        healthStatus = 'suspended';
      } else if (feeder.status === 'inactive') {
        healthStatus = 'inactive';
      } else if (minutesSinceLastSeen === null) {
        healthStatus = 'never_seen';
      } else if (minutesSinceLastSeen <= 5) {
        healthStatus = 'healthy';
      } else if (minutesSinceLastSeen <= 30) {
        healthStatus = 'degraded';
      } else {
        healthStatus = 'offline';
      }

      return {
        feeder_id: feederId,
        status: feeder.status,
        health: healthStatus,
        last_seen_at: feeder.last_seen_at ?? null,
        minutes_since_last_seen: minutesSinceLastSeen,
        location: feeder.latitude && feeder.longitude
          ? {
              latitude: feeder.latitude,
              longitude: feeder.longitude,
            }
          : null,
      };
    } catch (error) {
      const err = error as AppError;
      if (err.statusCode) {
        throw error;
      }

      logger.error('Error getting feeder health', {
        error: err.message,
        feederId,
      });
      throw error;
    }
  }
}

export default new StatsService();


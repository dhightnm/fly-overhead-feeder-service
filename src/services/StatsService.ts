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
   * Get data quality feedback for a feeder
   * Provides actionable feedback on data quality
   */
  async getDataQualityFeedback(feederId: string): Promise<{
    overall_score: number;
    grade: string;
    metrics: {
      completeness: number;
      accuracy: number;
      timeliness: number;
      coverage: number;
    };
    recommendations: string[];
    recent_stats: {
      last_24h: {
        messages: number;
        unique_aircraft: number;
        avg_quality: number;
      };
      last_7d: {
        messages: number;
        unique_aircraft: number;
        avg_quality: number;
      };
    };
  }> {
    try {
      // Get recent stats
      const stats24h = await postgresRepository.getFeederStatsLastNDays(feederId, 1);
      const stats7d = await postgresRepository.getFeederStatsLastNDays(feederId, 7);

      // Calculate metrics
      const avgQuality24h = stats24h.length > 0 && stats24h[0].data_quality_score !== null
        ? stats24h[0].data_quality_score
        : null;
      
      const avgQuality7d = stats7d.length > 0
        ? stats7d.reduce((sum, stat) => {
            if (stat.data_quality_score !== null && stat.data_quality_score !== undefined) {
              return sum + stat.data_quality_score;
            }
            return sum;
          }, 0) / stats7d.filter(s => s.data_quality_score !== null).length
        : null;

      // Calculate completeness (how many fields are populated)
      // This would ideally come from actual data analysis
      const completeness = avgQuality24h !== null && avgQuality24h !== undefined
        ? Math.min(100, (avgQuality24h / 100) * 100)
        : 50;

      // Calculate accuracy (based on data quality score)
      const accuracy = avgQuality24h !== null && avgQuality24h !== undefined ? avgQuality24h : 50;

      // Calculate timeliness (how recent is the data)
      const feeder = await postgresRepository.getFeederById(feederId);
      const minutesSinceLastSeen = feeder?.last_seen_at
        ? Math.floor((Date.now() - new Date(feeder.last_seen_at).getTime()) / 60000)
        : null;
      
      const timeliness = minutesSinceLastSeen !== null && minutesSinceLastSeen < 5
        ? 100
        : minutesSinceLastSeen !== null && minutesSinceLastSeen < 15
        ? 80
        : minutesSinceLastSeen !== null && minutesSinceLastSeen < 60
        ? 60
        : 30;

      // Calculate coverage (unique aircraft per day)
      const coverage = stats24h.length > 0 && stats24h[0].unique_aircraft > 0
        ? Math.min(100, (stats24h[0].unique_aircraft / 100) * 100)
        : 0;

      // Overall score (weighted average)
      const overallScore = Math.round(
        (completeness * 0.3) +
        (accuracy * 0.3) +
        (timeliness * 0.2) +
        (coverage * 0.2)
      );

      // Grade
      const grade = overallScore >= 90
        ? 'A'
        : overallScore >= 80
        ? 'B'
        : overallScore >= 70
        ? 'C'
        : overallScore >= 60
        ? 'D'
        : 'F';

      // Recommendations
      const recommendations: string[] = [];
      
      if (completeness < 70) {
        recommendations.push('Improve data completeness by ensuring all aircraft fields are populated');
      }
      if (accuracy !== undefined && accuracy < 70) {
        recommendations.push('Check antenna positioning and signal quality for better accuracy');
      }
      if (timeliness < 60) {
        recommendations.push('Ensure feeder is running continuously and check network connectivity');
      }
      if (coverage < 50) {
        recommendations.push('Consider improving antenna height or location for better coverage');
      }
      if (recommendations.length === 0) {
        recommendations.push('Your feeder is performing excellently! Keep up the great work.');
      }

      return {
        overall_score: overallScore,
        grade,
        metrics: {
          completeness,
          accuracy: accuracy ?? 50,
          timeliness,
          coverage,
        },
        recommendations,
        recent_stats: {
          last_24h: {
            messages: stats24h.length > 0 ? stats24h[0].messages_received : 0,
            unique_aircraft: stats24h.length > 0 ? stats24h[0].unique_aircraft : 0,
            avg_quality: avgQuality24h ?? 0,
          },
          last_7d: {
            messages: stats7d.reduce((sum, s) => sum + s.messages_received, 0),
            unique_aircraft: Math.max(...stats7d.map(s => s.unique_aircraft), 0),
            avg_quality: avgQuality7d ?? 0,
          },
        },
      };
    } catch (error) {
      const err = error as Error;
      logger.error('Error getting data quality feedback', {
        error: err.message,
        feederId,
      });
      throw error;
    }
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


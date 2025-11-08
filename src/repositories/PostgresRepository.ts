import pgPromise, { IDatabase, IMain } from 'pg-promise';
import config from '../config';
import logger from '../utils/logger';
import { FeederData } from '../types';

interface FeederStatsRecord {
  id?: number;
  feeder_id: string;
  date: Date | string;
  messages_received: number;
  unique_aircraft: number;
  data_quality_score?: number | null;
  avg_latency_ms?: number | null;
  error_count?: number;
  created_at?: Date;
}

const pgp: IMain = pgPromise({
  error(err, e) {
    logger.error('Database error', { error: err.message, query: e.query });
  },
});

class PostgresRepository {
  private db: IDatabase<any>;
  public isConnected: boolean;

  constructor() {
    this.db = pgp(config.database.url);
    this.isConnected = false;
  }

  async connect(): Promise<boolean> {
    try {
      await this.db.query('SELECT NOW()');
      this.isConnected = true;
      return true;
    } catch (error) {
      const err = error as Error;
      logger.error('Database connection failed', { error: err.message });
      this.isConnected = false;
      return false;
    }
  }

  disconnect(): void {
    pgp.end();
    this.isConnected = false;
  }

  // Feeder Operations (Read-only - all writes forwarded to main service)

  async getFeederById(feederId: string): Promise<FeederData | null> {
    const query = `
      SELECT id, feeder_id, api_key_hash, name,
             ST_Y(location::geometry) as latitude, 
             ST_X(location::geometry) as longitude,
             status, metadata, created_at, updated_at, last_seen_at
      FROM feeders
      WHERE feeder_id = $1;
    `;

    try {
      return await this.db.oneOrNone(query, [feederId]) as FeederData | null;
    } catch (error) {
      const err = error as Error;
      logger.error('Error getting feeder by ID', {
        error: err.message,
        feederId,
      });
      throw error;
    }
  }


  async updateFeederStatus(feederId: string, status: 'active' | 'inactive' | 'suspended'): Promise<void> {
    const query = `UPDATE feeders SET status = $2 WHERE feeder_id = $1`;
    try {
      await this.db.none(query, [feederId, status]);
    } catch (error) {
      const err = error as Error;
      logger.error('Error updating feeder status', { error: err.message, feederId, status });
      throw error;
    }
  }

  // Feeder Statistics Operations (Read-only - writes forwarded to main service)

  async getFeederStatsByDate(feederId: string, date: string | Date): Promise<FeederStatsRecord | null> {
    const query = `
      SELECT *
      FROM feeder_stats
      WHERE feeder_id = $1 AND date = $2;
    `;

    try {
      return await this.db.oneOrNone(query, [feederId, date]) as FeederStatsRecord | null;
    } catch (error) {
      const err = error as Error;
      logger.error('Error getting feeder stats', {
        error: err.message,
        feederId,
        date,
      });
      throw error;
    }
  }

  async getFeederStatsLastNDays(feederId: string, days: number = 7): Promise<FeederStatsRecord[]> {
    const query = `
      SELECT *
      FROM feeder_stats
      WHERE feeder_id = $1 
        AND date >= CURRENT_DATE - $2::integer
      ORDER BY date DESC;
    `;

    try {
      return await this.db.manyOrNone(query, [feederId, days]) as FeederStatsRecord[];
    } catch (error) {
      const err = error as Error;
      logger.error('Error getting feeder stats for last N days', {
        error: err.message,
        feederId,
        days,
      });
      throw error;
    }
  }

  // Aircraft state operations removed - forwarded to main service

  async healthCheck(): Promise<boolean> {
    try {
      await this.db.query('SELECT 1');
      return true;
    } catch (error) {
      const err = error as Error;
      logger.error('Database health check failed', { error: err.message });
      return false;
    }
  }

  async getFeederActivitySummary(hours: number = 24): Promise<{
    totalFeeders: number;
    activeFeeders: number;
    feeders: Array<{
      feeder_id: string;
      name: string;
      status: string;
      last_seen_at: Date | null;
      minutes_since_last_seen: number | null;
      messages_24h: number;
      unique_aircraft_24h: number;
    }>;
  }> {
    try {
      // Safe: hours is a number, not user input
      const hoursInterval = Math.max(1, Math.min(168, hours)); // Clamp between 1 and 168 hours (7 days)
      const summary = await this.db.query(`
        SELECT 
          f.feeder_id,
          f.name,
          f.status,
          f.last_seen_at,
          EXTRACT(EPOCH FROM (NOW() - f.last_seen_at))/60 as minutes_since_last_seen,
          COALESCE(SUM(fs.messages_received), 0)::bigint as messages_24h,
          COALESCE(MAX(fs.unique_aircraft), 0) as unique_aircraft_24h
        FROM feeders f
        LEFT JOIN feeder_stats fs ON fs.feeder_id = f.feeder_id 
          AND fs.date >= CURRENT_DATE - INTERVAL '${hoursInterval} hours'
        GROUP BY f.feeder_id, f.name, f.status, f.last_seen_at
        ORDER BY f.last_seen_at DESC NULLS LAST;
      `);

      const activeFeeders = summary.filter((f: any) => 
        f.status === 'active' && 
        f.last_seen_at && 
        (f.minutes_since_last_seen === null || f.minutes_since_last_seen < 60)
      ).length;

      return {
        totalFeeders: summary.length,
        activeFeeders,
        feeders: summary.map((f: any) => ({
          feeder_id: f.feeder_id,
          name: f.name || 'Unnamed',
          status: f.status,
          last_seen_at: f.last_seen_at,
          minutes_since_last_seen: f.minutes_since_last_seen ? Math.round(f.minutes_since_last_seen) : null,
          messages_24h: parseInt(f.messages_24h, 10),
          unique_aircraft_24h: parseInt(f.unique_aircraft_24h, 10),
        })),
      };
    } catch (error) {
      const err = error as Error;
      logger.error('Error getting feeder activity summary', { error: err.message });
      return {
        totalFeeders: 0,
        activeFeeders: 0,
        feeders: [],
      };
    }
  }
}

export default new PostgresRepository();


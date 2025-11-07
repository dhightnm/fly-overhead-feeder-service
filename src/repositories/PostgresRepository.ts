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

  // Feeder Operations (Read-only - writes forwarded to main service)

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
}

export default new PostgresRepository();


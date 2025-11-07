import pgPromise, { IDatabase, IMain } from 'pg-promise';
import config from '../config';
import logger from '../utils/logger';
import { FeederData, OpenSkyState } from '../types';

interface FeederCreateData {
  feeder_id: string;
  api_key_hash: string;
  name: string;
  location: { latitude: number; longitude: number } | null;
  metadata: Record<string, any>;
}

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

interface BatchUpsertResult {
  success: number;
  errors: number;
  errorDetails: Array<{ icao24?: string; error: string }>;
}

interface BatchState {
  state: OpenSkyState;
  feederId: string;
}

const pgp: IMain = pgPromise({
  // Custom error handler
  error(err, e) {
    logger.error('Database error', {
      error: err.message,
      query: e.query,
    });
  },
});

class PostgresRepository {
  private db: IDatabase<any>;
  public isConnected: boolean;

  constructor() {
    this.db = pgp(config.database.url);
    this.isConnected = false;
  }

  /**
   * Test database connection
   */
  async connect(): Promise<boolean> {
    try {
      await this.db.query('SELECT NOW()');
      this.isConnected = true;
      logger.info('Database connected successfully');
      return true;
    } catch (error) {
      const err = error as Error;
      logger.error('Database connection failed', { error: err.message });
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Close database connection
   */
  disconnect(): void {
    pgp.end();
    this.isConnected = false;
    logger.info('Database disconnected');
  }

  // =========================================================================
  // Feeder Operations
  // =========================================================================

  /**
   * Create a new feeder
   */
  async createFeeder(feederData: FeederCreateData): Promise<FeederData> {
    const { feeder_id, api_key_hash, name, location, metadata } = feederData;

    const query = `
      INSERT INTO feeders (feeder_id, api_key_hash, name, location, metadata)
      VALUES ($1, $2, $3, ST_GeogFromText($4), $5)
      RETURNING id, feeder_id, name, 
                ST_Y(location::geometry) as latitude, 
                ST_X(location::geometry) as longitude,
                status, metadata, created_at, updated_at, last_seen_at;
    `;

    const locationWKT = location
      ? `POINT(${location.longitude} ${location.latitude})`
      : null;

    try {
      const result = await this.db.one(query, [
        feeder_id,
        api_key_hash,
        name,
        locationWKT,
        JSON.stringify(metadata || {}),
      ]);

      logger.info('Feeder created', { feeder_id });
      return result as FeederData;
    } catch (error) {
      const err = error as Error;
      logger.error('Error creating feeder', {
        error: err.message,
        feeder_id,
      });
      throw error;
    }
  }

  /**
   * Get feeder by feeder_id
   */
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

  /**
   * Update feeder last_seen_at timestamp
   */
  async updateFeederLastSeen(feederId: string): Promise<void> {
    const query = `
      UPDATE feeders
      SET last_seen_at = NOW()
      WHERE feeder_id = $1;
    `;

    try {
      await this.db.none(query, [feederId]);
    } catch (error) {
      const err = error as Error;
      logger.error('Error updating feeder last seen', {
        error: err.message,
        feederId,
      });
      // Don't throw - this is non-critical
    }
  }

  /**
   * Update feeder status
   */
  async updateFeederStatus(feederId: string, status: 'active' | 'inactive' | 'suspended'): Promise<void> {
    const query = `
      UPDATE feeders
      SET status = $2
      WHERE feeder_id = $1;
    `;

    try {
      await this.db.none(query, [feederId, status]);
      logger.info('Feeder status updated', { feederId, status });
    } catch (error) {
      const err = error as Error;
      logger.error('Error updating feeder status', {
        error: err.message,
        feederId,
        status,
      });
      throw error;
    }
  }

  // =========================================================================
  // Feeder Statistics Operations
  // =========================================================================

  /**
   * Increment feeder stats for today
   */
  async incrementFeederStats(feederId: string, messageCount: number, uniqueAircraft: number): Promise<void> {
    const query = `
      INSERT INTO feeder_stats (feeder_id, date, messages_received, unique_aircraft)
      VALUES ($1, CURRENT_DATE, $2, $3)
      ON CONFLICT (feeder_id, date)
      DO UPDATE SET
        messages_received = feeder_stats.messages_received + $2,
        unique_aircraft = GREATEST(feeder_stats.unique_aircraft, $3);
    `;

    try {
      await this.db.none(query, [feederId, messageCount, uniqueAircraft]);
    } catch (error) {
      const err = error as Error;
      logger.error('Error incrementing feeder stats', {
        error: err.message,
        feederId,
      });
      // Don't throw - this is non-critical
    }
  }

  /**
   * Get feeder stats for a specific date
   */
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

  /**
   * Get feeder stats for last N days
   */
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

  // =========================================================================
  // Aircraft State Operations
  // =========================================================================

  /**
   * Upsert aircraft state (matching existing fly-overhead format)
   */
  async upsertAircraftState(state: OpenSkyState, feederId: string, sourcePriority: number = 30): Promise<void> {
    const query = `
      INSERT INTO aircraft_states(
        icao24, callsign, origin_country, time_position, last_contact,
        longitude, latitude, baro_altitude, on_ground, velocity,
        true_track, vertical_rate, sensors, geo_altitude, squawk,
        spi, position_source, category, created_at,
        data_source, feeder_id, source_priority, ingestion_timestamp
      )
      VALUES(
        $1, TRIM($2), $3, $4, $5, $6, $7, $8, $9, $10, 
        $11, $12, $13, $14, $15, $16, $17, $18, $19,
        'feeder', $20, $21, NOW()
      )
      ON CONFLICT(icao24) DO UPDATE SET
        callsign = TRIM(EXCLUDED.callsign),
        origin_country = EXCLUDED.origin_country,
        time_position = EXCLUDED.time_position,
        last_contact = EXCLUDED.last_contact,
        longitude = EXCLUDED.longitude,
        latitude = EXCLUDED.latitude,
        baro_altitude = EXCLUDED.baro_altitude,
        on_ground = EXCLUDED.on_ground,
        velocity = EXCLUDED.velocity,
        true_track = EXCLUDED.true_track,
        vertical_rate = EXCLUDED.vertical_rate,
        sensors = EXCLUDED.sensors,
        geo_altitude = EXCLUDED.geo_altitude,
        squawk = EXCLUDED.squawk,
        spi = EXCLUDED.spi,
        position_source = EXCLUDED.position_source,
        category = EXCLUDED.category,
        data_source = EXCLUDED.data_source,
        feeder_id = EXCLUDED.feeder_id,
        source_priority = EXCLUDED.source_priority,
        ingestion_timestamp = EXCLUDED.ingestion_timestamp
      WHERE aircraft_states.source_priority <= $21;
    `;

    try {
      await this.db.none(query, [
        ...state, // 19 items from OpenSky format
        feederId, // $20
        sourcePriority, // $21
      ]);
    } catch (error) {
      const err = error as Error;
      logger.error('Error upserting aircraft state', {
        error: err.message,
        icao24: state[0],
        feederId,
      });
      throw error;
    }
  }

  /**
   * Insert aircraft state into history table
   */
  async insertAircraftStateHistory(state: OpenSkyState, feederId: string, sourcePriority: number = 30): Promise<void> {
    // History table doesn't include created_at in the insert (uses DEFAULT)
    const historyState = state.slice(0, 18); // Remove created_at

    const query = `
      INSERT INTO aircraft_states_history (
        icao24, callsign, origin_country, time_position, last_contact,
        longitude, latitude, baro_altitude, on_ground, velocity,
        true_track, vertical_rate, sensors, geo_altitude, squawk,
        spi, position_source, category,
        data_source, feeder_id, source_priority
      )
      VALUES(
        $1, TRIM($2), $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18,
        'feeder', $19, $20
      );
    `;

    try {
      await this.db.none(query, [
        ...historyState, // 18 items
        feederId, // $19
        sourcePriority, // $20
      ]);
    } catch (error) {
      const err = error as Error;
      logger.error('Error inserting aircraft state history', {
        error: err.message,
        icao24: state[0],
        feederId,
      });
      throw error;
    }
  }

  /**
   * Batch upsert aircraft states
   */
  async batchUpsertAircraftStates(states: BatchState[], sourcePriority: number = 30): Promise<BatchUpsertResult> {
    const results: BatchUpsertResult = {
      success: 0,
      errors: 0,
      errorDetails: [],
    };

    // Process in batches
    const batchSize = config.dataProcessing.batchSize;
    for (let i = 0; i < states.length; i += batchSize) {
      const batch = states.slice(i, i + batchSize);

      const batchPromises = batch.map(async ({ state, feederId }) => {
        try {
          await this.upsertAircraftState(state, feederId, sourcePriority);
          await this.insertAircraftStateHistory(state, feederId, sourcePriority);
          results.success++;
        } catch (error) {
          const err = error as Error;
          results.errors++;
          results.errorDetails.push({
            icao24: state[0] as string,
            error: err.message,
          });
        }
      });

      await Promise.all(batchPromises);

      // Yield to event loop between batches
      if (i + batchSize < states.length) {
        await new Promise<void>((resolve) => setImmediate(() => resolve()));
      }
    }

    logger.info('Batch upsert completed', {
      total: states.length,
      success: results.success,
      errors: results.errors,
    });

    return results;
  }

  // =========================================================================
  // Health Check
  // =========================================================================

  /**
   * Check database health
   */
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

// Export singleton instance
export default new PostgresRepository();


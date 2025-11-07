import postgresRepository from '../repositories/PostgresRepository';
import logger from '../utils/logger';
import config from '../config';
import { validateAircraftStateBatch } from '../utils/validator';
import { transformToOpenSkyFormat } from '../utils/dataTransformer';
import { DataSubmissionPayload, DataSubmissionResponse, AircraftState, OpenSkyState } from '../types';

interface AppError extends Error {
  statusCode?: number;
  details?: any;
}

class DataIngestionService {
  private sourcePriority: number;

  constructor() {
    this.sourcePriority = 30; // Higher than OpenSky (20), same as websocket
  }

  /**
   * Ingest aircraft state data from a feeder
   */
  async ingestData(feederId: string, data: DataSubmissionPayload): Promise<DataSubmissionResponse> {
    const startTime = Date.now();

    // Validate input
    if (!data.states || !Array.isArray(data.states)) {
      const error = new Error('Invalid data format: states must be an array') as AppError;
      error.statusCode = 400;
      throw error;
    }

    if (data.states.length === 0) {
      return {
        success: true,
        processed: 0,
        errors: [],
        feeder_id: feederId,
      };
    }

    // Validate batch
    const { valid, errors: validationErrors } = validateAircraftStateBatch(data.states);

    if (!valid) {
      logger.warn('Validation errors in data submission', {
        feederId,
        errorCount: validationErrors.length,
        errors: validationErrors.slice(0, 10), // Log first 10 errors
      });

      const error = new Error('Invalid aircraft state data') as AppError;
      error.statusCode = 400;
      error.details = validationErrors;
      throw error;
    }

    // Check data age (reject stale data)
    const requestTimestamp = data.timestamp || Math.floor(Date.now() / 1000);
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const dataAge = currentTimestamp - requestTimestamp;

    if (dataAge > config.dataProcessing.maxDataAgeSeconds) {
      logger.warn('Rejecting stale data', {
        feederId,
        dataAge,
        maxAge: config.dataProcessing.maxDataAgeSeconds,
      });

      const error = new Error('Data is too old') as AppError;
      error.statusCode = 400;
      error.details = [
        {
          index: 0,
          field: 'timestamp',
          message: `Data age (${dataAge}s) exceeds maximum allowed (${config.dataProcessing.maxDataAgeSeconds}s)`,
        },
      ];
      throw error;
    }

    try {
      // Transform to OpenSky format
      const transformedStates = data.states
        .map((state) => {
          try {
            return {
              state: transformToOpenSkyFormat(state, feederId),
              feederId,
            };
          } catch (error) {
            const err = error as Error;
            logger.error('Error transforming aircraft state', {
              error: err.message,
              icao24: state.icao24,
              feederId,
            });
            return null;
          }
        })
        .filter((item): item is { state: OpenSkyState; feederId: string } => item !== null);

      if (transformedStates.length === 0) {
        return {
          success: false,
          processed: 0,
          errors: [{ icao24: undefined, error: 'All aircraft states failed transformation' }],
          feeder_id: feederId,
        };
      }

      // Batch insert into database
      const result = await postgresRepository.batchUpsertAircraftStates(
        transformedStates,
        this.sourcePriority
      );

      const processingTime = Date.now() - startTime;

      logger.info('Data ingestion completed', {
        feederId,
        submitted: data.states.length,
        processed: result.success,
        errors: result.errors,
        processingTimeMs: processingTime,
      });

      // Update stats (fire and forget)
      this.updateFeederStats(feederId, result.success, data.states.length).catch((err) => {
        logger.warn('Failed to update feeder stats', {
          error: err.message,
          feederId,
        });
      });

      return {
        success: result.errors === 0,
        processed: result.success,
        errors: result.errorDetails,
        feeder_id: feederId,
        processing_time_ms: processingTime,
      };
    } catch (error) {
      const err = error as Error;
      logger.error('Error ingesting data', {
        error: err.message,
        feederId,
        stateCount: data.states.length,
      });

      throw error;
    }
  }

  /**
   * Update feeder statistics
   */
  async updateFeederStats(feederId: string, messageCount: number, _totalSubmitted: number): Promise<void> {
    try {
      await postgresRepository.incrementFeederStats(
        feederId,
        messageCount,
        messageCount // Approximate unique aircraft count
      );
    } catch (error) {
      const err = error as Error;
      logger.error('Error updating feeder stats', {
        error: err.message,
        feederId,
      });
      // Don't throw - this is non-critical
    }
  }

  /**
   * Calculate data quality score
   */
  calculateDataQuality(states: AircraftState[]): number {
    if (states.length === 0) return 0;

    let qualityScore = 0;
    const weights = {
      hasPosition: 30,
      hasAltitude: 20,
      hasVelocity: 15,
      hasCallsign: 15,
      hasSquawk: 10,
      hasVerticalRate: 10,
    };

    states.forEach((state) => {
      let stateScore = 0;

      if (state.latitude !== null && state.longitude !== null) {
        stateScore += weights.hasPosition;
      }
      if (state.baro_altitude !== null || state.geo_altitude !== null) {
        stateScore += weights.hasAltitude;
      }
      if (state.velocity !== null) {
        stateScore += weights.hasVelocity;
      }
      if (state.callsign !== null) {
        stateScore += weights.hasCallsign;
      }
      if (state.squawk !== null) {
        stateScore += weights.hasSquawk;
      }
      if (state.vertical_rate !== null) {
        stateScore += weights.hasVerticalRate;
      }

      qualityScore += stateScore;
    });

    return Math.round(qualityScore / states.length);
  }
}

export default new DataIngestionService();


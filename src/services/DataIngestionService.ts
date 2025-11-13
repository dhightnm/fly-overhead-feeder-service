import logger from '../utils/logger';
import config from '../config';
import { validateAircraftStateBatch } from '../utils/validator';
import { transformToOpenSkyFormat } from '../utils/dataTransformer';
import { DataSubmissionPayload, DataSubmissionResponse, AircraftState, OpenSkyState } from '../types';
import axios, { AxiosError } from 'axios';

interface AppError extends Error {
  statusCode?: number;
  details?: any;
}

class DataIngestionService {
  async ingestData(feederId: string, data: DataSubmissionPayload, apiKey?: string): Promise<DataSubmissionResponse> {
    const startTime = Date.now();

    logger.info('📥 Data submission received from feeder', {
      feederId,
      aircraftCount: data.states?.length || 0,
      hasApiKey: !!apiKey,
      timestamp: data.timestamp || Math.floor(Date.now() / 1000),
    });

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

      // Forward to main service instead of writing directly to database
      const mainServiceUrl = `${config.mainService.url}${config.mainService.aircraftEndpoint}`;
      
      // Prepare payload for main service
      const payload = {
        feeder_id: feederId,
        timestamp: data.timestamp || Math.floor(Date.now() / 1000),
        states: transformedStates.map((item) => ({
          state: item.state,
          feeder_id: item.feederId,
        })),
      };

      let processed = 0;
      let errors: Array<{ icao24?: string; error: string }> = [];

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }
        
        logger.info('🚀 Forwarding data to main service', {
          feederId,
          stateCount: transformedStates.length,
          mainServiceUrl,
          hasAuthHeader: !!headers['Authorization'],
          apiKeyPrefix: apiKey ? apiKey.substring(0, 3) + '...' : 'none',
        });
        
        const response = await axios.post(mainServiceUrl, payload, {
          timeout: config.mainService.timeout,
          headers,
        });

        if (response.data && typeof response.data === 'object') {
          processed = response.data.processed || transformedStates.length;
          
          if (response.data.errors && Array.isArray(response.data.errors)) {
            errors = response.data.errors;
          }
        } else {
          processed = transformedStates.length;
        }

        const processingTime = Date.now() - startTime;

        logger.info('✅ Data successfully forwarded to main service', {
          feederId,
          submitted: data.states.length,
          processed,
          processingTimeMs: processingTime,
          mainServiceResponse: {
            status: response.status,
            processed: response.data?.processed,
            errors: response.data?.errors?.length || 0,
          },
          sampleAircraft: transformedStates.slice(0, 3).map(s => ({
            icao24: s.state[0],
            callsign: s.state[1] || null,
            alt: s.state[7] ? Math.round(s.state[7]) : null,
          })),
        });

        this.updateFeederStats(feederId, processed, data.states.length).catch(() => {});

        return {
          success: errors.length === 0,
          processed,
          errors,
          feeder_id: feederId,
          processing_time_ms: processingTime,
        };
      } catch (error) {
        const axiosError = error as AxiosError;

        if (axiosError.response) {
          logger.error('❌ Main service returned error', {
            feederId,
            status: axiosError.response.status,
            statusText: axiosError.response.statusText,
            data: axiosError.response.data,
            url: mainServiceUrl,
            hadAuthHeader: !!apiKey,
          });

          // Try to extract error details from response
          if (axiosError.response.data && typeof axiosError.response.data === 'object') {
            const errorData = axiosError.response.data as any;
            if (errorData.errors && Array.isArray(errorData.errors)) {
              errors = errorData.errors;
            } else if (errorData.error) {
              errors = [{ icao24: undefined, error: errorData.error }];
            }
          }

          if (axiosError.response.status === 400) {
            const appError = new Error('Main service rejected data') as AppError;
            appError.statusCode = 400;
            appError.details = errors.length > 0 ? errors : [{ icao24: undefined, error: 'Main service validation failed' }];
            throw appError;
          }
        } else if (axiosError.request) {
          logger.error('❌ Main service unavailable (network error)', {
            feederId,
            error: axiosError.message,
            code: axiosError.code,
            url: mainServiceUrl,
            timeout: config.mainService.timeout,
          });
        } else {
          logger.error('❌ Error setting up request to main service', {
            feederId,
            error: axiosError.message,
            stack: axiosError.stack,
          });
        }

        const appError = new Error('Main service unavailable') as AppError;
        appError.statusCode = 503;
        appError.details = errors.length > 0 ? errors : [{ icao24: undefined, error: 'Failed to forward data to main service' }];
        throw appError;
      }
    } catch (error) {
      const err = error as Error;
      if (err instanceof Error && (err as AppError).statusCode) {
        throw error;
      }
      logger.error('Error ingesting data', {
        error: err.message,
        feederId,
      });
      throw error;
    }
  }

  async updateFeederStats(feederId: string, messageCount: number, _totalSubmitted: number): Promise<void> {
    try {
      // Forward stats to main service
      const mainServiceUrl = `${config.mainService.url}${config.mainService.statsEndpoint}`;
      
      const payload = {
        feeder_id: feederId,
        messages_received: messageCount,
        unique_aircraft: messageCount, // Approximate unique aircraft count
      };

      await axios.post(mainServiceUrl, payload, {
        timeout: config.mainService.timeout,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      // Non-critical, silently fail
    }
  }

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


/**
 * Feeder Client SDK
 * 
 * A simple, plug-and-play SDK for connecting any ADS-B feeder to the fly-overhead service.
 * 
 * Usage:
 *   const client = new FeederClient({
 *     apiUrl: 'http://your-server:3006',
 *     apiKey: 'sk_live_...'
 *   });
 *   
 *   await client.submitAircraft(aircraftData);
 */

import axios, { AxiosInstance } from 'axios';
import { AircraftState, DataSubmissionPayload, DataSubmissionResponse } from './types';

export interface FeederClientConfig {
  apiUrl: string;
  apiKey: string;
  feederId?: string;
  timeout?: number;
  retryAttempts?: number;
  batchSize?: number;
}

export interface FeederInfo {
  feeder_id: string;
  name: string;
  status: string;
  stats?: {
    today: {
      messages_received: number;
      unique_aircraft: number;
    };
  };
}

export class FeederClient {
  private api: AxiosInstance;
  private config: Required<FeederClientConfig>;
  private batchQueue: AircraftState[] = [];
  private batchTimer: NodeJS.Timeout | null = null;

  constructor(config: FeederClientConfig) {
    this.config = {
      apiUrl: config.apiUrl.replace(/\/$/, ''), // Remove trailing slash
      apiKey: config.apiKey,
      feederId: config.feederId || '',
      timeout: config.timeout || 10000,
      retryAttempts: config.retryAttempts || 3,
      batchSize: config.batchSize || 50,
    };

    this.api = axios.create({
      baseURL: this.config.apiUrl,
      timeout: this.config.timeout,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'fly-overhead-feeder-client/1.0.0',
      },
    });
  }

  /**
   * Submit a single aircraft state
   */
  async submitAircraft(aircraft: AircraftState): Promise<DataSubmissionResponse> {
    return this.submitBatch([aircraft]);
  }

  /**
   * Submit multiple aircraft states
   */
  async submitBatch(aircraft: AircraftState[]): Promise<DataSubmissionResponse> {
    const payload: DataSubmissionPayload = {
      timestamp: Math.floor(Date.now() / 1000),
      states: aircraft,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
      try {
        const response = await this.api.post<DataSubmissionResponse>(
          '/api/feeder/aircraft',
          payload
        );
        return response.data;
      } catch (error: any) {
        lastError = error;
        
        // Don't retry on client errors (4xx)
        if (error.response?.status >= 400 && error.response?.status < 500) {
          throw error;
        }

        // Wait before retry (exponential backoff)
        if (attempt < this.config.retryAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw lastError || new Error('Failed to submit data after retries');
  }

  /**
   * Queue aircraft for batch submission (automatic batching)
   */
  queueAircraft(aircraft: AircraftState): void {
    this.batchQueue.push(aircraft);

    // Auto-flush when batch size reached
    if (this.batchQueue.length >= this.config.batchSize) {
      this.flushBatch();
      return;
    }

    // Auto-flush after 1 second if timer not set
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flushBatch();
      }, 1000);
    }
  }

  /**
   * Flush queued aircraft
   */
  async flushBatch(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.batchQueue.length === 0) {
      return;
    }

    const batch = [...this.batchQueue];
    this.batchQueue = [];

    try {
      await this.submitBatch(batch);
    } catch (error) {
      console.error('Batch submission failed:', error);
      // Could implement retry queue here
    }
  }

  /**
   * Get feeder information
   */
  async getInfo(): Promise<FeederInfo> {
    const response = await this.api.get<FeederInfo>('/api/v1/feeders/me');
    return response.data;
  }

  /**
   * Get feeder statistics
   */
  async getStats(days: number = 7): Promise<any> {
    const response = await this.api.get(`/api/v1/feeders/me/stats?days=${days}`);
    return response.data;
  }

  /**
   * Get feeder health status
   */
  async getHealth(): Promise<any> {
    const response = await this.api.get('/api/v1/feeders/me/health');
    return response.data;
  }

  /**
   * Test connection to server
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.api.get('/health');
      return response.status === 200;
    } catch {
      return false;
    }
  }
}

/**
 * Register a new feeder and get client instance
 */
export async function registerAndCreateClient(
  apiUrl: string,
  registrationData: {
    name: string;
    location?: { latitude: number; longitude: number };
    metadata?: Record<string, any>;
  }
): Promise<{ client: FeederClient; feederId: string; apiKey: string }> {
  const response = await axios.post(`${apiUrl}/api/v1/feeders/register`, registrationData);
  const { feeder_id, api_key } = response.data;

  const client = new FeederClient({
    apiUrl,
    apiKey: api_key,
    feederId: feeder_id,
  });

  return {
    client,
    feederId: feeder_id,
    apiKey: api_key,
  };
}

export default FeederClient;


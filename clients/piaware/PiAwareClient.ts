/**
 * Pre-configured PiAware Client
 * Ready-to-use client for PiAware installations
 */

import axios from 'axios';
import { FeederClient } from '../sdk/FeederClient';
import { AircraftState } from '../../src/types';

interface Dump1090Aircraft {
  hex: string;
  flight?: string;
  lat?: number;
  lon?: number;
  altitude?: number;
  alt_geom?: number;
  gs?: number;
  track?: number;
  vert_rate?: number;
  squawk?: string;
  category?: string;
  seen_pos?: number;
  seen?: number;
  alt_baro?: number | 'ground';
}

interface PiAwareConfig {
  apiUrl: string;
  apiKey: string;
  dump1090Url?: string;
  pollInterval?: number;
}

export class PiAwareClient {
  private feederClient: FeederClient;
  private config: Required<PiAwareConfig>;
  private stats = {
    totalPolls: 0,
    totalSubmissions: 0,
    totalAircraft: 0,
    errors: 0,
  };

  constructor(config: PiAwareConfig) {
    this.config = {
      apiUrl: config.apiUrl,
      apiKey: config.apiKey,
      dump1090Url: config.dump1090Url || 'http://127.0.0.1:8080/data/aircraft.json',
      pollInterval: config.pollInterval || 5000,
    };

    this.feederClient = new FeederClient({
      apiUrl: this.config.apiUrl,
      apiKey: this.config.apiKey,
    });
  }

  /**
   * Transform dump1090 aircraft to API format
   */
  private transformAircraft(aircraft: Dump1090Aircraft): AircraftState {
    let category = null;
    if (aircraft.category) {
      const parsed = parseInt(aircraft.category, 16);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 19) {
        category = parsed;
      }
    }

    // Handle barometric altitude: prefer alt_baro (if numeric), fallback to altitude
    let baro_altitude_feet: number | null = null;
    if (aircraft.alt_baro !== undefined && aircraft.alt_baro !== 'ground' && typeof aircraft.alt_baro === 'number') {
      baro_altitude_feet = aircraft.alt_baro;
    } else if (aircraft.altitude !== undefined) {
      baro_altitude_feet = aircraft.altitude;
    }

    return {
      icao24: aircraft.hex,
      callsign: aircraft.flight ? aircraft.flight.trim() : null,
      latitude: aircraft.lat !== undefined ? aircraft.lat : null,
      longitude: aircraft.lon !== undefined ? aircraft.lon : null,
      baro_altitude: baro_altitude_feet !== null ? baro_altitude_feet * 0.3048 : null,
      geo_altitude: aircraft.alt_geom !== undefined ? aircraft.alt_geom * 0.3048 : null,
      velocity: aircraft.gs !== undefined ? aircraft.gs * 0.514444 : null,
      true_track: aircraft.track !== undefined ? aircraft.track : null,
      vertical_rate: aircraft.vert_rate !== undefined ? aircraft.vert_rate * 0.00508 : null,
      squawk: aircraft.squawk || null,
      on_ground: aircraft.alt_baro === 'ground',
      category: category,
      time_position: aircraft.seen_pos !== undefined ? Math.floor(Date.now() / 1000 - aircraft.seen_pos) : null,
      last_contact: aircraft.seen !== undefined ? Math.floor(Date.now() / 1000 - aircraft.seen) : Math.floor(Date.now() / 1000),
      spi: false,
      position_source: 0,
    };
  }

  /**
   * Fetch aircraft data from dump1090
   */
  private async fetchAircraft(): Promise<Dump1090Aircraft[]> {
    try {
      const response = await axios.get(this.config.dump1090Url, {
        timeout: 5000,
      });
      return response.data.aircraft || [];
    } catch (error) {
      throw new Error(`Failed to fetch from dump1090: ${(error as Error).message}`);
    }
  }

  /**
   * Poll and submit aircraft data
   */
  async pollAndSubmit(): Promise<void> {
    this.stats.totalPolls++;

    try {
      const aircraft = await this.fetchAircraft();
      
      if (aircraft.length === 0) {
        return;
      }

      // Transform and filter aircraft with position
      const states = aircraft
        .filter(ac => ac.lat !== undefined && ac.lon !== undefined)
        .map((ac) => this.transformAircraft(ac));

      if (states.length === 0) {
        return;
      }

      // Submit to feeder service
      const result = await this.feederClient.submitBatch(states);

      this.stats.totalSubmissions++;
      this.stats.totalAircraft += result.processed;

      console.log(`✓ Submitted ${result.processed} aircraft (${this.stats.totalAircraft} total)`);

      if (result.errors && result.errors.length > 0) {
        console.warn(`⚠ ${result.errors.length} errors`);
      }
    } catch (error) {
      this.stats.errors++;
      console.error(`✗ Error: ${(error as Error).message}`);
    }
  }

  private pollInterval: NodeJS.Timeout | null = null;
  private statsInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  /**
   * Start continuous polling
   */
  start(): void {
    if (this.isRunning) {
      console.warn('Client is already running');
      return;
    }

    this.isRunning = true;
    console.log('PiAware Feeder Client');
    console.log('=====================');
    console.log(`Server: ${this.config.apiUrl}`);
    console.log(`dump1090: ${this.config.dump1090Url}`);
    console.log(`Poll interval: ${this.config.pollInterval}ms`);
    console.log('');

    // Initial poll (non-blocking)
    this.pollAndSubmit().catch(() => {});

    // Set up interval
    this.pollInterval = setInterval(() => {
      this.pollAndSubmit().catch(() => {});
    }, this.config.pollInterval);

    // Print stats every minute
    this.statsInterval = setInterval(() => {
      console.log('\n--- Statistics ---');
      console.log(`Polls: ${this.stats.totalPolls}`);
      console.log(`Submissions: ${this.stats.totalSubmissions}`);
      console.log(`Aircraft: ${this.stats.totalAircraft}`);
      console.log(`Errors: ${this.stats.errors}`);
      console.log('------------------\n');
    }, 60000);
  }

  /**
   * Stop polling
   */
  stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return { ...this.stats };
  }
}

// CLI entry point
if (require.main === module) {
  const apiUrl = process.env.FEEDER_API_URL || 'http://localhost:3006';
  const apiKey = process.env.FEEDER_API_KEY;

  if (!apiKey) {
    console.error('Error: FEEDER_API_KEY environment variable required');
    console.error('Get your API key by registering at:', apiUrl);
    process.exit(1);
  }

  const client = new PiAwareClient({
    apiUrl,
    apiKey,
    dump1090Url: process.env.DUMP1090_URL || 'http://127.0.0.1:8080/data/aircraft.json',
    pollInterval: parseInt(process.env.POLL_INTERVAL_MS || '5000', 10),
  });

  client.start();

  // Graceful shutdown
  const shutdown = (signal: string) => {
    console.log(`\n${signal} received, shutting down...`);
    client.stop();
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught exceptions to prevent crashes
  process.on('uncaughtException', (error: Error) => {
    console.error('Uncaught exception:', error.message);
    // Don't exit - let systemd restart us
  });

  process.on('unhandledRejection', (reason: unknown) => {
    console.error('Unhandled rejection:', reason);
    // Don't exit - continue running
  });
}

export default PiAwareClient;


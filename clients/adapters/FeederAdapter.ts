/**
 * Universal Feeder Adapter
 * 
 * Automatically detects and adapts to different feeder types
 */

import axios from 'axios';
import { FeederClient } from '../sdk/FeederClient';
import { AircraftState } from '../../src/types';

export type FeederType = 'piaware' | 'dump1090' | 'adsbexchange' | 'custom';

export interface FeederAdapter {
  type: FeederType;
  name: string;
  detect(): Promise<boolean>;
  fetchAircraft(): Promise<AircraftState[]>;
  getConfig(): Record<string, any>;
}

export class FeederAdapterFactory {
  /**
   * Auto-detect feeder type
   */
  static async detectFeederType(): Promise<FeederType | null> {
    // Check PiAware/dump1090 (port 8080)
    try {
      const response = await axios.get('http://127.0.0.1:8080/data/aircraft.json', { timeout: 2000 });
      if (response.data && Array.isArray(response.data.aircraft)) {
        return 'piaware';
      }
    } catch {}

    // Check tar1090/ADSBExchange
    try {
      const response = await axios.get('http://127.0.0.1:8080/tar1090/data/aircraft.json', { timeout: 2000 });
      if (response.data && Array.isArray(response.data.aircraft)) {
        return 'adsbexchange';
      }
    } catch {}

    return null;
  }

  /**
   * Create adapter for detected feeder type
   */
  static async createAdapter(type?: FeederType): Promise<FeederAdapter | null> {
    const detectedType = type || await this.detectFeederType();
    
    if (!detectedType) {
      return null;
    }

    switch (detectedType) {
      case 'piaware':
      case 'dump1090':
        return new PiAwareAdapter();
      case 'adsbexchange':
        return new ADSBExchangeAdapter();
      default:
        return null;
    }
  }
}

class PiAwareAdapter implements FeederAdapter {
  type: FeederType = 'piaware';
  name = 'PiAware / dump1090';
  private url = 'http://127.0.0.1:8080/data/aircraft.json';

  async detect(): Promise<boolean> {
    try {
      const response = await axios.get(this.url, { timeout: 2000 });
      return response.data && Array.isArray(response.data.aircraft);
    } catch {
      return false;
    }
  }

  async fetchAircraft(): Promise<AircraftState[]> {
    const response = await axios.get(this.url, { timeout: 5000 });
    const aircraft = response.data.aircraft || [];
    
    return aircraft
      .filter((ac: any) => ac.lat !== undefined && ac.lon !== undefined)
      .map((ac: any) => this.transform(ac));
  }

  private transform(aircraft: any): AircraftState {
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

  getConfig(): Record<string, any> {
    return {
      url: this.url,
      type: this.type,
    };
  }
}

class ADSBExchangeAdapter implements FeederAdapter {
  type: FeederType = 'adsbexchange';
  name = 'ADSBExchange / tar1090';
  private url = 'http://127.0.0.1:8080/tar1090/data/aircraft.json';

  async detect(): Promise<boolean> {
    try {
      const response = await axios.get(this.url, { timeout: 2000 });
      return response.data && Array.isArray(response.data.aircraft);
    } catch {
      return false;
    }
  }

  async fetchAircraft(): Promise<AircraftState[]> {
    // Similar to PiAware but may have different field names
    const response = await axios.get(this.url, { timeout: 5000 });
    const aircraft = response.data.aircraft || [];
    
    return aircraft
      .filter((ac: any) => ac.lat !== undefined && ac.lon !== undefined)
      .map((ac: any) => this.transform(ac));
  }

  private transform(aircraft: any): AircraftState {
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

  getConfig(): Record<string, any> {
    return {
      url: this.url,
      type: this.type,
    };
  }
}

export default FeederAdapterFactory;


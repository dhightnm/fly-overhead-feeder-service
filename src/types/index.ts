// Type definitions for the feeder service

import { Request } from 'express';

export interface AircraftState {
  icao24: string;
  callsign?: string | null;
  origin_country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  baro_altitude?: number | null;
  geo_altitude?: number | null;
  velocity?: number | null;
  true_track?: number | null;
  vertical_rate?: number | null;
  sensors?: number[] | null;
  squawk?: string | null;
  on_ground?: boolean;
  spi?: boolean;
  position_source?: number;
  category?: number | null;
  time_position?: number | null;
  last_contact: number;
}

export interface FeederRegistrationData {
  name: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  metadata?: Record<string, any>;
}

export interface FeederData {
  id: number;
  feeder_id: string;
  api_key_hash: string;
  name: string;
  latitude?: number;
  longitude?: number;
  status: 'active' | 'inactive' | 'suspended';
  tier?: 'production' | 'standard' | 'premium'; // API tier for rate limiting
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
  last_seen_at?: Date | null;
}

export interface DataSubmissionPayload {
  timestamp?: number;
  states: AircraftState[];
}

export interface DataSubmissionResponse {
  success: boolean;
  processed: number;
  errors: Array<{
    icao24?: string;
    error: string;
  }>;
  feeder_id: string;
  processing_time_ms?: number;
}

export interface FeederStats {
  today: {
    messages_received: number;
    unique_aircraft: number;
  };
  last_24h: {
    messages_received: number;
    unique_aircraft: number;
  };
}

export interface ValidationError {
  index: number;
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface OpenSkyState extends Array<any> {
  0: string; // icao24
  1: string | null; // callsign
  2: string | null; // origin_country
  3: number | null; // time_position
  4: number; // last_contact
  5: number | null; // longitude
  6: number | null; // latitude
  7: number | null; // baro_altitude
  8: boolean; // on_ground
  9: number | null; // velocity
  10: number | null; // true_track
  11: number | null; // vertical_rate
  12: number[] | null; // sensors
  13: number | null; // geo_altitude
  14: string | null; // squawk
  15: boolean; // spi
  16: number; // position_source
  17: number | null; // category
  18: Date; // created_at
}

export interface Dump1090Aircraft {
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
  alt_baro?: string | number;
  category?: string;
  seen_pos?: number;
  seen?: number;
}

export interface Config {
  port: number;
  host: string;
  nodeEnv: string;
  database: {
    url: string;
    pool: {
      min: number;
      max: number;
    };
  };
  security: {
    apiKeySecret: string;
    bcryptRounds: number;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
    tiers: {
      production: number;
      standard: number;
      premium: number;
    };
  };
  dataProcessing: {
    batchSize: number;
    batchIntervalMs: number;
    maxDataAgeSeconds: number;
  };
  mainService: {
    url: string;
    aircraftEndpoint: string;
    registerEndpoint: string;
    statsEndpoint: string;
    lastSeenEndpoint: string;
    authEndpoint: string;
    loginEndpoint: string;
    googleAuthEndpoint: string;
    timeout: number;
  };
  queue: {
    redisUrl: string;
    useQueue: boolean;
  };
  logging: {
    level: string;
  };
}

export interface ExpressRequest extends Request {
  feeder?: {
    id: number;
    feeder_id: string;
    name: string;
    status: 'active' | 'inactive' | 'suspended';
    tier?: 'production' | 'standard' | 'premium';
  };
}

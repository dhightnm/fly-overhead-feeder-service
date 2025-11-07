// Type definitions for the feeder SDK

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


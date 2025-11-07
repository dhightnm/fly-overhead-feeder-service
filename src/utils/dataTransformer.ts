import logger from './logger';
import { AircraftState, OpenSkyState, Dump1090Aircraft } from '../types';

/**
 * Transform JSON aircraft state to OpenSky extended format (19-item array)
 * 
 * Format matches the existing fly-overhead system:
 * [0: icao24, 1: callsign, 2: origin_country, 3: time_position, 4: last_contact,
 *  5: longitude, 6: latitude, 7: baro_altitude, 8: on_ground, 9: velocity,
 *  10: true_track, 11: vertical_rate, 12: sensors, 13: geo_altitude, 14: squawk,
 *  15: spi, 16: position_source, 17: category, 18: created_at]
 */
export function transformToOpenSkyFormat(state: AircraftState, _feederId: string | null = null): OpenSkyState {
  try {
    // Normalize and validate ICAO24
    const icao24 = state.icao24 ? state.icao24.toLowerCase().trim() : null;
    if (!icao24) {
      throw new Error('ICAO24 is required');
    }

    // Normalize callsign (trim and uppercase)
    const callsign = state.callsign ? state.callsign.trim().toUpperCase() : null;

    // Origin country (can be derived from ICAO24 prefix or set to null)
    const origin_country = state.origin_country || null;

    // Timestamps (Unix seconds)
    const time_position = state.time_position || null;
    const last_contact = state.last_contact || Math.floor(Date.now() / 1000);

    // Position
    const longitude = state.longitude !== undefined ? state.longitude : null;
    const latitude = state.latitude !== undefined ? state.latitude : null;

    // Altitudes (in meters)
    const baro_altitude = state.baro_altitude !== undefined ? state.baro_altitude : null;
    const geo_altitude = state.geo_altitude !== undefined ? state.geo_altitude : null;

    // On ground
    const on_ground = state.on_ground === true;

    // Velocity (m/s)
    const velocity = state.velocity !== undefined ? state.velocity : null;

    // Track (degrees)
    const true_track = state.true_track !== undefined ? state.true_track : null;

    // Vertical rate (m/s)
    const vertical_rate = state.vertical_rate !== undefined ? state.vertical_rate : null;

    // Sensors (array of sensor IDs)
    const sensors = state.sensors || null;

    // Squawk (4-digit code)
    const squawk = state.squawk || null;

    // Special Position Identification
    const spi = state.spi === true;

    // Position source (0-3)
    let position_source = state.position_source !== undefined ? state.position_source : 0;
    if (position_source < 0 || position_source > 3) {
      logger.warn('Invalid position_source, defaulting to 0', {
        icao24,
        position_source: state.position_source,
      });
      position_source = 0;
    }

    // Category (0-19)
    let category = state.category !== undefined ? state.category : null;
    if (category !== null && (typeof category !== 'number' || category < 0 || category > 19)) {
      logger.warn('Invalid category value, setting to null', {
        icao24,
        invalidCategory: category,
      });
      category = null;
    }

    // Created timestamp (appended, not part of original OpenSky format)
    const created_at = new Date();

    // Construct the 19-item array
    return [
      icao24,           // 0
      callsign,         // 1
      origin_country,   // 2
      time_position,    // 3
      last_contact,     // 4
      longitude,        // 5
      latitude,         // 6
      baro_altitude,    // 7
      on_ground,        // 8
      velocity,         // 9
      true_track,       // 10
      vertical_rate,    // 11
      sensors,          // 12
      geo_altitude,     // 13
      squawk,           // 14
      spi,              // 15
      position_source,  // 16
      category,         // 17
      created_at,       // 18
    ] as OpenSkyState;
  } catch (error) {
    const err = error as Error;
    logger.error('Error transforming aircraft state', {
      error: err.message,
      state: JSON.stringify(state),
    });
    throw error;
  }
}

/**
 * Convert feet to meters
 */
export function feetToMeters(feet: number): number {
  return feet * 0.3048;
}

/**
 * Convert knots to meters per second
 */
export function knotsToMetersPerSecond(knots: number): number {
  return knots * 0.514444;
}

/**
 * Convert feet per minute to meters per second
 */
export function feetPerMinuteToMetersPerSecond(fpm: number): number {
  return fpm * 0.00508;
}

/**
 * Transform dump1090 JSON format to our API format
 * Used for PiAware integration
 */
export function transformDump1090ToApiFormat(aircraft: Dump1090Aircraft): AircraftState {
  return {
    icao24: aircraft.hex,
    callsign: aircraft.flight ? aircraft.flight.trim() : null,
    latitude: aircraft.lat !== undefined ? aircraft.lat : null,
    longitude: aircraft.lon !== undefined ? aircraft.lon : null,
    baro_altitude: aircraft.altitude !== undefined ? feetToMeters(aircraft.altitude) : null,
    geo_altitude: aircraft.alt_geom !== undefined ? feetToMeters(aircraft.alt_geom) : null,
    velocity: aircraft.gs !== undefined ? knotsToMetersPerSecond(aircraft.gs) : null,
    true_track: aircraft.track !== undefined ? aircraft.track : null,
    vertical_rate: aircraft.vert_rate !== undefined ? feetPerMinuteToMetersPerSecond(aircraft.vert_rate) : null,
    squawk: aircraft.squawk || null,
    on_ground: aircraft.alt_baro === 'ground',
    category: aircraft.category ? parseInt(aircraft.category, 16) : null,
    time_position: aircraft.seen_pos !== undefined ? Math.floor(Date.now() / 1000 - aircraft.seen_pos) : null,
    last_contact: aircraft.seen !== undefined ? Math.floor(Date.now() / 1000 - aircraft.seen) : Math.floor(Date.now() / 1000),
    spi: false,
    position_source: 0,
  };
}


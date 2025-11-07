import logger from './logger';
import { AircraftState, OpenSkyState, Dump1090Aircraft } from '../types';

export function transformToOpenSkyFormat(state: AircraftState, _feederId: string | null = null): OpenSkyState {
  try {
    const icao24 = state.icao24 ? state.icao24.toLowerCase().trim() : null;
    if (!icao24) {
      throw new Error('ICAO24 is required');
    }

    const callsign = state.callsign ? state.callsign.trim().toUpperCase() : null;
    const origin_country = state.origin_country || null;
    const time_position = state.time_position || null;
    const last_contact = state.last_contact || Math.floor(Date.now() / 1000);
    const longitude = state.longitude !== undefined ? state.longitude : null;
    const latitude = state.latitude !== undefined ? state.latitude : null;
    const geo_altitude = state.geo_altitude !== undefined ? state.geo_altitude : null;
    
    // Use geo_altitude as fallback for baro_altitude if baro_altitude is null/undefined
    let baro_altitude = state.baro_altitude !== undefined && state.baro_altitude !== null 
      ? state.baro_altitude 
      : null;
    
    if (baro_altitude === null && geo_altitude !== null) {
      baro_altitude = geo_altitude;
      logger.debug('Using geo_altitude as fallback for baro_altitude', {
        icao24,
        geo_altitude,
      });
    }
    const on_ground = state.on_ground === true;
    const velocity = state.velocity !== undefined ? state.velocity : null;
    const true_track = state.true_track !== undefined ? state.true_track : null;
    const vertical_rate = state.vertical_rate !== undefined ? state.vertical_rate : null;
    const sensors = state.sensors || null;
    const squawk = state.squawk || null;
    const spi = state.spi === true;

    let position_source = state.position_source !== undefined ? state.position_source : 0;
    if (position_source < 0 || position_source > 3) {
      position_source = 0;
    }

    let category = state.category !== undefined ? state.category : null;
    if (category !== null && (typeof category !== 'number' || category < 0 || category > 19)) {
      category = null;
    }

    return [
      icao24,
      callsign,
      origin_country,
      time_position,
      last_contact,
      longitude,
      latitude,
      baro_altitude,
      on_ground,
      velocity,
      true_track,
      vertical_rate,
      sensors,
      geo_altitude,
      squawk,
      spi,
      position_source,
      category,
      new Date(),
    ] as OpenSkyState;
  } catch (error) {
    const err = error as Error;
    logger.error('Error transforming aircraft state', {
      error: err.message,
      icao24: state.icao24,
    });
    throw error;
  }
}

export function feetToMeters(feet: number): number {
  return feet * 0.3048;
}

export function knotsToMetersPerSecond(knots: number): number {
  return knots * 0.514444;
}

export function feetPerMinuteToMetersPerSecond(fpm: number): number {
  return fpm * 0.00508;
}

export function transformDump1090ToApiFormat(aircraft: Dump1090Aircraft): AircraftState {
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
    baro_altitude: baro_altitude_feet !== null ? feetToMeters(baro_altitude_feet) : null,
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


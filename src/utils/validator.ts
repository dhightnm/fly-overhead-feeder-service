import { AircraftState, FeederRegistrationData, ValidationResult, ValidationError } from '../types';

/**
 * Validation rules and helpers for aircraft state data
 */

interface ValidationRules {
  latitude: { min: number; max: number };
  longitude: { min: number; max: number };
  altitude: { min: number; max: number };
  velocity: { min: number; max: number };
  true_track: { min: number; max: number };
  vertical_rate: { min: number; max: number };
  category: { min: number; max: number };
  position_source: { min: number; max: number };
  squawk: RegExp;
  icao24: RegExp;
  callsign: RegExp;
}

export const VALIDATION_RULES: ValidationRules = {
  latitude: { min: -90, max: 90 },
  longitude: { min: -180, max: 180 },
  altitude: { min: -1500, max: 60000 }, // meters (allows below sea level, up to ~200k feet)
  velocity: { min: 0, max: 1500 }, // m/s (allows up to Mach 4+)
  true_track: { min: 0, max: 360 },
  vertical_rate: { min: -100, max: 100 }, // m/s
  category: { min: 0, max: 19 },
  position_source: { min: 0, max: 3 },
  squawk: /^[0-7]{4}$/, // 4-digit octal
  icao24: /^[0-9a-fA-F]{6}$/, // 6-character hex
  callsign: /^[A-Z0-9]{1,8}$/i, // Alphanumeric, max 8 chars
};

export function validateAircraftState(state: AircraftState, index: number = 0): ValidationResult {
  const errors: ValidationError[] = [];

  if (!state.icao24) {
    errors.push({
      index,
      field: 'icao24',
      message: 'ICAO24 is required',
    });
  } else if (!VALIDATION_RULES.icao24.test(state.icao24)) {
    errors.push({
      index,
      field: 'icao24',
      message: 'ICAO24 must be 6 hexadecimal characters',
    });
  }

  if (state.latitude !== null && state.latitude !== undefined) {
    if (
      typeof state.latitude !== 'number' ||
      state.latitude < VALIDATION_RULES.latitude.min ||
      state.latitude > VALIDATION_RULES.latitude.max
    ) {
      errors.push({
        index,
        field: 'latitude',
        message: `Latitude must be between ${VALIDATION_RULES.latitude.min} and ${VALIDATION_RULES.latitude.max}`,
      });
    }
  }

  if (state.longitude !== null && state.longitude !== undefined) {
    if (
      typeof state.longitude !== 'number' ||
      state.longitude < VALIDATION_RULES.longitude.min ||
      state.longitude > VALIDATION_RULES.longitude.max
    ) {
      errors.push({
        index,
        field: 'longitude',
        message: `Longitude must be between ${VALIDATION_RULES.longitude.min} and ${VALIDATION_RULES.longitude.max}`,
      });
    }
  }

  if (state.baro_altitude !== null && state.baro_altitude !== undefined) {
    if (
      typeof state.baro_altitude !== 'number' ||
      state.baro_altitude < VALIDATION_RULES.altitude.min ||
      state.baro_altitude > VALIDATION_RULES.altitude.max
    ) {
      errors.push({
        index,
        field: 'baro_altitude',
        message: `Barometric altitude must be between ${VALIDATION_RULES.altitude.min} and ${VALIDATION_RULES.altitude.max} meters`,
      });
    }
  }

  if (state.geo_altitude !== null && state.geo_altitude !== undefined) {
    if (
      typeof state.geo_altitude !== 'number' ||
      state.geo_altitude < VALIDATION_RULES.altitude.min ||
      state.geo_altitude > VALIDATION_RULES.altitude.max
    ) {
      errors.push({
        index,
        field: 'geo_altitude',
        message: `Geometric altitude must be between ${VALIDATION_RULES.altitude.min} and ${VALIDATION_RULES.altitude.max} meters`,
      });
    }
  }

  if (state.velocity !== null && state.velocity !== undefined) {
    if (
      typeof state.velocity !== 'number' ||
      state.velocity < VALIDATION_RULES.velocity.min ||
      state.velocity > VALIDATION_RULES.velocity.max
    ) {
      errors.push({
        index,
        field: 'velocity',
        message: `Velocity must be between ${VALIDATION_RULES.velocity.min} and ${VALIDATION_RULES.velocity.max} m/s`,
      });
    }
  }

  if (state.true_track !== null && state.true_track !== undefined) {
    if (
      typeof state.true_track !== 'number' ||
      state.true_track < VALIDATION_RULES.true_track.min ||
      state.true_track > VALIDATION_RULES.true_track.max
    ) {
      errors.push({
        index,
        field: 'true_track',
        message: `True track must be between ${VALIDATION_RULES.true_track.min} and ${VALIDATION_RULES.true_track.max} degrees`,
      });
    }
  }

  if (state.vertical_rate !== null && state.vertical_rate !== undefined) {
    if (
      typeof state.vertical_rate !== 'number' ||
      state.vertical_rate < VALIDATION_RULES.vertical_rate.min ||
      state.vertical_rate > VALIDATION_RULES.vertical_rate.max
    ) {
      errors.push({
        index,
        field: 'vertical_rate',
        message: `Vertical rate must be between ${VALIDATION_RULES.vertical_rate.min} and ${VALIDATION_RULES.vertical_rate.max} m/s`,
      });
    }
  }

  if (state.category !== null && state.category !== undefined) {
    if (
      typeof state.category !== 'number' ||
      state.category < VALIDATION_RULES.category.min ||
      state.category > VALIDATION_RULES.category.max
    ) {
      errors.push({
        index,
        field: 'category',
        message: `Category must be between ${VALIDATION_RULES.category.min} and ${VALIDATION_RULES.category.max}`,
      });
    }
  }

  if (state.position_source !== null && state.position_source !== undefined) {
    if (
      typeof state.position_source !== 'number' ||
      state.position_source < VALIDATION_RULES.position_source.min ||
      state.position_source > VALIDATION_RULES.position_source.max
    ) {
      errors.push({
        index,
        field: 'position_source',
        message: `Position source must be between ${VALIDATION_RULES.position_source.min} and ${VALIDATION_RULES.position_source.max}`,
      });
    }
  }

  if (state.squawk !== null && state.squawk !== undefined) {
    if (typeof state.squawk !== 'string' || !VALIDATION_RULES.squawk.test(state.squawk)) {
      errors.push({
        index,
        field: 'squawk',
        message: 'Squawk must be a 4-digit octal code (0-7)',
      });
    }
  }

  if (state.callsign !== null && state.callsign !== undefined) {
    if (typeof state.callsign !== 'string' || !VALIDATION_RULES.callsign.test(state.callsign)) {
      errors.push({
        index,
        field: 'callsign',
        message: 'Callsign must be alphanumeric, max 8 characters',
      });
    }
  }

  if (state.time_position !== null && state.time_position !== undefined) {
    if (typeof state.time_position !== 'number' || state.time_position < 0) {
      errors.push({
        index,
        field: 'time_position',
        message: 'Time position must be a positive Unix timestamp',
      });
    }
  }

  if (state.last_contact !== null && state.last_contact !== undefined) {
    if (typeof state.last_contact !== 'number' || state.last_contact < 0) {
      errors.push({
        index,
        field: 'last_contact',
        message: 'Last contact must be a positive Unix timestamp',
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateAircraftStateBatch(states: AircraftState[]): ValidationResult {
  if (!Array.isArray(states)) {
    return {
      valid: false,
      errors: [{ index: 0, field: 'states', message: 'States must be an array' }],
    };
  }

  if (states.length === 0) {
    return {
      valid: false,
      errors: [{ index: 0, field: 'states', message: 'States array cannot be empty' }],
    };
  }

  const allErrors: ValidationError[] = [];

  states.forEach((state, index) => {
    const { valid, errors } = validateAircraftState(state, index);
    if (!valid) {
      allErrors.push(...errors);
    }
  });

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
  };
}

export function validateFeederRegistration(data: FeederRegistrationData): ValidationResult {
  const errors: ValidationError[] = [];

  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    errors.push({
      index: 0,
      field: 'name',
      message: 'Name is required and must be a non-empty string',
    });
  }

  if (data.location) {
    if (
      typeof data.location.latitude !== 'number' ||
      data.location.latitude < -90 ||
      data.location.latitude > 90
    ) {
      errors.push({
        index: 0,
        field: 'location.latitude',
        message: 'Latitude must be between -90 and 90',
      });
    }

    if (
      typeof data.location.longitude !== 'number' ||
      data.location.longitude < -180 ||
      data.location.longitude > 180
    ) {
      errors.push({
        index: 0,
        field: 'location.longitude',
        message: 'Longitude must be between -180 and 180',
      });
    }
  }

  if (data.metadata && typeof data.metadata !== 'object') {
    errors.push({
      index: 0,
      field: 'metadata',
      message: 'Metadata must be an object',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}


#!/usr/bin/env node

/**
 * PiAware Feeder Client for fly-overhead
 * 
 * This script polls data from dump1090 and submits it to your feeder service.
 * 
 * Configuration:
 * - FEEDER_API_URL: Your feeder service URL (default: http://YOUR_SERVER_IP:3006)
 * - FEEDER_API_KEY: Your API key from registration
 * - DUMP1090_URL: dump1090 JSON endpoint (default: http://127.0.0.1:8080/data/aircraft.json)
 */

const axios = require('axios');

// ============================================================================
// CONFIGURATION - Update these values!
// ============================================================================

// Replace with your server's IP address or hostname
const YOUR_SERVER_IP = '192.168.58.11'; // Machine 2 - Feeder Service IP

const config = {
  feederApiUrl: process.env.FEEDER_API_URL || `http://${YOUR_SERVER_IP}:3006/api/v1/feeders/data`,
  apiKey: process.env.FEEDER_API_KEY || 'sk_live_e4a49efddf0cef69ded52b6e37e519ec39f405b764c81aa8dcabc3fdd6230c60',
  dump1090Url: process.env.DUMP1090_URL || 'http://127.0.0.1:8080/data/aircraft.json',
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS, 10) || 5000,
  minAircraftForSubmission: parseInt(process.env.MIN_AIRCRAFT, 10) || 1,
};

// ============================================================================
// Client Code (no changes needed below)
// ============================================================================

if (!config.apiKey || config.apiKey === 'YOUR_API_KEY_HERE') {
  console.error('Error: FEEDER_API_KEY must be set');
  console.error('Set it as environment variable: export FEEDER_API_KEY=sk_live_...');
  console.error('Or update the apiKey in this script');
  process.exit(1);
}

let stats = {
  totalPolls: 0,
  totalSubmissions: 0,
  totalAircraft: 0,
  errors: 0,
  lastError: null,
};

function feetToMeters(feet) {
  return feet * 0.3048;
}

function knotsToMetersPerSecond(knots) {
  return knots * 0.514444;
}

function feetPerMinuteToMetersPerSecond(fpm) {
  return fpm * 0.00508;
}

function transformAircraft(aircraft) {
  // Handle category conversion
  // dump1090 provides category as hex string (e.g., "A3", "A2")
  // OpenSky expects integer 0-19, so we'll set to null if not valid
  let category = null;
  if (aircraft.category) {
    // Try to parse as hex first (in case it's already a number string)
    const parsed = parseInt(aircraft.category, 16);
    // Only use if it's a valid OpenSky category (0-19)
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 19) {
      category = parsed;
    }
    // Otherwise leave as null (category is optional)
  }

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
    category: category,
    time_position: aircraft.seen_pos !== undefined ? Math.floor(Date.now() / 1000 - aircraft.seen_pos) : null,
    last_contact: aircraft.seen !== undefined ? Math.floor(Date.now() / 1000 - aircraft.seen) : Math.floor(Date.now() / 1000),
    spi: false,
    position_source: 0,
  };
}

async function fetchDump1090Data() {
  try {
    const response = await axios.get(config.dump1090Url, {
      timeout: 5000,
    });
    return response.data.aircraft || [];
  } catch (error) {
    throw new Error(`Failed to fetch from dump1090: ${error.message}`);
  }
}

async function submitToFeederService(states) {
  try {
    const response = await axios.post(
      config.feederApiUrl,
      {
        timestamp: Math.floor(Date.now() / 1000),
        states,
      },
      {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(`API error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
    }
    throw new Error(`Failed to submit to feeder service: ${error.message}`);
  }
}

async function pollAndSubmit() {
  stats.totalPolls++;

  try {
    const aircraft = await fetchDump1090Data();
    console.log(`[${new Date().toISOString()}] Fetched ${aircraft.length} aircraft from dump1090`);

    if (aircraft.length < config.minAircraftForSubmission) {
      return;
    }

    const states = aircraft
      .filter(ac => ac.lat !== undefined && ac.lon !== undefined)
      .map(transformAircraft);

    if (states.length === 0) {
      return;
    }

    console.log(`Submitting ${states.length} aircraft...`);

    const result = await submitToFeederService(states);
    stats.totalSubmissions++;
    stats.totalAircraft += result.processed;

    console.log(`✓ Success: ${result.processed} processed in ${result.processing_time_ms}ms`);

    if (result.errors && result.errors.length > 0) {
      console.warn(`⚠ ${result.errors.length} errors`);
    }
  } catch (error) {
    stats.errors++;
    stats.lastError = error.message;
    console.error(`✗ Error: ${error.message}`);
  }
}

function printStats() {
  console.log('\n--- Statistics ---');
  console.log(`Total polls: ${stats.totalPolls}`);
  console.log(`Total submissions: ${stats.totalSubmissions}`);
  console.log(`Total aircraft processed: ${stats.totalAircraft}`);
  console.log(`Errors: ${stats.errors}`);
  if (stats.lastError) {
    console.log(`Last error: ${stats.lastError}`);
  }
  console.log('------------------\n');
}

async function start() {
  console.log('PiAware Feeder Client');
  console.log('=====================');
  console.log(`Feeder API: ${config.feederApiUrl}`);
  console.log(`dump1090 URL: ${config.dump1090Url}`);
  console.log(`Poll interval: ${config.pollIntervalMs}ms`);
  console.log('');

  await pollAndSubmit();
  const pollInterval = setInterval(pollAndSubmit, config.pollIntervalMs);
  const statsInterval = setInterval(printStats, 60000);

  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    clearInterval(pollInterval);
    clearInterval(statsInterval);
    printStats();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\nShutting down...');
    clearInterval(pollInterval);
    clearInterval(statsInterval);
    printStats();
    process.exit(0);
  });
}

start().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


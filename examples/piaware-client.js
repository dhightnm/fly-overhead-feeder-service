/**
 * PiAware Client Example
 * 
 * This script polls data from a local PiAware/dump1090 instance
 * and submits it to the feeder ingestion service.
 * 
 * Usage:
 * 1. Install dependencies: npm install axios
 * 2. Set your API key: export FEEDER_API_KEY=sk_live_your_api_key
 * 3. Run: node piaware-client.js
 */

const axios = require('axios');

// Configuration
const config = {
  feederApiUrl: process.env.FEEDER_API_URL || 'http://localhost:3006/api/v1/feeders/data',
  apiKey: process.env.FEEDER_API_KEY,
  dump1090Url: process.env.DUMP1090_URL || 'http://localhost:8080/data/aircraft.json',
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS, 10) || 5000,
  minAircraftForSubmission: parseInt(process.env.MIN_AIRCRAFT, 10) || 1,
};

// Validate configuration
if (!config.apiKey) {
  console.error('Error: FEEDER_API_KEY environment variable is required');
  console.error('Usage: FEEDER_API_KEY=sk_live_... node piaware-client.js');
  process.exit(1);
}

// Statistics
let stats = {
  totalPolls: 0,
  totalSubmissions: 0,
  totalAircraft: 0,
  errors: 0,
  lastError: null,
};

/**
 * Convert feet to meters
 */
function feetToMeters(feet) {
  return feet * 0.3048;
}

/**
 * Convert knots to meters per second
 */
function knotsToMetersPerSecond(knots) {
  return knots * 0.514444;
}

/**
 * Convert feet per minute to meters per second
 */
function feetPerMinuteToMetersPerSecond(fpm) {
  return fpm * 0.00508;
}

/**
 * Transform dump1090 aircraft to API format
 */
function transformAircraft(aircraft) {
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

/**
 * Fetch aircraft data from dump1090
 */
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

/**
 * Submit aircraft states to feeder service
 */
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

/**
 * Main polling loop
 */
async function pollAndSubmit() {
  stats.totalPolls++;

  try {
    // Fetch aircraft data
    const aircraft = await fetchDump1090Data();

    console.log(`[${new Date().toISOString()}] Fetched ${aircraft.length} aircraft from dump1090`);

    if (aircraft.length < config.minAircraftForSubmission) {
      console.log(`Skipping submission (minimum ${config.minAircraftForSubmission} aircraft required)`);
      return;
    }

    // Filter and transform aircraft with position data
    const states = aircraft
      .filter(ac => ac.lat !== undefined && ac.lon !== undefined)
      .map(transformAircraft);

    if (states.length === 0) {
      console.log('No aircraft with valid position data');
      return;
    }

    console.log(`Submitting ${states.length} aircraft with position data...`);

    // Submit to feeder service
    const result = await submitToFeederService(states);

    stats.totalSubmissions++;
    stats.totalAircraft += result.processed;

    console.log(`✓ Success: ${result.processed} processed in ${result.processing_time_ms}ms`);

    if (result.errors && result.errors.length > 0) {
      console.warn(`⚠ ${result.errors.length} errors:`, result.errors.slice(0, 3));
    }
  } catch (error) {
    stats.errors++;
    stats.lastError = error.message;
    console.error(`✗ Error: ${error.message}`);
  }
}

/**
 * Print statistics
 */
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

/**
 * Start the client
 */
async function start() {
  console.log('PiAware Feeder Client');
  console.log('=====================');
  console.log(`Feeder API: ${config.feederApiUrl}`);
  console.log(`dump1090 URL: ${config.dump1090Url}`);
  console.log(`Poll interval: ${config.pollIntervalMs}ms`);
  console.log('');

  // Initial poll
  await pollAndSubmit();

  // Set up polling interval
  const pollInterval = setInterval(pollAndSubmit, config.pollIntervalMs);

  // Print stats every minute
  const statsInterval = setInterval(printStats, 60000);

  // Graceful shutdown
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

// Start the client
start().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


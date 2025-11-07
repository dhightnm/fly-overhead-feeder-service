#!/usr/bin/env node

/**
 * Universal Feeder Setup Wizard
 * 
 * Interactive setup for connecting any ADS-B feeder to fly-overhead.
 * Supports: PiAware, dump1090, ADSBExchange, and custom feeders.
 */

import readline from 'readline';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { FeederClient, registerAndCreateClient } from './sdk/FeederClient';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

interface SetupConfig {
  serverUrl: string;
  feederName: string;
  feederType: string;
  location?: { latitude: number; longitude: number };
  metadata: Record<string, any>;
}

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function detectFeederType(): Promise<string | null> {
  console.log('\n🔍 Detecting feeder type...\n');

  // Check for PiAware
  try {
    const response = await axios.get('http://localhost:8080/data/aircraft.json', { timeout: 2000 });
    if (response.data && Array.isArray(response.data.aircraft)) {
      console.log('✅ Detected: dump1090/PiAware (port 8080)');
      return 'piaware';
    }
  } catch {}

  // Check for dump1090 on different ports
  const ports = [8080, 30001, 30002];
  for (const port of ports) {
    try {
      const response = await axios.get(`http://localhost:${port}/data/aircraft.json`, { timeout: 2000 });
      if (response.data && Array.isArray(response.data.aircraft)) {
        console.log(`✅ Detected: dump1090 (port ${port})`);
        return 'dump1090';
      }
    } catch {}
  }

  // Check for ADSBExchange
  try {
    const response = await axios.get('http://localhost:8080/tar1090/data/aircraft.json', { timeout: 2000 });
    if (response.data && Array.isArray(response.data.aircraft)) {
      console.log('✅ Detected: tar1090/ADSBExchange');
      return 'adsbexchange';
    }
  } catch {}

  console.log('⚠️  Could not auto-detect feeder type');
  return null;
}

async function collectSetupInfo(): Promise<SetupConfig> {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║     Fly Overhead Feeder Setup Wizard                     ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  // Server URL
  const serverUrl = await question('Enter feeder service URL [http://localhost:3006]: ') || 'http://localhost:3006';
  console.log(`   Using: ${serverUrl}\n`);

  // Test connection
  try {
    const response = await axios.get(`${serverUrl}/health`, { timeout: 5000 });
    console.log('✅ Connected to feeder service\n');
  } catch (error) {
    console.log('⚠️  Warning: Could not connect to server. Continuing anyway...\n');
  }

  // Feeder name
  const feederName = await question('Enter a name for this feeder: ');
  if (!feederName.trim()) {
    console.log('❌ Name is required');
    process.exit(1);
  }

  // Detect feeder type
  const detectedType = await detectFeederType();
  let feederType = detectedType || '';

  if (!feederType) {
    console.log('\nSelect feeder type:');
    console.log('  1. PiAware / dump1090');
    console.log('  2. ADSBExchange / tar1090');
    console.log('  3. Custom / Other');
    const choice = await question('\nChoice [1-3]: ');
    
    switch (choice) {
      case '1':
        feederType = 'piaware';
        break;
      case '2':
        feederType = 'adsbexchange';
        break;
      case '3':
        feederType = 'custom';
        break;
      default:
        feederType = 'piaware';
    }
  }

  // Location (optional)
  let location: { latitude: number; longitude: number } | undefined;
  const hasLocation = await question('\nDo you want to set feeder location? [y/N]: ');
  if (hasLocation.toLowerCase() === 'y') {
    const lat = parseFloat(await question('  Latitude: '));
    const lon = parseFloat(await question('  Longitude: '));
    if (!isNaN(lat) && !isNaN(lon)) {
      location = { latitude: lat, longitude: lon };
    }
  }

  // Metadata
  const metadata: Record<string, any> = {
    feeder_type: feederType,
    setup_date: new Date().toISOString(),
  };

  if (feederType === 'piaware' || feederType === 'dump1090') {
    const hardware = await question('Hardware (e.g., Raspberry Pi 4) [optional]: ');
    if (hardware) metadata.hardware = hardware;
    
    const software = await question('Software version (e.g., PiAware 7.2) [optional]: ');
    if (software) metadata.software = software;
  }

  return {
    serverUrl,
    feederName,
    feederType,
    location,
    metadata,
  };
}

async function saveConfig(config: SetupConfig, apiKey: string, feederId: string): Promise<void> {
  const configDir = path.join(process.cwd(), '.feeder-config');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const configFile = path.join(configDir, 'config.json');
  const configData = {
    serverUrl: config.serverUrl,
    apiKey,
    feederId,
    feederType: config.feederType,
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(configFile, JSON.stringify(configData, null, 2));
  console.log(`\n✅ Configuration saved to: ${configFile}`);
  console.log('⚠️  Keep this file secure! It contains your API key.\n');
}

async function generateClientScript(config: SetupConfig, apiKey: string, feederId: string): Promise<void> {
  const scriptContent = `#!/usr/bin/env node
/**
 * Auto-generated feeder client
 * Generated by fly-overhead setup wizard
 */

const { FeederClient } = require('./sdk/FeederClient');
const axios = require('axios');

const client = new FeederClient({
  apiUrl: '${config.serverUrl}',
  apiKey: '${apiKey}',
  feederId: '${feederId}',
});

// Configuration
const FEEDER_TYPE = '${config.feederType}';
const DUMP1090_URL = 'http://localhost:8080/data/aircraft.json';
const POLL_INTERVAL = 5000;

// Transform functions
function feetToMeters(feet) { return feet * 0.3048; }
function knotsToMetersPerSecond(knots) { return knots * 0.514444; }
function feetPerMinuteToMetersPerSecond(fpm) { return fpm * 0.00508; }

function transformAircraft(aircraft) {
  let category = null;
  if (aircraft.category) {
    const parsed = parseInt(aircraft.category, 16);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 19) {
      category = parsed;
    }
  }

  // Handle barometric altitude: prefer alt_baro (if numeric), fallback to altitude
  let baro_altitude_feet = null;
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
    category: category,
    time_position: aircraft.seen_pos !== undefined ? Math.floor(Date.now() / 1000 - aircraft.seen_pos) : null,
    last_contact: aircraft.seen !== undefined ? Math.floor(Date.now() / 1000 - aircraft.seen) : Math.floor(Date.now() / 1000),
    spi: false,
    position_source: 0,
  };
}

async function pollAndSubmit() {
  try {
    const response = await axios.get(DUMP1090_URL, { timeout: 5000 });
    const aircraft = response.data.aircraft || [];

    if (aircraft.length === 0) return;

    const states = aircraft
      .filter(ac => ac.lat !== undefined && ac.lon !== undefined)
      .map(transformAircraft);

    if (states.length === 0) return;

    const result = await client.submitBatch(states);
    console.log(\`✓ Submitted \${result.processed} aircraft\`);
  } catch (error) {
    console.error('✗ Error:', error.message);
  }
}

// Start polling
console.log('Starting feeder client...');
console.log(\`Feeder ID: \${feederId}\`);
console.log(\`Server: \${config.serverUrl}\`);
console.log(\`Poll interval: \${POLL_INTERVAL}ms\n\`);

pollAndSubmit();
setInterval(pollAndSubmit, POLL_INTERVAL);
`;

  const scriptPath = path.join(process.cwd(), 'feeder-client.js');
  fs.writeFileSync(scriptPath, scriptContent);
  fs.chmodSync(scriptPath, '755');
  console.log(`✅ Client script generated: ${scriptPath}`);
}

async function main() {
  try {
    const config = await collectSetupInfo();

    console.log('\n📝 Registering feeder...\n');
    const { client, feederId, apiKey } = await registerAndCreateClient(
      config.serverUrl,
      {
        name: config.feederName,
        location: config.location,
        metadata: config.metadata,
      }
    );

    console.log('✅ Feeder registered successfully!\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Feeder ID:', feederId);
    console.log('  API Key:', apiKey.substring(0, 20) + '...');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('⚠️  Save your API key! It will not be shown again.\n');

    // Save configuration
    await saveConfig(config, apiKey, feederId);

    // Generate client script
    await generateClientScript(config, apiKey, feederId);

    // Test connection
    console.log('🧪 Testing connection...');
    const info = await client.getInfo();
    console.log(`✅ Connected! Feeder status: ${info.status}\n`);

    console.log('🎉 Setup complete!\n');
    console.log('Next steps:');
    console.log('  1. Review the generated feeder-client.js');
    console.log('  2. Install dependencies: npm install axios');
    console.log('  3. Run: node feeder-client.js');
    console.log('  4. Or set up as a service (see documentation)\n');

  } catch (error: any) {
    console.error('\n❌ Setup failed:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Response:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();


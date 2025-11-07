#!/usr/bin/env node

/**
 * Universal Feeder Client
 * 
 * Auto-detects feeder type and connects to fly-overhead service.
 * Works with PiAware, dump1090, ADSBExchange, and more.
 * 
 * Usage:
 *   FEEDER_API_URL=http://server:3006 FEEDER_API_KEY=sk_live_... node universal-feeder-client.js
 */

import { FeederAdapterFactory } from './adapters/FeederAdapter';
import { FeederClient } from './sdk/FeederClient';

const API_URL = process.env.FEEDER_API_URL || 'http://localhost:3006';
const API_KEY = process.env.FEEDER_API_KEY;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10);

if (!API_KEY) {
  console.error('❌ Error: FEEDER_API_KEY environment variable required');
  console.error('');
  console.error('Get your API key by registering:');
  console.error(`  curl -X POST ${API_URL}/api/v1/feeders/register \\`);
  console.error('    -H "Content-Type: application/json" \\');
  console.error('    -d \'{"name": "My Feeder"}\'');
  console.error('');
  console.error('Or run the setup wizard:');
  console.error('  npx @fly-overhead/feeder-setup');
  process.exit(1);
}

async function main() {
  console.log('🔍 Detecting feeder type...\n');

  // Detect feeder
  const adapter = await FeederAdapterFactory.createAdapter();

  if (!adapter) {
    console.error('❌ Could not detect feeder type');
    console.error('');
    console.error('Make sure one of these is running:');
    console.error('  - PiAware / dump1090 (port 8080)');
    console.error('  - tar1090 / ADSBExchange (port 8080)');
    console.error('');
    console.error('Or specify manually:');
    console.error('  FEEDER_TYPE=piaware node universal-feeder-client.js');
    process.exit(1);
  }

  console.log(`✅ Detected: ${adapter.name}\n`);

  // Create feeder client
  const client = new FeederClient({
    apiUrl: API_URL,
    apiKey: API_KEY,
  });

  // Test connection
  console.log('🧪 Testing connection to server...');
  const connected = await client.testConnection();
  if (!connected) {
    console.error(`❌ Could not connect to ${API_URL}`);
    console.error('Make sure the feeder service is running.');
    process.exit(1);
  }
  console.log('✅ Connected!\n');

  // Get feeder info
  try {
    const info = await client.getInfo();
    console.log(`📡 Feeder: ${info.name} (${info.feeder_id})`);
    console.log(`   Status: ${info.status}\n`);
  } catch (error) {
    console.warn('⚠️  Could not fetch feeder info (this is okay for first run)\n');
  }

  // Start polling
  console.log(`🚀 Starting to feed data (every ${POLL_INTERVAL}ms)...\n`);

  let stats = {
    polls: 0,
    submissions: 0,
    aircraft: 0,
    errors: 0,
  };

  async function pollAndSubmit() {
    stats.polls++;

    try {
      const aircraft = await adapter.fetchAircraft();

      if (aircraft.length === 0) {
        return;
      }

      const result = await client.submitBatch(aircraft);

      stats.submissions++;
      stats.aircraft += result.processed;

      console.log(`✓ [${new Date().toISOString()}] Submitted ${result.processed} aircraft (${stats.aircraft} total)`);

      if (result.errors && result.errors.length > 0) {
        console.warn(`  ⚠ ${result.errors.length} errors`);
      }
    } catch (error: any) {
      stats.errors++;
      console.error(`✗ Error: ${error.message}`);
    }
  }

  // Initial poll
  await pollAndSubmit();

  // Set up interval
  const interval = setInterval(() => {
    pollAndSubmit().catch(() => {});
  }, POLL_INTERVAL);

  // Print stats every minute
  const statsInterval = setInterval(() => {
    console.log('\n--- Statistics ---');
    console.log(`Polls: ${stats.polls}`);
    console.log(`Submissions: ${stats.submissions}`);
    console.log(`Aircraft processed: ${stats.aircraft}`);
    console.log(`Errors: ${stats.errors}`);
    console.log('------------------\n');
  }, 60000);

  // Graceful shutdown
  const shutdown = (signal: string) => {
    console.log(`\n${signal} received, shutting down...`);
    clearInterval(interval);
    clearInterval(statsInterval);
    console.log('\n--- Final Statistics ---');
    console.log(`Total polls: ${stats.polls}`);
    console.log(`Total submissions: ${stats.submissions}`);
    console.log(`Total aircraft: ${stats.aircraft}`);
    console.log(`Errors: ${stats.errors}`);
    console.log('------------------------\n');
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

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


/**
 * Register Feeder Example
 * 
 * This script registers a new feeder with the service.
 * 
 * Usage:
 * node register-feeder.js
 */

const axios = require('axios');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function registerFeeder() {
  console.log('Feeder Registration');
  console.log('===================\n');

  // Get feeder information
  const name = await prompt('Feeder name: ');
  const latitude = await prompt('Latitude (optional, press Enter to skip): ');
  const longitude = await prompt('Longitude (optional, press Enter to skip): ');
  const hardware = await prompt('Hardware (e.g., Raspberry Pi 4): ');
  const software = await prompt('Software (e.g., PiAware, dump1090): ');
  const apiUrl = await prompt('API URL (default: http://localhost:3006): ') || 'http://localhost:3006';

  rl.close();

  // Prepare request body
  const requestBody = {
    name,
    metadata: {
      hardware,
      software,
    },
  };

  if (latitude && longitude) {
    requestBody.location = {
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
    };
  }

  console.log('\nRegistering feeder...\n');

  try {
    const response = await axios.post(
      `${apiUrl}/api/v1/feeders/register`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    console.log('✓ Registration successful!\n');
    console.log('=== IMPORTANT: Save these credentials ===');
    console.log(`Feeder ID: ${response.data.feeder_id}`);
    console.log(`API Key: ${response.data.api_key}`);
    console.log('=========================================\n');
    console.log('⚠️  The API key will not be shown again!');
    console.log('⚠️  Store it securely.\n');
    console.log('To use with the PiAware client:');
    console.log(`export FEEDER_API_KEY=${response.data.api_key}`);
    console.log('node examples/piaware-client.js\n');
  } catch (error) {
    console.error('✗ Registration failed:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Error: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.error(`Error: ${error.message}`);
    }
    process.exit(1);
  }
}

registerFeeder().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


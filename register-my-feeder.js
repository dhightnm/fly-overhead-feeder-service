#!/usr/bin/env node

const axios = require('axios');

const API_URL = process.env.FEEDER_API_URL || 'http://localhost:3006';

async function registerFeeder() {
  try {
    const response = await axios.post(`${API_URL}/api/v1/feeders/register`, {
      name: "Devin's PiAware Feeder",
      location: {
        latitude: 35.071057,
        longitude: -106.614035
      },
      metadata: {
        hardware: "Raspberry Pi Zero 2",
        software: "PiAware",
        version: "7.2"
      }
    });

    console.log('\n✅ Registration successful!\n');
    console.log('=== IMPORTANT: Save these credentials ===');
    console.log(`Feeder ID: ${response.data.feeder_id}`);
    console.log(`API Key: ${response.data.api_key}`);
    console.log('=========================================\n');
    console.log('⚠️  The API key will not be shown again!');
    console.log('⚠️  Store it securely.\n');
    
    // Write to .env file for easy access
    const fs = require('fs');
    const envContent = `FEEDER_ID=${response.data.feeder_id}\nFEEDER_API_KEY=${response.data.api_key}\n`;
    fs.appendFileSync('.env', '\n# Feeder credentials\n' + envContent);
    console.log('✅ Credentials saved to .env file\n');
    
  } catch (error) {
    console.error('❌ Registration failed:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Error:`, JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(`Error: ${error.message}`);
    }
    process.exit(1);
  }
}

registerFeeder();


#!/bin/bash

# One-Click Feeder Setup Script
# Installs and configures a feeder client for fly-overhead

set -e

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║     Fly Overhead Feeder - One-Click Setup                ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Detect OS
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
else
    OS="unknown"
fi

echo "Detected OS: $OS"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Installing..."
    
    if [ "$OS" == "linux" ]; then
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif [ "$OS" == "macos" ]; then
        echo "Please install Node.js from https://nodejs.org/"
        exit 1
    fi
fi

echo "✅ Node.js $(node --version)"
echo ""

# Check for npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found"
    exit 1
fi

echo "✅ npm $(npm --version)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install axios 2>/dev/null || {
    echo "Installing globally..."
    sudo npm install -g axios
}

# Download setup wizard
echo "📥 Downloading setup wizard..."
# In production, this would download from a CDN or package registry

# Run setup wizard
echo "🚀 Starting setup wizard..."
echo ""

node -e "
const readline = require('readline');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

async function main() {
  console.log('Enter your feeder service URL:');
  const serverUrl = await question('URL [http://localhost:3006]: ') || 'http://localhost:3006';
  
  console.log('\nTesting connection...');
  try {
    await axios.get(serverUrl + '/health', { timeout: 5000 });
    console.log('✅ Connected!\n');
  } catch (error) {
    console.log('⚠️  Could not connect. Make sure the service is running.\n');
  }
  
  console.log('Next, run the interactive setup:');
  console.log('  npx @fly-overhead/feeder-setup');
  console.log('');
  console.log('Or visit: https://docs.fly-overhead.com/feeders/setup');
  
  rl.close();
}

main();
"

echo ""
echo "✅ Setup script ready!"
echo ""
echo "For interactive setup, run:"
echo "  npx @fly-overhead/feeder-setup"
echo ""


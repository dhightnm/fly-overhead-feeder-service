#!/bin/bash
# Public setup script for Fly Overhead feeder
# Run this on your feeder device to connect to Fly Overhead

set -e

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║     Fly Overhead Feeder - Public Setup                   ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "This script will help you connect your feeder to Fly Overhead."
echo ""

# Configuration
FEEDER_API_URL="${FEEDER_API_URL:-https://api.fly-overhead.com}"
DUMP1090_URL="${DUMP1090_URL:-http://127.0.0.1:8080/data/aircraft.json}"

# Step 1: Check prerequisites
echo "📋 Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "⚠️  Node.js not found. Installing..."
    if [ -f /etc/debian_version ]; then
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
    else
        echo "❌ Please install Node.js manually: https://nodejs.org/"
        exit 1
    fi
else
    echo "✅ Node.js $(node --version) found"
fi

# Check dump1090
echo ""
echo "🔍 Checking for dump1090..."
if curl -s "$DUMP1090_URL" > /dev/null 2>&1; then
    echo "✅ dump1090 found at $DUMP1090_URL"
else
    echo "⚠️  Could not connect to dump1090 at $DUMP1090_URL"
    echo "   Make sure dump1090 is running and update DUMP1090_URL if needed"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check for existing installation
echo ""
echo "🔍 Checking for existing installation..."
EXISTING_SERVICE=false
if systemctl is-active --quiet fly-overhead-feeder 2>/dev/null; then
    EXISTING_SERVICE=true
    echo "⚠️  Found existing fly-overhead-feeder service running"
    echo "   This setup will stop it and replace it with the new version"
    read -p "Continue? (Y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        exit 0
    fi
    # Stop existing service
    sudo systemctl stop fly-overhead-feeder 2>/dev/null || true
fi

if [ -f ~/feeder-client.js ] || [ -f ~/piaware-feeder-client.js ]; then
    echo "⚠️  Found existing client script(s)"
    echo "   Old script(s) will be backed up and replaced"
    
    # Try to extract API key from old scripts
    EXTRACTED_API_KEY=""
    if [ -f ~/piaware-feeder-client.js ]; then
        # Look for API key in old script (multiple patterns)
        # Pattern 1: apiKey: process.env.FEEDER_API_KEY || 'sk_live_...'
        EXTRACTED_API_KEY=$(grep -oE "['\"]sk_live_[^'\"]{40,}" ~/piaware-feeder-client.js 2>/dev/null | head -1 | tr -d "'\"" || echo "")
        # Pattern 2: FEEDER_API_KEY = 'sk_live_...' or apiKey: 'sk_live_...'
        if [ -z "$EXTRACTED_API_KEY" ]; then
            EXTRACTED_API_KEY=$(grep -oE "(FEEDER_API_KEY|apiKey|API_KEY)\s*[=:]\s*['\"]?sk_live_[^'\"]{40,}" ~/piaware-feeder-client.js 2>/dev/null | head -1 | sed -E "s/.*['\"]?(sk_live_[^'\"]{40,}).*/\1/" || echo "")
        fi
        # Pattern 3: Any long string that looks like an API key (starts with sk_)
        if [ -z "$EXTRACTED_API_KEY" ]; then
            EXTRACTED_API_KEY=$(grep -oE "['\"]sk_[^'\"]{40,}" ~/piaware-feeder-client.js 2>/dev/null | head -1 | tr -d "'\"" || echo "")
        fi
        cp ~/piaware-feeder-client.js ~/piaware-feeder-client.js.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null || true
        echo "   Backed up: ~/piaware-feeder-client.js"
    fi
    if [ -f ~/feeder-client.js ]; then
        if [ -z "$EXTRACTED_API_KEY" ]; then
            # Same patterns for feeder-client.js
            EXTRACTED_API_KEY=$(grep -oE "['\"]sk_live_[^'\"]{40,}" ~/feeder-client.js 2>/dev/null | head -1 | tr -d "'\"" || echo "")
        fi
        if [ -z "$EXTRACTED_API_KEY" ]; then
            EXTRACTED_API_KEY=$(grep -oE "(FEEDER_API_KEY|apiKey|API_KEY)\s*[=:]\s*['\"]?sk_live_[^'\"]{40,}" ~/feeder-client.js 2>/dev/null | head -1 | sed -E "s/.*['\"]?(sk_live_[^'\"]{40,}).*/\1/" || echo "")
        fi
        if [ -z "$EXTRACTED_API_KEY" ]; then
            EXTRACTED_API_KEY=$(grep -oE "['\"]sk_[^'\"]{40,}" ~/feeder-client.js 2>/dev/null | head -1 | tr -d "'\"" || echo "")
        fi
        cp ~/feeder-client.js ~/feeder-client.js.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null || true
        echo "   Backed up: ~/feeder-client.js"
    fi
    
    # Check for .env file
    if [ -f ~/.env ] && [ -z "$EXTRACTED_API_KEY" ]; then
        EXTRACTED_API_KEY=$(grep -E "^FEEDER_API_KEY=" ~/.env 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" || echo "")
    fi
    
    # Store extracted key for later use
    if [ ! -z "$EXTRACTED_API_KEY" ]; then
        echo "   ℹ️  Found API key in old script/config"
        FOUND_API_KEY="$EXTRACTED_API_KEY"
    fi
fi

# Step 2: Register feeder or use existing API key
echo ""
echo "📝 Feeder Registration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if user wants to use existing API key
USE_EXISTING_KEY=false
if [ "$EXISTING_SERVICE" = true ] || [ ! -z "$FOUND_API_KEY" ]; then
    if [ ! -z "$FOUND_API_KEY" ]; then
        echo "   💡 Found API key from old installation"
        read -p "Use this existing API key? (Y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            USE_EXISTING_KEY=true
            FEEDER_API_KEY="$FOUND_API_KEY"
        fi
    fi
    
    if [ "$USE_EXISTING_KEY" = false ]; then
        read -p "Do you have an existing API key? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            USE_EXISTING_KEY=true
            read -p "Enter your existing API key: " FEEDER_API_KEY
            if [ -z "$FEEDER_API_KEY" ]; then
                echo "❌ API key cannot be empty"
                exit 1
            fi
        fi
    fi
    
    if [ "$USE_EXISTING_KEY" = true ]; then
        echo "✅ Using existing API key"
        # Try to get feeder info to validate key
        FEEDER_INFO=$(curl -s -X GET "$FEEDER_API_URL/api/v1/feeders/me" \
          -H "Authorization: Bearer $FEEDER_API_KEY" 2>/dev/null || echo "")
        if [ ! -z "$FEEDER_INFO" ] && echo "$FEEDER_INFO" | grep -q "feeder_id"; then
            FEEDER_ID=$(echo "$FEEDER_INFO" | grep -o '"feeder_id":"[^"]*' | cut -d'"' -f4)
            FEEDER_NAME=$(echo "$FEEDER_INFO" | grep -o '"name":"[^"]*' | cut -d'"' -f4)
            echo "   Feeder ID: $FEEDER_ID"
            echo "   Feeder Name: $FEEDER_NAME"
        else
            echo "⚠️  Could not validate API key, but continuing..."
        fi
    fi
fi

if [ "$USE_EXISTING_KEY" = false ]; then
    read -p "Feeder name: " FEEDER_NAME
    read -p "Latitude (optional, press Enter to skip): " LATITUDE
    read -p "Longitude (optional, press Enter to skip): " LONGITUDE
fi

# Register new feeder if not using existing key
if [ "$USE_EXISTING_KEY" = false ]; then
    # Build registration payload
    REGISTRATION_PAYLOAD="{\"name\":\"$FEEDER_NAME\""
    if [ ! -z "$LATITUDE" ] && [ ! -z "$LONGITUDE" ]; then
        REGISTRATION_PAYLOAD="$REGISTRATION_PAYLOAD,\"location\":{\"latitude\":$LATITUDE,\"longitude\":$LONGITUDE}"
    fi
    REGISTRATION_PAYLOAD="$REGISTRATION_PAYLOAD}"

    echo ""
    echo "📡 Registering feeder..."
    REGISTRATION_RESPONSE=$(curl -s -X POST "$FEEDER_API_URL/api/v1/feeders/register" \
      -H "Content-Type: application/json" \
      -d "$REGISTRATION_PAYLOAD")

    # Extract API key
    FEEDER_API_KEY=$(echo "$REGISTRATION_RESPONSE" | grep -o '"api_key":"[^"]*' | cut -d'"' -f4)
    FEEDER_ID=$(echo "$REGISTRATION_RESPONSE" | grep -o '"feeder_id":"[^"]*' | cut -d'"' -f4)

    if [ -z "$FEEDER_API_KEY" ]; then
        echo "❌ Registration failed!"
        echo "Response: $REGISTRATION_RESPONSE"
        exit 1
    fi

    echo "✅ Feeder registered!"
    echo "   Feeder ID: $FEEDER_ID"
    echo "   API Key: ${FEEDER_API_KEY:0:20}..."
    echo ""
    echo "⚠️  IMPORTANT: Save your API key! It won't be shown again."
    echo "   API Key: $FEEDER_API_KEY"
    echo ""
fi

# Step 3: Install SDK
echo "📦 Installing SDK..."
npm install -g @dhightnm/feeder-sdk axios 2>/dev/null || {
    echo "Installing locally..."
    mkdir -p ~/feeder-client
    cd ~/feeder-client
    npm init -y
    npm install @dhightnm/feeder-sdk axios
}

# Step 4: Create client script
echo ""
echo "📝 Creating client script..."
cat > ~/feeder-client.js << 'CLIENT_SCRIPT'
#!/usr/bin/env node

const { FeederClient } = require('@dhightnm/feeder-sdk');
const axios = require('axios');

const FEEDER_API_URL = process.env.FEEDER_API_URL || 'https://api.fly-overhead.com';
const FEEDER_API_KEY = process.env.FEEDER_API_KEY;
const DUMP1090_URL = process.env.DUMP1090_URL || 'http://127.0.0.1:8080/data/aircraft.json';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10);

if (!FEEDER_API_KEY) {
  console.error('Error: FEEDER_API_KEY environment variable required');
  process.exit(1);
}

const client = new FeederClient({
  apiUrl: FEEDER_API_URL,
  apiKey: FEEDER_API_KEY,
});

let isRunning = true;
let pollInterval = null;

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
  if (!isRunning) return;
  
  try {
    const response = await axios.get(DUMP1090_URL, { timeout: 5000 });
    const aircraft = response.data.aircraft || [];

    if (aircraft.length === 0) return;

    const states = aircraft
      .filter(ac => ac.lat !== undefined && ac.lon !== undefined)
      .map(transformAircraft);

    if (states.length === 0) return;

    const result = await client.submitBatch(states);
    // Only log submissions if running in foreground (not via systemd)
    // Systemd will capture logs via journalctl, so we minimize console output
    if (process.stdout.isTTY) {
      console.log(`✓ [${new Date().toISOString()}] Submitted ${result.processed} aircraft`);
    }
  } catch (error) {
    // Always log errors (they go to systemd journal when running as service)
    const errorMessage = error.message || 'Unknown error';
    // Log errors less frequently to avoid spam, but still capture them
    if (Math.random() < 0.05) { // Log ~5% of errors to reduce noise
      console.error(`✗ Error: ${errorMessage}`);
    }
  }
}

function start() {
  // Only log startup if running in foreground (not via systemd)
  if (process.stdout.isTTY) {
    console.log('Feeder Client Starting...');
    console.log(`Server: ${FEEDER_API_URL}`);
    console.log(`Poll interval: ${POLL_INTERVAL}ms\n`);
  }

  // Initial poll (non-blocking)
  pollAndSubmit().catch(() => {});

  // Set up interval
  pollInterval = setInterval(() => {
    pollAndSubmit().catch(() => {});
  }, POLL_INTERVAL);
}

function shutdown(signal) {
  if (!isRunning) return;
  
  isRunning = false;
  // Only log shutdown if running in foreground
  if (process.stdout.isTTY) {
    console.log(`\n${signal} received, shutting down...`);
  }
  
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  
  // Give a moment for any in-flight requests to complete
  setTimeout(() => {
    process.exit(0);
  }, 1000);
}

// Handle signals for graceful shutdown
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught exceptions to prevent crashes
process.on('uncaughtException', (error) => {
  // Always log exceptions (they're important)
  console.error('Uncaught exception:', error.message);
  // Don't exit - let systemd restart us
});

process.on('unhandledRejection', (reason) => {
  // Log rejections less frequently to avoid spam
  if (Math.random() < 0.1) {
    console.error('Unhandled rejection:', reason);
  }
  // Don't exit - continue running
});

// Start the client
start();
CLIENT_SCRIPT

chmod +x ~/feeder-client.js

# Step 5: Test (non-blocking)
echo ""
echo "🧪 Testing connection..."
read -p "Test the client now? (Y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    # Run test in background with timeout to avoid blocking
    (timeout 10 node ~/feeder-client.js 2>&1 | head -20 || true) &
    TEST_PID=$!
    sleep 3
    # Kill test if still running
    kill $TEST_PID 2>/dev/null || true
    wait $TEST_PID 2>/dev/null || true
    echo ""
fi

# Step 6: Create systemd service
echo ""
echo "🔧 Setting up auto-start service..."
sudo tee /etc/systemd/system/fly-overhead-feeder.service > /dev/null << EOF
[Unit]
Description=Fly Overhead Feeder Client
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
Environment="FEEDER_API_URL=$FEEDER_API_URL"
Environment="FEEDER_API_KEY=$FEEDER_API_KEY"
Environment="DUMP1090_URL=$DUMP1090_URL"
Environment="POLL_INTERVAL_MS=5000"
WorkingDirectory=$HOME
ExecStart=$(which node) $HOME/feeder-client.js
Restart=always
RestartSec=10
# Run as background daemon - redirect all output to journal
StandardOutput=journal
StandardError=journal
StandardInput=null
# Prevent the service from hanging
TimeoutStartSec=30
TimeoutStopSec=10
# Don't kill the process on stop - let it shutdown gracefully
KillMode=mixed
KillSignal=SIGTERM
# Run in background, detached from terminal
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

# Configure systemd journal limits (required for log rotation on Pi)
echo ""
echo "📋 Configuring systemd journal limits..."
sudo mkdir -p /etc/systemd/journald.conf.d
sudo tee /etc/systemd/journald.conf.d/fly-overhead-feeder.conf > /dev/null << JOURNALCONF
[Journal]
SystemMaxUse=20M
SystemKeepFree=50M
SystemMaxFileSize=5M
MaxRetentionSec=12h
JOURNALCONF

# Enable and start
sudo systemctl daemon-reload
sudo systemctl restart systemd-journald

# Stop existing service if running (in case of update)
if systemctl is-active --quiet fly-overhead-feeder 2>/dev/null; then
    sudo systemctl stop fly-overhead-feeder 2>/dev/null || true
fi

sudo systemctl enable fly-overhead-feeder
sudo systemctl start fly-overhead-feeder

sleep 2

echo ""
echo "✅ Setup complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Service Status:"
sudo systemctl status fly-overhead-feeder --no-pager -l | head -15
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Useful commands:"
echo "   View logs:    sudo journalctl -u fly-overhead-feeder -f"
echo "   Check status: sudo systemctl status fly-overhead-feeder"
echo "   Restart:      sudo systemctl restart fly-overhead-feeder"
echo "   Stop:         sudo systemctl stop fly-overhead-feeder"
echo ""
echo "ℹ️  The service runs automatically in the background."
echo "   Do NOT run ~/feeder-client.js directly - use systemctl commands above."
echo ""
echo "🔑 Your API Key (save this!):"
echo "   $FEEDER_API_KEY"
echo ""
echo "🌐 Check your feeder status:"
echo "   curl $FEEDER_API_URL/api/v1/feeders/me \\"
echo "     -H \"Authorization: Bearer $FEEDER_API_KEY\""
echo ""
echo "Thank you for contributing to Fly Overhead! 🎉"
echo ""


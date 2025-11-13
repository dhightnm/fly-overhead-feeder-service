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

if [ -z "$FEEDER_API_URL" ]; then
    if [ -t 0 ]; then
        SCRIPT_SOURCE="${BASH_SOURCE[0]}"
        if [[ "$SCRIPT_SOURCE" == *"feederservice"* ]] || [[ "$SCRIPT_SOURCE" == *"feeder"* ]]; then
            FEEDER_API_URL=$(echo "$SCRIPT_SOURCE" | sed -E 's|(https?://[^/]+).*|\1|')
        fi
    fi
    
    if [ -z "$FEEDER_API_URL" ]; then
        if hostname | grep -qi "feeder\|piaware"; then
            if curl -s --max-time 2 "http://localhost:3006/health" > /dev/null 2>&1; then
                FEEDER_API_URL="http://localhost:3006"
            elif curl -s --max-time 2 "https://feederservice.f199m4bz801f2.us-east-2.cs.amazonlightsail.com/health" > /dev/null 2>&1; then
                FEEDER_API_URL="https://feederservice.f199m4bz801f2.us-east-2.cs.amazonlightsail.com"
            fi
        fi
    fi
    
    if [ -z "$FEEDER_API_URL" ]; then
        FEEDER_API_URL="https://api.fly-overhead.com"
    fi
fi

if [ -z "$DUMP1090_URL" ]; then
    DUMP1090_URL=""
    DUMP1090_CANDIDATES=(
        "http://127.0.0.1:8080/data/aircraft.json"
        "http://localhost:8080/data/aircraft.json"
        "http://127.0.0.1:8080/data.json"
        "http://localhost:8080/data.json"
        "http://127.0.0.1:30003"
        "http://localhost:30003"
    )
    
    echo "🔍 Auto-detecting dump1090 location..."
    for url in "${DUMP1090_CANDIDATES[@]}"; do
        if curl -s --max-time 2 "$url" > /dev/null 2>&1; then
            DUMP1090_URL="$url"
            echo "   ✅ Found dump1090 at: $url"
            break
        fi
    done
    
    if [ -z "$DUMP1090_URL" ]; then
        DUMP1090_URL="http://127.0.0.1:8080/data/aircraft.json"
        echo "   ⚠️  Could not auto-detect, using default: $DUMP1090_URL"
    fi
fi

echo ""
echo "📋 Configuration:"
echo "   Feeder API URL: $FEEDER_API_URL"
echo "   Dump1090 URL: $DUMP1090_URL"
echo ""

echo "📋 Checking prerequisites..."
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

# Verify dump1090 is accessible
echo ""
echo "🔍 Verifying dump1090 connection..."
if curl -s --max-time 3 "$DUMP1090_URL" > /dev/null 2>&1; then
    echo "✅ dump1090 accessible at $DUMP1090_URL"
else
    echo "⚠️  ⚠️  Could not connect to dump1090 at $DUMP1090_URL"
    echo ""
    echo "   Common dump1090 locations:"
    echo "   - http://127.0.0.1:8080/data/aircraft.json (PiAware)"
    echo "   - http://127.0.0.1:8080/data.json"
    echo "   - http://localhost:8080/data/aircraft.json"
    echo ""
    if [ -r /dev/tty ]; then
        read -p "Enter dump1090 URL (or press Enter to use default): " CUSTOM_DUMP1090_URL < /dev/tty
    else
        read -p "Enter dump1090 URL (or press Enter to use default): " CUSTOM_DUMP1090_URL
    fi
    if [ ! -z "$CUSTOM_DUMP1090_URL" ]; then
        DUMP1090_URL="$CUSTOM_DUMP1090_URL"
        echo "   Using: $DUMP1090_URL"
    else
        echo "   Using default: $DUMP1090_URL"
    fi
    echo ""
    if [ -r /dev/tty ]; then
        read -p "Continue anyway? (y/N) " -n 1 -r < /dev/tty
    else
        read -p "Continue anyway? (y/N) " -n 1 -r
    fi
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
    if [ -r /dev/tty ]; then
        read -p "Continue? (Y/n) " -n 1 -r < /dev/tty
    else
        read -p "Continue? (Y/n) " -n 1 -r
    fi
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
    
    EXTRACTED_API_KEY=""
    if [ -f ~/piaware-feeder-client.js ]; then
        EXTRACTED_API_KEY=$(grep -oE "['\"]sk_live_[^'\"]{40,}" ~/piaware-feeder-client.js 2>/dev/null | head -1 | tr -d "'\"" || echo "")
        if [ -z "$EXTRACTED_API_KEY" ]; then
            EXTRACTED_API_KEY=$(grep -oE "(FEEDER_API_KEY|apiKey|API_KEY)\s*[=:]\s*['\"]?sk_live_[^'\"]{40,}" ~/piaware-feeder-client.js 2>/dev/null | head -1 | sed -E "s/.*['\"]?(sk_live_[^'\"]{40,}).*/\1/" || echo "")
        fi
        if [ -z "$EXTRACTED_API_KEY" ]; then
            EXTRACTED_API_KEY=$(grep -oE "['\"]sk_[^'\"]{40,}" ~/piaware-feeder-client.js 2>/dev/null | head -1 | tr -d "'\"" || echo "")
        fi
        cp ~/piaware-feeder-client.js ~/piaware-feeder-client.js.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null || true
        echo "   Backed up: ~/piaware-feeder-client.js"
    fi
    if [ -f ~/feeder-client.js ]; then
        if [ -z "$EXTRACTED_API_KEY" ]; then
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

echo ""
echo "📝 Feeder Registration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

USE_EXISTING_KEY=false
if [ "$EXISTING_SERVICE" = true ] || [ ! -z "$FOUND_API_KEY" ]; then
    if [ ! -z "$FOUND_API_KEY" ]; then
        echo "   💡 Found API key from old installation"
        if [ -r /dev/tty ]; then
            read -p "Use this existing API key? (Y/n) " -n 1 -r < /dev/tty
        else
            read -p "Use this existing API key? (Y/n) " -n 1 -r
        fi
        echo
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            USE_EXISTING_KEY=true
            FEEDER_API_KEY="$FOUND_API_KEY"
        fi
    fi
    
    if [ "$USE_EXISTING_KEY" = false ]; then
        if [ -r /dev/tty ]; then
            read -p "Do you have an existing API key? (y/N) " -n 1 -r < /dev/tty
        else
            read -p "Do you have an existing API key? (y/N) " -n 1 -r
        fi
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            USE_EXISTING_KEY=true
            if [ -r /dev/tty ]; then
                read -p "Enter your existing API key: " FEEDER_API_KEY < /dev/tty
            else
                read -p "Enter your existing API key: " FEEDER_API_KEY
            fi
            if [ -z "$FEEDER_API_KEY" ]; then
                echo "❌ API key cannot be empty"
                exit 1
            fi
        fi
    fi
    
    if [ "$USE_EXISTING_KEY" = true ]; then
        echo "✅ Using existing API key"
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
    if [ -r /dev/tty ]; then
        read -p "Feeder name: " FEEDER_NAME < /dev/tty
        read -p "Latitude (optional, press Enter to skip): " LATITUDE < /dev/tty
        read -p "Longitude (optional, press Enter to skip): " LONGITUDE < /dev/tty
    else
        read -p "Feeder name: " FEEDER_NAME
        read -p "Latitude (optional, press Enter to skip): " LATITUDE
        read -p "Longitude (optional, press Enter to skip): " LONGITUDE
    fi
    
    # Optional: User account linking
    echo ""
    echo "🔗 User Account Linking (Optional)"
    echo "   Link this feeder to your Fly Overhead account to manage it in your dashboard."
    if [ -r /dev/tty ]; then
        read -p "Do you want to link this feeder to your account? (y/N) " -n 1 -r < /dev/tty
    else
        read -p "Do you want to link this feeder to your account? (y/N) " -n 1 -r
    fi
    echo
    
    USER_JWT_TOKEN=""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo ""
        echo "   Please log in to your Fly Overhead account:"
        if [ -r /dev/tty ]; then
            read -p "   Email: " USER_EMAIL < /dev/tty
            read -sp "   Password: " USER_PASSWORD < /dev/tty
        else
            read -p "   Email: " USER_EMAIL
            read -sp "   Password: " USER_PASSWORD
        fi
        echo ""
        
        # Attempt to login
        MAIN_SERVICE_URL="${MAIN_SERVICE_URL:-${FEEDER_API_URL}}"
        LOGIN_RESPONSE=$(curl -s -X POST "${MAIN_SERVICE_URL}/api/auth/login" \
          -H "Content-Type: application/json" \
          -d "{\"email\":\"$USER_EMAIL\",\"password\":\"$USER_PASSWORD\"}")
        
        # Extract JWT token
        USER_JWT_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
        
        if [ ! -z "$USER_JWT_TOKEN" ]; then
            echo "   ✅ Logged in successfully! Feeder will be linked to your account."
        else
            echo "   ⚠️  Login failed. Creating standalone feeder (can be linked later)."
            USER_JWT_TOKEN=""
        fi
    fi
fi

if [ "$USE_EXISTING_KEY" = false ]; then
    REGISTRATION_PAYLOAD="{\"name\":\"$FEEDER_NAME\""
    if [ ! -z "$LATITUDE" ] && [ ! -z "$LONGITUDE" ]; then
        REGISTRATION_PAYLOAD="$REGISTRATION_PAYLOAD,\"location\":{\"latitude\":$LATITUDE,\"longitude\":$LONGITUDE}"
    fi
    REGISTRATION_PAYLOAD="$REGISTRATION_PAYLOAD}"

    echo ""
    echo "📡 Registering feeder..."
    
    if [ ! -z "$USER_JWT_TOKEN" ]; then
        REGISTRATION_RESPONSE=$(curl -s -X POST "$FEEDER_API_URL/api/v1/feeders/register" \
          -H "Content-Type: application/json" \
          -H "Authorization: Bearer $USER_JWT_TOKEN" \
          -d "$REGISTRATION_PAYLOAD")
    else
        REGISTRATION_RESPONSE=$(curl -s -X POST "$FEEDER_API_URL/api/v1/feeders/register" \
          -H "Content-Type: application/json" \
          -d "$REGISTRATION_PAYLOAD")
    fi

    FEEDER_API_KEY=$(echo "$REGISTRATION_RESPONSE" | grep -o '"api_key":"[^"]*' | cut -d'"' -f4)
    FEEDER_ID=$(echo "$REGISTRATION_RESPONSE" | grep -o '"feeder_id":"[^"]*' | cut -d'"' -f4)

    if [ -z "$FEEDER_API_KEY" ]; then
        echo "❌ Registration failed!"
        echo "Response: $REGISTRATION_RESPONSE"
        exit 1
    fi

    LINKED_TO_USER=$(echo "$REGISTRATION_RESPONSE" | grep -o '"linked_to_user":true' || echo "")
    
    echo "✅ Feeder registered!"
    echo "   Feeder ID: $FEEDER_ID"
    echo "   API Key: ${FEEDER_API_KEY:0:20}..."
    if [ ! -z "$LINKED_TO_USER" ]; then
        echo "   ✅ Linked to your account - view it in your dashboard!"
    else
        echo "   ℹ️  Standalone feeder (can be linked to your account later)"
    fi
    echo ""
    echo "⚠️  IMPORTANT: Save your API key! It won't be shown again."
    echo "   API Key: $FEEDER_API_KEY"
    echo ""
fi

echo "📦 Installing SDK..."
cd ~
npm install @dhightnm/feeder-sdk axios 2>/dev/null || {
    echo "Retrying npm install..."
    npm install @dhightnm/feeder-sdk axios
}

echo ""
echo "📝 Creating client script..."
cat > ~/feeder-client.js << 'CLIENT_SCRIPT' 2>/dev/null || true
#!/usr/bin/env node

const { FeederClient } = require('@dhightnm/feeder-sdk');
const axios = require('axios');
const http = require('http');
const https = require('https');

const FEEDER_API_URL = process.env.FEEDER_API_URL || 'FEEDER_API_URL_PLACEHOLDER';
const FEEDER_API_KEY = process.env.FEEDER_API_KEY;
const DUMP1090_URL = process.env.DUMP1090_URL || 'DUMP1090_URL_PLACEHOLDER';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10);
const MAX_MEMORY_MB = parseInt(process.env.MAX_MEMORY_MB || '200', 10);

if (!FEEDER_API_KEY) {
  console.error('Error: FEEDER_API_KEY environment variable required');
  process.exit(1);
}

// Configure HTTP agents with connection limits to prevent FD exhaustion
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 5,
  maxFreeSockets: 2,
  timeout: 5000,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 5,
  maxFreeSockets: 2,
  timeout: 5000,
});

const client = new FeederClient({
  apiUrl: FEEDER_API_URL,
  apiKey: FEEDER_API_KEY,
  timeout: 8000, // 8 second timeout
  retryAttempts: 2, // Reduce retries to prevent accumulation
});

// Configure axios for dump1090 with connection limits
const dump1090Client = axios.create({
  timeout: 5000,
  httpAgent: httpAgent,
  httpsAgent: httpsAgent,
  maxRedirects: 3,
});

let isRunning = true;
let pollInterval = null;
let isPolling = false; // Prevent overlapping polls
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 10;
let lastMemoryCheck = Date.now();

// Memory monitoring
function checkMemory() {
  const now = Date.now();
  if (now - lastMemoryCheck < 60000) return; // Check every minute
  lastMemoryCheck = now;

  const usage = process.memoryUsage();
  const heapUsedMB = usage.heapUsed / 1024 / 1024;
  const rssMB = usage.rss / 1024 / 1024;

  if (rssMB > MAX_MEMORY_MB) {
    console.error(`Memory usage too high: ${rssMB.toFixed(2)}MB RSS, ${heapUsedMB.toFixed(2)}MB heap`);
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    // If still too high, restart
    if (rssMB > MAX_MEMORY_MB * 1.5) {
      console.error('Memory critical, exiting for systemd restart');
      process.exit(1);
    }
  }
}

// Circuit breaker pattern
function shouldSkipPoll() {
  if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
    // Wait longer between polls when service is down
    return Date.now() % 30000 < 5000; // Only poll every 30 seconds
  }
  return false;
}

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
  if (!isRunning || isPolling) return;
  
  // Circuit breaker
  if (shouldSkipPoll()) {
    return;
  }

  isPolling = true;
  const startTime = Date.now();

  try {
    // Check memory before polling
    checkMemory();

    const response = await dump1090Client.get(DUMP1090_URL);
    const aircraft = response.data.aircraft || [];

    if (aircraft.length === 0) {
      consecutiveErrors = 0; // Reset on success
      return;
    }

    const states = aircraft
      .filter(ac => ac.lat !== undefined && ac.lon !== undefined)
      .map(transformAircraft);

    if (states.length === 0) {
      consecutiveErrors = 0;
      return;
    }

    // Add timeout wrapper to prevent hanging
    const submitPromise = client.submitBatch(states);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Submit timeout')), 10000)
    );

    const result = await Promise.race([submitPromise, timeoutPromise]);
    
    consecutiveErrors = 0; // Reset on success
    
    const duration = Date.now() - startTime;
    if (duration > POLL_INTERVAL) {
      console.error(`Warning: Poll took ${duration}ms (longer than interval ${POLL_INTERVAL}ms)`);
    }

    if (process.stdout.isTTY) {
      console.log(`✓ [${new Date().toISOString()}] Submitted ${result.processed} aircraft`);
    }
  } catch (error) {
    consecutiveErrors++;
    const errorMessage = error.message || 'Unknown error';
    
    // Log all errors when service is down
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      console.error(`✗ Service down (${consecutiveErrors} consecutive errors): ${errorMessage}`);
    } else if (Math.random() < 0.1) { // Log 10% of other errors
      console.error(`✗ Error: ${errorMessage}`);
    }

    // If too many errors, exit and let systemd restart us
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS * 2) {
      console.error('Too many consecutive errors, exiting for restart');
      process.exit(1);
    }
  } finally {
    isPolling = false;
  }
}

function start() {
  if (process.stdout.isTTY) {
    console.log('Feeder Client Starting...');
    console.log(`Server: ${FEEDER_API_URL}`);
    console.log(`Poll interval: ${POLL_INTERVAL}ms`);
    console.log(`Max memory: ${MAX_MEMORY_MB}MB\n`);
  }

  // Initial poll (non-blocking with timeout)
  setTimeout(() => {
    pollAndSubmit().catch(() => {});
  }, 1000);

  // Set up interval with overlap protection
  pollInterval = setInterval(() => {
    if (!isPolling) {
      pollAndSubmit().catch(() => {});
    }
  }, POLL_INTERVAL);
}

function shutdown(signal) {
  if (!isRunning) return;
  
  isRunning = false;
  if (process.stdout.isTTY) {
    console.log(`\n${signal} received, shutting down...`);
  }
  
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  // Close HTTP agents
  httpAgent.destroy();
  httpsAgent.destroy();

  // Force exit after timeout
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(0);
  }, 5000);

  // Try graceful shutdown
  process.exit(0);
}

// Handle signals for graceful shutdown
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught exceptions - exit after logging
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error.message, error.stack);
  // Exit to let systemd restart us
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  // Don't exit immediately, but log it
});

// Start the client
start();
CLIENT_SCRIPT

# Replace placeholders with actual values
sed -i "s|FEEDER_API_URL_PLACEHOLDER|$FEEDER_API_URL|g" ~/feeder-client.js
sed -i "s|DUMP1090_URL_PLACEHOLDER|$DUMP1090_URL|g" ~/feeder-client.js

chmod +x ~/feeder-client.js

echo ""
echo "🧪 Test: Skipped (will verify after service starts)"
echo ""

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
Environment="MAX_MEMORY_MB=200"
Environment="NODE_OPTIONS=--max-old-space-size=200"
WorkingDirectory=$HOME
ExecStart=$(which node) $HOME/feeder-client.js
Restart=always
RestartSec=30
StandardOutput=journal
StandardError=journal
StandardInput=null
TimeoutStartSec=30
TimeoutStopSec=30
MemoryMax=250M
MemoryHigh=200M
KillMode=mixed
KillSignal=SIGTERM
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

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

sudo systemctl daemon-reload
sudo systemctl restart systemd-journald

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


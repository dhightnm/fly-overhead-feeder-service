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

# Step 2: Register feeder
echo ""
echo "📝 Register your feeder"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
read -p "Feeder name: " FEEDER_NAME
read -p "Latitude (optional, press Enter to skip): " LATITUDE
read -p "Longitude (optional, press Enter to skip): " LONGITUDE

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
cat > ~/feeder-client.js << CLIENT_SCRIPT
#!/usr/bin/env node

const { FeederClient } = require('@dhightnm/feeder-sdk');
const axios = require('axios');

const FEEDER_API_URL = process.env.FEEDER_API_URL || '$FEEDER_API_URL';
const FEEDER_API_KEY = process.env.FEEDER_API_KEY || '$FEEDER_API_KEY';
const DUMP1090_URL = process.env.DUMP1090_URL || '$DUMP1090_URL';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10);

const client = new FeederClient({
  apiUrl: FEEDER_API_URL,
  apiKey: FEEDER_API_KEY,
});

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
    console.log(\`✓ [\${new Date().toISOString()}] Submitted \${result.processed} aircraft\`);
  } catch (error) {
    console.error(\`✗ Error: \${error.message}\`);
  }
}

console.log('Feeder Client Starting...');
console.log(\`Server: \${FEEDER_API_URL}\`);
console.log(\`Poll interval: \${POLL_INTERVAL}ms\n\`);

pollAndSubmit();
setInterval(pollAndSubmit, POLL_INTERVAL);
CLIENT_SCRIPT

chmod +x ~/feeder-client.js

# Step 5: Test
echo ""
echo "🧪 Testing connection..."
read -p "Test the client now? (Y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    timeout 10 node ~/feeder-client.js || true
    echo ""
fi

# Step 6: Create systemd service
echo ""
echo "🔧 Setting up auto-start service..."
sudo tee /etc/systemd/system/fly-overhead-feeder.service > /dev/null << EOF
[Unit]
Description=Fly Overhead Feeder Client
After=network.target

[Service]
Type=simple
User=$USER
Environment="FEEDER_API_URL=$FEEDER_API_URL"
Environment="FEEDER_API_KEY=$FEEDER_API_KEY"
Environment="DUMP1090_URL=$DUMP1090_URL"
WorkingDirectory=$HOME
ExecStart=$(which node) $HOME/feeder-client.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
sudo systemctl daemon-reload
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
echo "🔑 Your API Key (save this!):"
echo "   $FEEDER_API_KEY"
echo ""
echo "🌐 Check your feeder status:"
echo "   curl $FEEDER_API_URL/api/v1/feeders/me \\"
echo "     -H \"Authorization: Bearer $FEEDER_API_KEY\""
echo ""
echo "Thank you for contributing to Fly Overhead! 🎉"
echo ""


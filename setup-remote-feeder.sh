#!/bin/bash
# Quick setup script for remote feeder installation
# Run this on your friend's feeder device

set -e

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║     Fly Overhead Feeder - Remote Setup                  ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Configuration (update these)
FEEDER_API_URL="${FEEDER_API_URL:-http://your-server-ip:3006}"
FEEDER_API_KEY="${FEEDER_API_KEY:-}"
DUMP1090_URL="${DUMP1090_URL:-http://127.0.0.1:8080/data/aircraft.json}"

# Check if API key is provided
if [ -z "$FEEDER_API_KEY" ]; then
    echo "❌ Error: FEEDER_API_KEY environment variable required"
    echo ""
    echo "Usage:"
    echo "  FEEDER_API_URL=http://your-server:3006 \\"
    echo "  FEEDER_API_KEY=sk_live_... \\"
    echo "  bash setup-remote-feeder.sh"
    echo ""
    exit 1
fi

echo "📋 Configuration:"
echo "   Server: $FEEDER_API_URL"
echo "   dump1090: $DUMP1090_URL"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "✅ Node.js $(node --version) already installed"
fi

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install -g @dhightnm/feeder-sdk axios 2>/dev/null || {
    echo "Installing locally..."
    mkdir -p ~/feeder-client
    cd ~/feeder-client
    npm init -y
    npm install @dhightnm/feeder-sdk axios
}

# Create client script
echo ""
echo "📝 Creating client script..."
cat > ~/feeder-client.js << 'CLIENT_SCRIPT'
#!/usr/bin/env node

const { FeederClient } = require('@dhightnm/feeder-sdk');
const axios = require('axios');

// Configuration from environment
const FEEDER_API_URL = process.env.FEEDER_API_URL || 'http://localhost:3006';
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
    console.log(`✓ [${new Date().toISOString()}] Submitted ${result.processed} aircraft`);
  } catch (error) {
    console.error(`✗ Error: ${error.message}`);
  }
}

console.log('Feeder Client Starting...');
console.log(`Server: ${FEEDER_API_URL}`);
console.log(`Poll interval: ${POLL_INTERVAL}ms\n`);

pollAndSubmit();
setInterval(pollAndSubmit, POLL_INTERVAL);
CLIENT_SCRIPT

chmod +x ~/feeder-client.js

# Create systemd service
echo ""
echo "🔧 Creating systemd service..."
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

# Enable and start service
echo ""
echo "🚀 Starting service..."
sudo systemctl daemon-reload
sudo systemctl enable fly-overhead-feeder
sudo systemctl start fly-overhead-feeder

# Wait a moment
sleep 2

# Check status
echo ""
echo "📊 Service status:"
sudo systemctl status fly-overhead-feeder --no-pager -l

echo ""
echo "✅ Setup complete!"
echo ""
echo "To check logs:"
echo "  sudo journalctl -u fly-overhead-feeder -f"
echo ""
echo "To stop:"
echo "  sudo systemctl stop fly-overhead-feeder"
echo ""
echo "To restart:"
echo "  sudo systemctl restart fly-overhead-feeder"
echo ""


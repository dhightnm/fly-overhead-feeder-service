#!/bin/bash

# Manual completion script for Pi setup
# Run this if the automatic script failed

echo "Completing Fly Overhead Feeder setup..."

# Check if feeder-client.js exists
if [ ! -f ~/feeder-client.js ]; then
    echo "❌ Error: ~/feeder-client.js not found"
    echo "   Please run the setup script first"
    exit 1
fi

# Get API key from feeder-client.js
FEEDER_API_KEY=$(grep -o "API_KEY.*=.*'sk_live_[^']*'" ~/feeder-client.js 2>/dev/null | sed "s/.*'\(sk_live_[^']*\)'.*/\1/" | head -1)
FEEDER_API_URL=$(grep -o "API_URL.*=.*'http[^']*'" ~/feeder-client.js 2>/dev/null | sed "s/.*'\(http[^']*\)'.*/\1/" | head -1)
DUMP1090_URL=$(grep -o "DUMP1090_URL.*=.*'http[^']*'" ~/feeder-client.js 2>/dev/null | sed "s/.*'\(http[^']*\)'.*/\1/" | head -1)

if [ -z "$FEEDER_API_KEY" ] || [ -z "$FEEDER_API_URL" ]; then
    echo "❌ Error: Could not extract configuration from feeder-client.js"
    exit 1
fi

echo "✅ Found configuration:"
echo "   API URL: $FEEDER_API_URL"
echo "   Dump1090 URL: $DUMP1090_URL"

# Create systemd service
echo ""
echo "📋 Creating systemd service..."

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
StandardOutput=journal
StandardError=journal
StandardInput=null
TimeoutStartSec=30
TimeoutStopSec=10
KillMode=mixed
KillSignal=SIGTERM
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

echo "✅ Service file created"

# Configure journald log limits
echo ""
echo "📋 Configuring systemd journal log limits (12h retention)..."

sudo mkdir -p /etc/systemd/journald.conf.d
sudo tee /etc/systemd/journald.conf.d/fly-overhead-feeder.conf > /dev/null << JOURNALCONF
[Journal]
SystemMaxUse=20M
SystemKeepFree=50M
SystemMaxFileSize=5M
MaxRetentionSec=12h
JOURNALCONF

echo "✅ Journal limits configured"

# Restart journald to apply limits
sudo systemctl restart systemd-journald

# Stop existing service if running
if sudo systemctl is-active --quiet fly-overhead-feeder; then
    echo ""
    echo "🛑 Stopping existing service..."
    sudo systemctl stop fly-overhead-feeder
fi

# Enable and start service
echo ""
echo "🚀 Starting service..."
sudo systemctl daemon-reload
sudo systemctl enable fly-overhead-feeder
sudo systemctl start fly-overhead-feeder

sleep 2

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Setup complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Service Status:"
sudo systemctl status fly-overhead-feeder --no-pager -l | head -15
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Useful commands:"
echo "   View logs:       sudo journalctl -u fly-overhead-feeder -f"
echo "   Check status:    sudo systemctl status fly-overhead-feeder"
echo "   Restart:      sudo systemctl restart fly-overhead-feeder"
echo "   Stop:         sudo systemctl stop fly-overhead-feeder"
echo ""
echo "ℹ️  The service runs automatically in the background."
echo "   Do NOT run ~/feeder-client.js directly - use the systemctl commands above."
echo ""
echo "🔑 Your API Key (save this!):"
echo "   $FEEDER_API_KEY"
echo ""
echo "Thank you for contributing to Fly Overhead! 🎉"
echo ""


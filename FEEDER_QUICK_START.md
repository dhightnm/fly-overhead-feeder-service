# Quick Start Guide for Feeder Operators

## Connect Your Feeder in 2 Minutes

This guide will help you connect your existing ADS-B feeder (PiAware, dump1090, etc.) to the fly-overhead service.

## Prerequisites

- An ADS-B feeder running (PiAware, dump1090, tar1090, etc.)
- Node.js installed (version 14 or higher)
- Network access to the feeder service

## Option 1: Interactive Setup (Recommended)

The easiest way to get started:

```bash
npx @fly-overhead/feeder-setup
```

This wizard will:
1. ✅ Auto-detect your feeder type
2. ✅ Test connections
3. ✅ Register your feeder
4. ✅ Generate a ready-to-run client script

## Option 2: One-Line Install

```bash
curl -fsSL https://setup.fly-overhead.com | bash
```

## Option 3: Manual Setup

### Step 1: Register Your Feeder

```bash
curl -X POST http://your-server:3006/api/v1/feeders/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Home PiAware",
    "location": {
      "latitude": 40.7128,
      "longitude": -74.0060
    }
  }'
```

Save the `api_key` from the response!

### Step 2: Install Client

```bash
npm install @fly-overhead/feeder-client
```

### Step 3: Run Client

```bash
FEEDER_API_URL=http://your-server:3006 \
FEEDER_API_KEY=sk_live_your_key_here \
node node_modules/@fly-overhead/feeder-client/dist/universal-feeder-client.js
```

## Option 4: Use Pre-Built Scripts

### For PiAware

```bash
# Download PiAware client
curl -O https://raw.githubusercontent.com/fly-overhead/feeder-service/main/clients/piaware/PiAwareClient.js

# Run it
FEEDER_API_URL=http://your-server:3006 \
FEEDER_API_KEY=sk_live_your_key_here \
node PiAwareClient.js
```

## Running as a Service

### systemd (Linux)

Create `/etc/systemd/system/fly-overhead-feeder.service`:

```ini
[Unit]
Description=Fly Overhead Feeder Client
After=network.target

[Service]
Type=simple
User=pi
Environment="FEEDER_API_URL=http://your-server:3006"
Environment="FEEDER_API_KEY=sk_live_your_key_here"
WorkingDirectory=/home/pi
ExecStart=/usr/bin/node /home/pi/feeder-client.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable fly-overhead-feeder
sudo systemctl start fly-overhead-feeder
sudo systemctl status fly-overhead-feeder
```

### Docker

```bash
docker run -d \
  --name fly-overhead-feeder \
  --restart unless-stopped \
  -e FEEDER_API_URL=http://your-server:3006 \
  -e FEEDER_API_KEY=sk_live_your_key_here \
  fly-overhead/feeder-client:latest
```

## Verify It's Working

### Check Status

```bash
curl http://your-server:3006/api/v1/feeders/me \
  -H "Authorization: Bearer sk_live_your_key_here"
```

### Check Data Quality

```bash
curl http://your-server:3006/api/v1/feeders/me/quality \
  -H "Authorization: Bearer sk_live_your_key_here"
```

### View Statistics

```bash
curl http://your-server:3006/api/v1/feeders/me/stats?days=7 \
  -H "Authorization: Bearer sk_live_your_key_here"
```

## Troubleshooting

### "Could not detect feeder type"

Make sure your feeder is running and accessible:
- PiAware/dump1090: `curl http://localhost:8080/data/aircraft.json`
- tar1090: `curl http://localhost:8080/tar1090/data/aircraft.json`

### "Could not connect to server"

- Check the server URL is correct
- Verify network connectivity: `ping your-server`
- Check firewall rules
- Ensure the feeder service is running

### "Invalid API key"

- Make sure you copied the full API key
- Check for extra spaces or newlines
- Re-register if needed

### "Rate limit exceeded"

- You're sending data too frequently
- Increase poll interval (default: 5000ms)
- Contact support if you need higher limits

## Next Steps

- 📊 View your feeder dashboard
- 📈 Check data quality metrics
- 🔔 Set up alerts for downtime
- 💬 Join the community forum

## Support

- 📖 Documentation: https://docs.fly-overhead.com
- 💬 Community: https://forum.fly-overhead.com
- 🐛 Issues: https://github.com/fly-overhead/feeder-service/issues
- 📧 Email: support@fly-overhead.com


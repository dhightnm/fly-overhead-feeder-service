# PiAware Setup Instructions

## Step-by-Step Guide to Set Up Feeder Client on Your PiAware Device

### Prerequisites
- SSH access to your PiAware device
- Node.js installed (PiAware usually has Node.js)
- Your feeder service running and accessible from PiAware

### Step 1: Copy the Client Script to PiAware

From your local machine, copy the script to your PiAware:

```bash
# Replace pi@your-piaware-ip with your actual PiAware SSH details
scp piaware-feeder-client.js pi@your-piaware-ip:~/
```

Or manually create the file on PiAware:

```bash
# On PiAware device
nano ~/piaware-feeder-client.js
# Then paste the contents of piaware-feeder-client.js
```

### Step 2: Update Configuration

Edit the script on your PiAware device:

```bash
nano ~/piaware-feeder-client.js
```

Update these lines (around line 15-20):
```javascript
const YOUR_SERVER_IP = '192.168.58.15'; // Your server's IP address
```

And verify the API key is set (it should already be there from registration).

### Step 3: Install Dependencies

On your PiAware device:

```bash
# Check if Node.js is installed
node --version

# If not installed, install it:
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install axios (required dependency)
npm install axios
```

### Step 4: Test the Connection

First, test that your PiAware can reach your server:

```bash
# On PiAware device
curl http://192.168.58.15:3006/health
```

You should see a JSON response with status "ok".

### Step 5: Test the Client Script

Run the client manually to test:

```bash
# On PiAware device
node ~/piaware-feeder-client.js
```

You should see output like:
```
PiAware Feeder Client
=====================
Feeder API: http://192.168.58.15:3006/api/v1/feeders/data
dump1090 URL: http://localhost:8080/data/aircraft.json
Poll interval: 5000ms

[2024-01-01T12:00:00.000Z] Fetched 15 aircraft from dump1090
Submitting 12 aircraft...
✓ Success: 12 processed in 45ms
```

Press Ctrl+C to stop.

### Step 6: Set Up as a Service (Optional but Recommended)

Create a systemd service to run automatically:

```bash
# On PiAware device
sudo nano /etc/systemd/system/piaware-feeder.service
```

Add this content:
```ini
[Unit]
Description=PiAware Feeder Client for fly-overhead
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi
ExecStart=/usr/bin/node /home/pi/piaware-feeder-client.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable piaware-feeder.service
sudo systemctl start piaware-feeder.service
```

Check status:
```bash
sudo systemctl status piaware-feeder.service
```

View logs:
```bash
sudo journalctl -u piaware-feeder.service -f
```

### Step 7: Verify It's Working

On your server, check the feeder status:

```bash
curl http://localhost:3006/api/v1/feeders/me \
  -H "Authorization: Bearer sk_live_e4a49efddf0cef69ded52b6e37e519ec39f405b764c81aa8dcabc3fdd6230c60"
```

Or check the database:

```bash
# On your server
docker exec fly-overhead-db psql -U postgres -d fly_overhead \
  -c "SELECT COUNT(*) FROM aircraft_states WHERE data_source = 'feeder';"
```

### Troubleshooting

**Issue: "Cannot connect to server"**
- Check firewall: `sudo ufw allow 3006/tcp` (on server)
- Verify server IP is correct in the script
- Test connectivity: `curl http://YOUR_SERVER_IP:3006/health`

**Issue: "dump1090 not found"**
- Check dump1090 is running: `curl http://localhost:8080/data/aircraft.json`
- PiAware uses port 8080 by default
- If different port, update `DUMP1090_URL` in script

**Issue: "Module not found: axios"**
- Install: `npm install axios`
- Or install globally: `sudo npm install -g axios`

**Issue: "Authentication failed"**
- Verify API key is correct
- Check feeder status: `SELECT status FROM feeders WHERE feeder_id = '...';`
- Ensure feeder is 'active'

### Quick Test Commands

```bash
# Test dump1090 on PiAware
curl http://localhost:8080/data/aircraft.json | head -20

# Test server connectivity from PiAware
curl http://192.168.58.15:3006/health

# Run client manually
node ~/piaware-feeder-client.js

# Check service logs
sudo journalctl -u piaware-feeder.service -n 50
```

### Your Credentials (Save These!)

- **Feeder ID**: `feeder_775269c27df2f108d156fe14`
- **API Key**: `sk_live_e4a49efddf0cef69ded52b6e37e519ec39f405b764c81aa8dcabc3fdd6230c60`
- **Server IP**: `192.168.58.15:3006`

### Next Steps

Once running, you can:
1. Monitor stats: `GET /api/v1/feeders/me/stats`
2. Check health: `GET /api/v1/feeders/me/health`
3. View aircraft data in your main fly-overhead service


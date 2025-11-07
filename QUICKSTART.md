# Quick Start Guide

Get the feeder ingestion service up and running in 5 minutes.

## Prerequisites

- Docker and Docker Compose installed
- Main fly-overhead service running (for shared network and database)
- Node.js 18+ (for local development)

## Option 1: Docker Deployment (Recommended)

### Step 1: Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set:
```bash
PORT=3006
POSTGRES_URL=postgresql://postgres:postgres@db:5432/fly_overhead
API_KEY_SECRET=<generate-a-random-secret>
NODE_ENV=production
```

Generate a random secret:
```bash
openssl rand -hex 32
```

### Step 2: Run Database Migrations

```bash
# Install dependencies first
npm install

# Run migrations
npm run migrate
```

Expected output:
```
✓ Database connection successful
Running migration: 001_create_feeder_tables.sql
✓ 001_create_feeder_tables.sql completed successfully
✓ All migrations completed successfully
```

### Step 3: Start Service

```bash
docker-compose up -d
```

### Step 4: Verify Service

```bash
# Check health
curl http://localhost:3006/health

# Expected output:
# {
#   "status": "ok",
#   "timestamp": "2024-01-01T12:00:00.000Z",
#   "uptime": 10.5,
#   "checks": {
#     "database": "connected"
#   }
# }
```

### Step 5: Register Your First Feeder

```bash
# Option A: Interactive registration
node examples/register-feeder.js

# Option B: Direct API call
curl -X POST http://localhost:3006/api/v1/feeders/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My PiAware Feeder",
    "location": {
      "latitude": 37.7749,
      "longitude": -122.4194
    },
    "metadata": {
      "hardware": "Raspberry Pi 4",
      "software": "PiAware"
    }
  }'
```

**IMPORTANT**: Save the API key from the response! It's shown only once.

### Step 6: Start Feeding Data

If you have PiAware/dump1090 running locally:

```bash
export FEEDER_API_KEY=sk_live_your_api_key_here
export FEEDER_API_URL=http://localhost:3006/api/v1/feeders/data
export DUMP1090_URL=http://localhost:8080/data/aircraft.json

node examples/piaware-client.js
```

## Option 2: Local Development

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Configure Environment

```bash
cp .env.example .env
```

For local development, use the external database port:
```bash
PORT=3006
POSTGRES_URL=postgresql://postgres:postgres@192.168.58.15:5433/fly_overhead
API_KEY_SECRET=your-secret-here
NODE_ENV=development
LOG_LEVEL=debug
```

### Step 3: Run Migrations

```bash
npm run migrate
```

### Step 4: Start Service

```bash
# Development mode (with auto-reload)
npm run dev

# Or production mode
npm start
```

## Testing the Service

Run the automated test script:

```bash
./examples/test-api.sh
```

Or test individual endpoints:

```bash
# Health check
curl http://localhost:3006/health

# Register feeder
curl -X POST http://localhost:3006/api/v1/feeders/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Feeder"}'

# Submit data (requires API key)
curl -X POST http://localhost:3006/api/v1/feeders/data \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "states": [{
      "icao24": "abc123",
      "callsign": "TEST123",
      "latitude": 37.7749,
      "longitude": -122.4194,
      "baro_altitude": 10000,
      "velocity": 200,
      "on_ground": false
    }]
  }'

# Get feeder info
curl http://localhost:3006/api/v1/feeders/me \
  -H "Authorization: Bearer sk_live_..."
```

## Common Issues

### Issue: Database connection failed

**Solution**:
```bash
# Check if main service is running
docker ps | grep fly-overhead

# Check if database is accessible
docker exec fly-overhead-db psql -U postgres -d fly_overhead -c "SELECT NOW();"

# Verify connection string in .env
cat .env | grep POSTGRES_URL
```

### Issue: Docker network not found

**Solution**:
```bash
# Create the network manually
docker network create fly-overhead-network

# Or start the main service first (creates network automatically)
cd ../fly-overhead
docker-compose up -d
```

### Issue: Port 3006 already in use

**Solution**:
```bash
# Find what's using the port
lsof -i :3006

# Change port in .env
echo "PORT=3007" >> .env

# Update docker-compose.yml ports section
# Change "3006:3006" to "3007:3006"
```

### Issue: API key authentication fails

**Check**:
1. API key format: Must start with `sk_live_`
2. Authorization header: `Authorization: Bearer <api_key>`
3. Feeder status: Must be `active`

```bash
# Check feeder status in database
docker exec fly-overhead-db psql -U postgres -d fly_overhead \
  -c "SELECT feeder_id, status FROM feeders;"
```

## Next Steps

1. ✅ Service is running
2. ✅ Feeder registered
3. ⏳ Set up PiAware client to continuously feed data
4. ⏳ Monitor feeder statistics at `/api/v1/feeders/me/stats`
5. ⏳ Check data in main service at `http://localhost:3005/api/aircraft`

## Monitoring

### View Logs

```bash
# Docker logs
docker logs fly-overhead-feeder-ingestion -f

# Local logs
tail -f logs/combined.log
```

### Check Database

```bash
# Count feeders
docker exec fly-overhead-db psql -U postgres -d fly_overhead \
  -c "SELECT COUNT(*) FROM feeders;"

# View recent aircraft from feeders
docker exec fly-overhead-db psql -U postgres -d fly_overhead \
  -c "SELECT icao24, callsign, data_source, feeder_id, ingestion_timestamp 
      FROM aircraft_states 
      WHERE data_source = 'feeder' 
      ORDER BY ingestion_timestamp DESC 
      LIMIT 10;"
```

### Service Metrics

```bash
# Feeder health
curl http://localhost:3006/api/v1/feeders/me/health \
  -H "Authorization: Bearer sk_live_..."

# Feeder statistics
curl http://localhost:3006/api/v1/feeders/me/stats?days=7 \
  -H "Authorization: Bearer sk_live_..."
```

## Stopping the Service

```bash
# Docker
docker-compose down

# Local development
# Press Ctrl+C in the terminal running npm run dev
```

## Uninstall

To completely remove the service:

```bash
# Stop and remove containers
docker-compose down -v

# Remove images
docker rmi fly-overhead-feeder-ingestion

# Remove database tables (optional)
docker exec fly-overhead-db psql -U postgres -d fly_overhead \
  -c "DROP TABLE IF EXISTS feeder_stats CASCADE;"
docker exec fly-overhead-db psql -U postgres -d fly_overhead \
  -c "DROP TABLE IF EXISTS feeders CASCADE;"
```

## Resources

- **Full Documentation**: See [README.md](README.md)
- **Integration Guide**: See [INTEGRATION.md](INTEGRATION.md)
- **API Examples**: See `examples/` directory
- **License**: See [LICENSE](LICENSE)

## Support

If you encounter issues:

1. Check logs: `docker logs fly-overhead-feeder-ingestion`
2. Verify database connection: `npm run migrate`
3. Test API: `./examples/test-api.sh`
4. Review [INTEGRATION.md](INTEGRATION.md) for troubleshooting

Happy feeding! 🛩️


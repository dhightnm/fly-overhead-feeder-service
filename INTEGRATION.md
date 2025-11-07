# Integration Guide

This document provides detailed information about integrating the feeder ingestion service with the existing fly-overhead system.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Docker Network                           │
│                  fly-overhead-network                        │
│                                                              │
│  ┌──────────────────┐         ┌──────────────────┐         │
│  │  Main Service    │         │  Feeder Service  │         │
│  │  (fly-overhead)  │         │  (Port 3006)     │         │
│  │  Port 3005       │         │                  │         │
│  └────────┬─────────┘         └────────┬─────────┘         │
│           │                             │                   │
│           │         ┌───────────────────┘                   │
│           │         │                                       │
│           └─────────┴─────────┐                            │
│                     ┌──────────▼──────────┐                │
│                     │   PostgreSQL        │                │
│                     │   + PostGIS         │                │
│                     │   (Port 5432)       │                │
│                     └─────────────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

## Database Integration

### Shared Database Pattern

Both services connect to the same PostgreSQL database:

- **Database Name**: `fly_overhead`
- **Internal Port**: 5432
- **External Port**: 5433 (for remote connections)
- **Connection String**: `postgresql://postgres:postgres@db:5432/fly_overhead`

### Data Source Priority System

The system uses a priority-based approach to handle data from multiple sources:

| Source     | Priority | Description                    |
|------------|----------|--------------------------------|
| manual     | 50       | User manual input             |
| live       | 40       | Live API data                 |
| websocket  | 30       | Real-time WebSocket           |
| **feeder** | **30**   | **Feeder data (this service)**|
| opensky    | 20       | OpenSky Network               |
| database   | 20       | Cached database               |
| predicted  | 10       | Trajectory prediction         |

Feeder data has a priority of 30, which means:
- It will override OpenSky Network data (priority 20)
- It will be overridden by live API data (priority 40) or manual input (priority 50)
- It has the same priority as WebSocket data (30)

### Database Schema Changes

The feeder service adds these columns to existing tables:

**aircraft_states**:
```sql
data_source TEXT DEFAULT 'opensky'
feeder_id TEXT REFERENCES feeders(feeder_id)
source_priority INT DEFAULT 10
ingestion_timestamp TIMESTAMPTZ DEFAULT NOW()
```

**aircraft_states_history**:
```sql
data_source TEXT DEFAULT 'opensky'
feeder_id TEXT REFERENCES feeders(feeder_id)
source_priority INT DEFAULT 10
```

### New Tables

**feeders**:
- Stores feeder registration information
- API key hashes (bcrypt)
- Location (PostGIS GEOGRAPHY)
- Status (active, inactive, suspended)
- Metadata (JSONB)

**feeder_stats**:
- Daily statistics per feeder
- Message counts
- Data quality scores
- Error tracking

## Data Flow

### 1. Feeder Registration

```
Client → POST /api/v1/feeders/register
       ↓
    Validation
       ↓
  Generate API Key & Feeder ID
       ↓
  Hash API Key (bcrypt)
       ↓
  Insert into feeders table
       ↓
  Return API Key (only time it's shown!)
```

### 2. Data Ingestion

```
Feeder → POST /api/v1/feeders/data
       ↓
  Authentication Middleware
       ↓
  Rate Limiting
       ↓
  Validation (aircraft state data)
       ↓
  Transform to OpenSky Format (19-item array)
       ↓
  Batch Processing
       ↓
  Insert/Update aircraft_states (UPSERT with priority check)
       ↓
  Insert aircraft_states_history
       ↓
  Update feeder_stats
       ↓
  Update feeder last_seen_at
       ↓
  Return Success Response
```

### 3. Main Service Integration

The main service automatically benefits from feeder data:

```sql
-- Main service queries aircraft_states as usual
SELECT * FROM aircraft_states WHERE ...;

-- Results now include feeder data with source_priority = 30
-- No changes needed to main service queries!
```

## API Key Authentication Flow

### Simplified Implementation (Current)

1. Extract Bearer token from Authorization header
2. Query all active feeders from database
3. Compare token against each feeder's api_key_hash using bcrypt
4. Return matching feeder

⚠️ **Note**: This implementation is not scalable for production with many feeders.

### Recommended Production Implementation

For production with many feeders, implement one of these:

**Option 1: API Key Lookup Table**
```sql
CREATE TABLE api_keys (
  id SERIAL PRIMARY KEY,
  key_prefix TEXT NOT NULL UNIQUE,  -- First 12 chars of API key
  feeder_id TEXT NOT NULL REFERENCES feeders(feeder_id),
  key_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
```

**Option 2: Redis Cache**
```javascript
// Cache API key -> feeder_id mapping in Redis
// TTL: 1 hour
await redis.setex(`apikey:${keyHash}`, 3600, feederId);
```

**Option 3: JWT Tokens**
- Use JWT tokens instead of API keys
- Include feeder_id in token payload
- Verify signature on each request
- No database lookup needed

## Network Configuration

### Docker Compose Setup

The feeder service must use the same Docker network as the main service:

```yaml
networks:
  fly-overhead-network:
    external: true  # Use existing network
```

### Service Discovery

Services can communicate using Docker service names:

- Main service: `http://server:3005`
- Feeder service: `http://feeder-ingestion:3006`
- Database: `postgresql://postgres:postgres@db:5432/fly_overhead`

## Environment Configuration

### Development (Local)

```bash
# Feeder Service
POSTGRES_URL=postgresql://postgres:postgres@localhost:5433/fly_overhead
PORT=3006

# Main Service (no changes needed)
POSTGRES_URL=postgresql://postgres:postgres@localhost:5433/fly_overhead
PORT=3005
```

### Production (Docker)

```bash
# Feeder Service
POSTGRES_URL=postgresql://postgres:postgres@db:5432/fly_overhead
PORT=3006

# Main Service (no changes needed)
POSTGRES_URL=postgresql://postgres:postgres@db:5432/fly_overhead
PORT=3005
```

## Data Format Compatibility

### OpenSky Extended Format

The feeder service transforms incoming JSON data to match the exact format used by the main service:

**19-Item Array**:
```javascript
[
  icao24,           // 0: String (hex)
  callsign,         // 1: String or null
  origin_country,   // 2: String or null
  time_position,    // 3: Unix timestamp or null
  last_contact,     // 4: Unix timestamp (required)
  longitude,        // 5: Float or null
  latitude,         // 6: Float or null
  baro_altitude,    // 7: Float (meters) or null
  on_ground,        // 8: Boolean
  velocity,         // 9: Float (m/s) or null
  true_track,       // 10: Float (degrees) or null
  vertical_rate,    // 11: Float (m/s) or null
  sensors,          // 12: Array or null
  geo_altitude,     // 13: Float (meters) or null
  squawk,           // 14: String or null
  spi,              // 15: Boolean
  position_source,  // 16: Integer (0-3)
  category,         // 17: Integer (0-19) or null
  created_at        // 18: Timestamp
]
```

### Database Insert Pattern

**aircraft_states** (with UPSERT):
```sql
INSERT INTO aircraft_states (
  icao24, callsign, ..., created_at,
  data_source, feeder_id, source_priority
) VALUES ($1, $2, ..., $19, 'feeder', $20, 30)
ON CONFLICT (icao24) DO UPDATE SET
  ... (all fields)
WHERE aircraft_states.source_priority <= 30;
```

**aircraft_states_history** (append only):
```sql
INSERT INTO aircraft_states_history (
  icao24, callsign, ...,
  data_source, feeder_id, source_priority
) VALUES ($1, $2, ..., 'feeder', $19, 30);
```

## Monitoring Integration

### Health Checks

**Feeder Service**:
- `/health` - Overall health
- `/ready` - Readiness probe
- `/live` - Liveness probe

**Main Service** (no changes needed):
- Continues to use existing health check

### Logging

Both services use Winston logger with consistent format:

```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "level": "info",
  "message": "...",
  "service": "fly-overhead-feeder-ingestion",
  "feeder_id": "...",
  ...
}
```

## Performance Considerations

### Batch Processing

The feeder service processes aircraft states in batches:

- **Default Batch Size**: 50 states
- **Batch Interval**: 1000ms max
- **Yields to event loop** between batches

### Connection Pooling

Both services use pg-promise connection pooling:

- **Min Connections**: 2
- **Max Connections**: 10

### Rate Limiting

Prevents abuse and ensures fair resource allocation:

- **Data Submission**: 1000 requests/minute per feeder
- **Registration**: 5 requests/hour per IP
- **General API**: 100 requests/15 minutes

## Migration Guide

### Step 1: Backup Database

```bash
docker exec fly-overhead-db pg_dump -U postgres fly_overhead > backup.sql
```

### Step 2: Run Migrations

```bash
cd fly-overhead-feeder-service
npm run migrate
```

This adds:
- `feeders` table
- `feeder_stats` table
- New columns to `aircraft_states` and `aircraft_states_history`

### Step 3: Start Feeder Service

```bash
docker-compose up -d
```

### Step 4: Verify Integration

```bash
# Check health
curl http://localhost:3006/health

# Register test feeder
curl -X POST http://localhost:3006/api/v1/feeders/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Feeder"}'

# Check database
docker exec fly-overhead-db psql -U postgres fly_overhead \
  -c "SELECT COUNT(*) FROM feeders;"
```

### Step 5: Main Service (No Changes Required!)

The main service continues to work without modifications:

```bash
# Start/restart main service
docker-compose up -d server

# Verify it can read feeder data
curl http://localhost:3005/api/aircraft
```

## Rollback Procedure

If you need to rollback:

### Option 1: Keep Tables, Stop Service

```bash
# Stop feeder service
docker-compose down feeder-ingestion

# Main service continues to work normally
# Feeder tables remain but are unused
```

### Option 2: Remove Tables

```sql
-- Remove foreign key constraints first
ALTER TABLE aircraft_states DROP CONSTRAINT IF EXISTS fk_aircraft_states_feeder;
ALTER TABLE aircraft_states_history DROP CONSTRAINT IF EXISTS fk_aircraft_history_feeder;

-- Drop new tables
DROP TABLE IF EXISTS feeder_stats;
DROP TABLE IF EXISTS feeders;

-- Remove new columns
ALTER TABLE aircraft_states 
  DROP COLUMN IF EXISTS data_source,
  DROP COLUMN IF EXISTS feeder_id,
  DROP COLUMN IF EXISTS source_priority,
  DROP COLUMN IF EXISTS ingestion_timestamp;

ALTER TABLE aircraft_states_history
  DROP COLUMN IF EXISTS data_source,
  DROP COLUMN IF EXISTS feeder_id,
  DROP COLUMN IF EXISTS source_priority;
```

## Troubleshooting

### Issue: Feeder service can't connect to database

**Check**:
1. Database is running: `docker ps | grep db`
2. Network exists: `docker network ls | grep fly-overhead`
3. Connection string is correct in `.env`

**Solution**:
```bash
# Recreate network
docker network create fly-overhead-network

# Connect feeder service
docker network connect fly-overhead-network fly-overhead-feeder-ingestion
```

### Issue: Main service doesn't see feeder data

**Check**:
1. Feeder data is being inserted: `SELECT COUNT(*) FROM aircraft_states WHERE data_source = 'feeder';`
2. Source priority is correct: `SELECT source_priority FROM aircraft_states WHERE data_source = 'feeder';`
3. Main service is reading from correct database

**Debug Query**:
```sql
SELECT icao24, callsign, data_source, source_priority, ingestion_timestamp
FROM aircraft_states
WHERE data_source = 'feeder'
ORDER BY ingestion_timestamp DESC
LIMIT 10;
```

### Issue: Authentication fails

**Check**:
1. API key format: `sk_live_<64 hex characters>`
2. Bearer token in header: `Authorization: Bearer <api_key>`
3. Feeder status: `SELECT status FROM feeders WHERE feeder_id = '...';`

## Security Considerations

### API Key Management

- API keys are shown **only once** during registration
- Keys are hashed with bcrypt before storage (10 rounds)
- No way to retrieve original key from database

### Rate Limiting

- Prevents abuse and DoS attacks
- Per-feeder limits ensure fair resource allocation
- Returns 429 status code when exceeded

### Input Validation

- All aircraft state data is validated
- Ranges checked (lat/lon, altitude, velocity, etc.)
- Timestamps checked for staleness (max 5 minutes old)
- Malformed data is rejected with detailed errors

### Database Security

- Use environment variables for credentials
- Use strong passwords in production
- Consider read-only user for main service queries
- Use write-only user for feeder service inserts

## Support and Maintenance

### Logs Location

```bash
# Feeder service logs
docker logs fly-overhead-feeder-ingestion

# Or in files (if volume mounted)
tail -f logs/combined.log
tail -f logs/error.log
```

### Monitoring Queries

```sql
-- Feeder activity
SELECT 
  f.feeder_id,
  f.name,
  f.status,
  f.last_seen_at,
  COUNT(a.id) as active_aircraft
FROM feeders f
LEFT JOIN aircraft_states a ON a.feeder_id = f.feeder_id
GROUP BY f.feeder_id, f.name, f.status, f.last_seen_at;

-- Daily statistics
SELECT 
  date,
  SUM(messages_received) as total_messages,
  SUM(unique_aircraft) as total_aircraft,
  AVG(data_quality_score) as avg_quality
FROM feeder_stats
WHERE date >= CURRENT_DATE - 7
GROUP BY date
ORDER BY date DESC;
```

## Next Steps

1. ✅ Complete service implementation
2. ✅ Run database migrations
3. ✅ Deploy feeder service
4. ⏳ Register your PiAware feeder
5. ⏳ Start feeding data
6. ⏳ Monitor stats and health

For questions or issues, refer to the main README.md or check the logs.


# Fly Overhead Feeder Ingestion Service

ADS-B feeder data ingestion microservice for the fly-overhead system. This service accepts aircraft state data from multiple feeder sources (PiAware, dump1090, external feeders), validates and transforms the data, and stores it in a shared PostgreSQL database.

## Features

- ✅ **Feeder Registration**: Register new ADS-B feeders with API key authentication
- ✅ **Data Ingestion**: Accept aircraft state data via REST API
- ✅ **Data Validation**: Comprehensive validation and quality checks
- ✅ **Data Transformation**: Convert to OpenSky extended format (19-item array)
- ✅ **Rate Limiting**: Per-feeder rate limiting to prevent abuse
- ✅ **Statistics Tracking**: Track feeder performance and health metrics
- ✅ **Batch Processing**: Efficient batch insertion of aircraft states
- ✅ **Health Monitoring**: Health check endpoints for orchestration

## Architecture

This service integrates with the existing `fly-overhead` system:

- **Port**: 3006 (configurable)
- **Database**: Shared PostgreSQL instance with main service
- **Network**: Docker network `fly-overhead-network`
- **Data Format**: OpenSky Network extended format (19-item array)
- **Source Priority**: 30 (higher than OpenSky's 20, same as websocket)

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- PostgreSQL 12+ with PostGIS extension
- Docker and Docker Compose (optional)

### Installation

1. **Clone the repository**:

```bash
git clone <repository-url>
cd fly-overhead-feeder-service
```

2. **Install dependencies**:

```bash
npm install
```

3. **Configure environment variables**:

```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Run database migrations**:

```bash
npm run migrate
```

5. **Start the service**:

```bash
# Development
npm run dev

# Production
npm start
```

### Docker Deployment

1. **Ensure the main service is running** (to create the shared network and database):

```bash
# From the main fly-overhead directory
docker-compose up -d
```

2. **Build and start the feeder service**:

```bash
docker-compose up -d
```

3. **Check service health**:

```bash
curl http://localhost:3006/health
```

## API Documentation

### Base URL

```
http://localhost:3006/api/v1
```

### Authentication

All authenticated endpoints require a Bearer token in the Authorization header:

```
Authorization: Bearer <api_key>
```

### Endpoints

#### 1. Register a Feeder

**POST** `/api/v1/feeders/register`

Register a new feeder and receive an API key.

**Request Body**:

```json
{
  "name": "My PiAware Feeder",
  "location": {
    "latitude": 37.7749,
    "longitude": -122.4194
  },
  "metadata": {
    "hardware": "Raspberry Pi 4",
    "software": "PiAware",
    "antenna": "FlightAware ADS-B Antenna",
    "version": "7.2"
  }
}
```

**Response** (201 Created):

```json
{
  "feeder_id": "feeder_abc123xyz",
  "api_key": "sk_live_abc123...",
  "message": "Store this API key securely. It will not be shown again."
}
```

⚠️ **Important**: Save the API key immediately. It cannot be retrieved later.

#### 2. Submit Aircraft Data

**POST** `/api/v1/feeders/data`

Submit aircraft state data from your feeder.

**Headers**:
```
Authorization: Bearer <api_key>
Content-Type: application/json
```

**Request Body**:

```json
{
  "timestamp": 1704067200,
  "states": [
    {
      "icao24": "abc123",
      "callsign": "UAL123",
      "latitude": 37.7749,
      "longitude": -122.4194,
      "baro_altitude": 10668.0,
      "geo_altitude": 10668.0,
      "velocity": 231.5,
      "true_track": 90.5,
      "vertical_rate": 0.0,
      "squawk": "1234",
      "on_ground": false,
      "category": 3,
      "time_position": 1704067200,
      "last_contact": 1704067200
    }
  ]
}
```

**Field Units**:
- `altitude`: meters
- `velocity`: m/s (meters per second)
- `vertical_rate`: m/s (meters per second)
- `true_track`: degrees (0-360)
- `timestamps`: Unix seconds

**Response** (200 OK):

```json
{
  "success": true,
  "processed": 1,
  "errors": [],
  "feeder_id": "feeder_abc123xyz",
  "processing_time_ms": 45
}
```

#### 3. Get Feeder Information

**GET** `/api/v1/feeders/me`

Get information about your feeder.

**Headers**:
```
Authorization: Bearer <api_key>
```

**Response** (200 OK):

```json
{
  "feeder_id": "feeder_abc123xyz",
  "name": "My PiAware Feeder",
  "status": "active",
  "location": {
    "latitude": 37.7749,
    "longitude": -122.4194
  },
  "created_at": "2024-01-01T12:00:00Z",
  "last_seen_at": "2024-01-01T14:30:00Z",
  "stats": {
    "today": {
      "messages_received": 15234,
      "unique_aircraft": 234
    },
    "last_24h": {
      "messages_received": 45000,
      "unique_aircraft": 567
    }
  }
}
```

#### 4. Get Feeder Statistics

**GET** `/api/v1/feeders/me/stats?days=7`

Get detailed statistics for your feeder.

**Query Parameters**:
- `days` (optional): Number of days (1-90, default: 7)

**Response** (200 OK):

```json
{
  "feeder_id": "feeder_abc123xyz",
  "period_days": 7,
  "statistics": [
    {
      "date": "2024-01-07",
      "messages_received": 15234,
      "unique_aircraft": 234,
      "data_quality_score": 85.5,
      "avg_latency_ms": 12.3,
      "error_count": 5
    }
  ],
  "summary": {
    "total_messages": 98765,
    "total_unique_aircraft": 567,
    "avg_daily_messages": 14109,
    "avg_data_quality": 84.2
  }
}
```

#### 5. Get Feeder Health

**GET** `/api/v1/feeders/me/health`

Get health status for your feeder.

**Response** (200 OK):

```json
{
  "feeder_id": "feeder_abc123xyz",
  "status": "active",
  "health": "healthy",
  "last_seen_at": "2024-01-01T14:30:00Z",
  "minutes_since_last_seen": 2,
  "location": {
    "latitude": 37.7749,
    "longitude": -122.4194
  }
}
```

**Health Status Values**:
- `healthy`: Last seen within 5 minutes
- `degraded`: Last seen within 30 minutes
- `offline`: Last seen more than 30 minutes ago
- `never_seen`: No data received yet
- `suspended`: Account suspended
- `inactive`: Account inactive

#### 6. Health Check

**GET** `/health`

Service health check endpoint (no authentication required).

**Response** (200 OK):

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00Z",
  "uptime": 3600.5,
  "checks": {
    "database": "connected"
  },
  "memory": {
    "rss": "125 MB",
    "heapUsed": "45 MB",
    "heapTotal": "67 MB"
  }
}
```

## Data Format Transformation

The service transforms incoming JSON data to the OpenSky extended format (19-item array):

```javascript
[
  0: icao24,           // String (hex)
  1: callsign,         // String or null
  2: origin_country,   // String or null
  3: time_position,    // Unix timestamp (seconds) or null
  4: last_contact,     // Unix timestamp (seconds)
  5: longitude,        // Float or null
  6: latitude,         // Float or null
  7: baro_altitude,    // Float (meters) or null
  8: on_ground,        // Boolean
  9: velocity,         // Float (m/s) or null
  10: true_track,      // Float (degrees) or null
  11: vertical_rate,   // Float (m/s) or null
  12: sensors,         // Array of sensor IDs or null
  13: geo_altitude,    // Float (meters) or null
  14: squawk,          // String (4 digits) or null
  15: spi,             // Boolean
  16: position_source, // Integer (0-3)
  17: category,        // Integer (0-19) or null
  18: created_at       // Timestamp (added by service)
]
```

## PiAware Integration Example

To feed data from your PiAware setup, create a simple client script:

```javascript
const axios = require('axios');

const FEEDER_API_URL = 'http://your-server:3006/api/v1/feeders/data';
const API_KEY = 'sk_live_your_api_key';
const DUMP1090_URL = 'http://localhost:8080/data/aircraft.json';

async function pollAndSubmit() {
  try {
    // Fetch from dump1090
    const response = await axios.get(DUMP1090_URL);
    const aircraft = response.data.aircraft;

    if (aircraft.length === 0) return;

    // Transform to API format
    const states = aircraft
      .filter(ac => ac.lat && ac.lon) // Only include aircraft with position
      .map(ac => ({
        icao24: ac.hex,
        callsign: ac.flight ? ac.flight.trim() : null,
        latitude: ac.lat,
        longitude: ac.lon,
        baro_altitude: ac.altitude ? ac.altitude * 0.3048 : null, // feet to meters
        geo_altitude: ac.alt_geom ? ac.alt_geom * 0.3048 : null,
        velocity: ac.gs ? ac.gs * 0.514444 : null, // knots to m/s
        true_track: ac.track || null,
        vertical_rate: ac.vert_rate ? ac.vert_rate * 0.00508 : null, // fpm to m/s
        squawk: ac.squawk || null,
        on_ground: ac.alt_baro === 'ground',
        category: ac.category ? parseInt(ac.category, 16) : null,
        time_position: ac.seen_pos ? Math.floor(Date.now() / 1000 - ac.seen_pos) : null,
        last_contact: ac.seen ? Math.floor(Date.now() / 1000 - ac.seen) : Math.floor(Date.now() / 1000),
      }));

    // Submit to feeder service
    await axios.post(
      FEEDER_API_URL,
      { states },
      { headers: { Authorization: `Bearer ${API_KEY}` } }
    );

    console.log(`Submitted ${states.length} aircraft states`);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Poll every 5 seconds
setInterval(pollAndSubmit, 5000);
```

## Rate Limits

- **Data Submission**: 1000 requests per minute per feeder
- **Registration**: 5 registrations per hour per IP
- **General API**: 100 requests per 15 minutes

Rate limit headers are included in responses:
- `RateLimit-Limit`: Maximum requests allowed
- `RateLimit-Remaining`: Requests remaining in window
- `RateLimit-Reset`: Time when rate limit resets

## Environment Variables

See `.env.example` for all available configuration options.

**Critical Variables**:

```bash
# Server
PORT=3006
NODE_ENV=production

# Database (shared with main service)
POSTGRES_URL=postgresql://postgres:postgres@db:5432/fly_overhead

# Security
API_KEY_SECRET=<random-secret-for-key-generation>
BCRYPT_ROUNDS=10

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=1000

# Data Processing
BATCH_SIZE=50
MAX_DATA_AGE_SECONDS=300
```

## Database Schema

The service creates the following tables:

### `feeders`
Stores feeder registration information.

### `feeder_stats`
Daily statistics for each feeder.

### Updated Columns in Existing Tables

Adds these columns to `aircraft_states` and `aircraft_states_history`:
- `data_source`: Source of data (e.g., 'feeder', 'opensky')
- `feeder_id`: ID of the feeder that provided this data
- `source_priority`: Priority of data source (30 for feeders)
- `ingestion_timestamp`: When the data was ingested

## Monitoring and Logging

Logs are written to:
- `logs/combined.log`: All logs
- `logs/error.log`: Error logs only
- Console: Pretty-printed logs in development

**Log Levels**: `debug`, `info`, `warn`, `error`

Set via environment variable:
```bash
LOG_LEVEL=info
```

## Development

### Run Tests

```bash
npm test
npm run test:unit
npm run test:integration
```

### Run Linter

```bash
npm run lint
```

### Format Code

```bash
npm run format
```

## Troubleshooting

### Database Connection Issues

1. Check that the PostgreSQL server is running
2. Verify the connection string in `.env`
3. Ensure the database exists and migrations have run
4. Check network connectivity (especially in Docker)

### Authentication Issues

1. Verify the API key format (should start with `sk_live_`)
2. Check that the feeder is active (not suspended/inactive)
3. Ensure the Authorization header is correctly formatted
4. Check for rate limiting (429 status code)

### Data Validation Errors

1. Review the validation error details in the response
2. Ensure all required fields are present (icao24)
3. Check that values are within valid ranges
4. Verify units (meters, m/s, not feet/knots)

## Support

For issues and questions:
1. Check the logs for detailed error messages
2. Verify environment configuration
3. Review API documentation above
4. Check database connectivity and migrations

## License

MIT License - See LICENSE file for details

## Related Services

- **fly-overhead**: Main API service and frontend
- **PostgreSQL**: Shared database with PostGIS extension

## Version History

### 1.0.0 (2024-01-01)
- Initial release
- Feeder registration and authentication
- Aircraft data ingestion
- Statistics and health monitoring
- Rate limiting and validation

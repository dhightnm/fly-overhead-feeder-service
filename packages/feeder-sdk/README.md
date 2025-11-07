# @dhightnm/feeder-sdk

Plug-and-play SDK for connecting ADS-B feeders (PiAware, dump1090, etc.) to the fly-overhead service.

## Installation

```bash
npm install @dhightnm/feeder-sdk
```

## Quick Start

```typescript
import { FeederClient } from '@dhightnm/feeder-sdk';

// Create client
const client = new FeederClient({
  apiUrl: 'http://your-server:3006',
  apiKey: 'sk_live_your_api_key_here'
});

// Submit aircraft data
await client.submitAircraft({
  icao24: 'abc123',
  callsign: 'UAL123',
  latitude: 40.7128,
  longitude: -74.0060,
  baro_altitude: 35000,
  last_contact: Math.floor(Date.now() / 1000)
});

// Or submit a batch
await client.submitBatch([aircraft1, aircraft2, aircraft3]);
```

## Register a New Feeder

```typescript
import { registerAndCreateClient } from '@dhightnm/feeder-sdk';

const { client, feederId, apiKey } = await registerAndCreateClient(
  'http://your-server:3006',
  {
    name: 'My Home PiAware',
    location: {
      latitude: 40.7128,
      longitude: -74.0060
    }
  }
);

// Save the apiKey! You'll need it for future connections.
console.log('Feeder ID:', feederId);
console.log('API Key:', apiKey);
```

## Features

- ✅ **Automatic retry logic** - Handles network errors gracefully
- ✅ **Batch queuing** - Automatically batches submissions
- ✅ **TypeScript support** - Full type definitions included
- ✅ **Connection testing** - Verify connectivity before submitting
- ✅ **Statistics & health** - Get feeder stats and health status
- ✅ **Data quality feedback** - See how your data performs

## API Reference

### `FeederClient`

Main client class for interacting with the feeder service.

#### Constructor

```typescript
new FeederClient(config: FeederClientConfig)
```

**Config options:**
- `apiUrl` (required): Base URL of the feeder service
- `apiKey` (required): Your feeder API key
- `feederId` (optional): Your feeder ID
- `timeout` (optional): Request timeout in ms (default: 10000)
- `retryAttempts` (optional): Number of retry attempts (default: 3)
- `batchSize` (optional): Batch size for queuing (default: 50)

#### Methods

**`submitAircraft(aircraft: AircraftState): Promise<DataSubmissionResponse>`**

Submit a single aircraft state.

**`submitBatch(aircraft: AircraftState[]): Promise<DataSubmissionResponse>`**

Submit multiple aircraft states in a single request.

**`queueAircraft(aircraft: AircraftState): void`**

Queue an aircraft for automatic batch submission. Batches are flushed when:
- Batch size is reached
- 1 second has passed since last flush

**`flushBatch(): Promise<void>`**

Manually flush queued aircraft.

**`getInfo(): Promise<FeederInfo>`**

Get information about your feeder.

**`getStats(days?: number): Promise<any>`**

Get statistics for your feeder (default: 7 days).

**`getHealth(): Promise<any>`**

Get health status of your feeder.

**`getQuality(): Promise<any>`**

Get data quality feedback and recommendations.

**`testConnection(): Promise<boolean>`**

Test connection to the server.

### `registerAndCreateClient()`

Helper function to register a new feeder and get a client instance.

```typescript
registerAndCreateClient(
  apiUrl: string,
  registrationData: {
    name: string;
    location?: { latitude: number; longitude: number };
    metadata?: Record<string, any>;
  }
): Promise<{ client: FeederClient; feederId: string; apiKey: string }>
```

## Types

### `AircraftState`

```typescript
interface AircraftState {
  icao24: string;                    // Required: 6-character hex code
  callsign?: string | null;          // Optional: Flight callsign
  origin_country?: string | null;    // Optional: Country code
  latitude?: number | null;          // Optional: Latitude in degrees
  longitude?: number | null;         // Optional: Longitude in degrees
  baro_altitude?: number | null;    // Optional: Barometric altitude in meters
  geo_altitude?: number | null;     // Optional: Geometric altitude in meters
  velocity?: number | null;          // Optional: Velocity in m/s
  true_track?: number | null;       // Optional: Track angle in degrees
  vertical_rate?: number | null;    // Optional: Vertical rate in m/s
  sensors?: number[] | null;         // Optional: Sensor IDs
  squawk?: string | null;           // Optional: Squawk code
  on_ground?: boolean;               // Optional: On ground flag
  spi?: boolean;                     // Optional: Special position indicator
  position_source?: number;          // Optional: Position source
  category?: number | null;          // Optional: Aircraft category (0-19)
  time_position?: number | null;     // Optional: Position timestamp (Unix seconds)
  last_contact: number;              // Required: Last contact timestamp (Unix seconds)
}
```

## Examples

### Basic Usage

```typescript
import { FeederClient } from '@dhightnm/feeder-sdk';

const client = new FeederClient({
  apiUrl: process.env.FEEDER_API_URL!,
  apiKey: process.env.FEEDER_API_KEY!
});

// Submit single aircraft
await client.submitAircraft({
  icao24: 'abc123',
  callsign: 'UAL123',
  latitude: 40.7128,
  longitude: -74.0060,
  baro_altitude: 35000,
  last_contact: Math.floor(Date.now() / 1000)
});
```

### Batch Submission

```typescript
const aircraft = [
  { icao24: 'abc123', latitude: 40.7128, longitude: -74.0060, last_contact: Date.now() },
  { icao24: 'def456', latitude: 40.7130, longitude: -74.0062, last_contact: Date.now() },
];

const result = await client.submitBatch(aircraft);
console.log(`Processed ${result.processed} aircraft`);
```

### Automatic Batching

```typescript
// Queue aircraft - they'll be automatically batched
client.queueAircraft(aircraft1);
client.queueAircraft(aircraft2);
client.queueAircraft(aircraft3);

// Or manually flush
await client.flushBatch();
```

### Check Feeder Status

```typescript
const info = await client.getInfo();
console.log(`Feeder: ${info.name} (${info.status})`);

const health = await client.getHealth();
console.log(`Health: ${health.health}`);

const quality = await client.getQuality();
console.log(`Quality Score: ${quality.data.overall_score} (${quality.data.grade})`);
```

## Error Handling

The SDK automatically retries on network errors (5xx) but throws immediately on client errors (4xx):

```typescript
try {
  await client.submitBatch(aircraft);
} catch (error: any) {
  if (error.response) {
    // API error
    console.error('API Error:', error.response.status, error.response.data);
  } else {
    // Network error
    console.error('Network Error:', error.message);
  }
}
```

## License

MIT

## Support

- 📖 Documentation: https://docs.fly-overhead.com
- 💬 Issues: https://github.com/fly-overhead/feeder-service/issues
- 📧 Email: support@fly-overhead.com


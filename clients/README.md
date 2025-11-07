# Feeder Client SDK Package Structure

This directory contains the plug-and-play feeder client SDK and tools.

## Structure

```
clients/
├── sdk/
│   └── FeederClient.ts          # Core SDK for any feeder
├── adapters/
│   └── FeederAdapter.ts          # Auto-detection and adapters
├── piaware/
│   └── PiAwareClient.ts         # Optimized PiAware client
├── setup-wizard.ts               # Interactive setup wizard
├── universal-feeder-client.ts    # Universal client (auto-detect)
└── install.sh                    # One-click installation script
```

## Usage

### For Feeder Operators

**Quick Start:**
```bash
npx @fly-overhead/feeder-setup
```

**Manual:**
```typescript
import { FeederClient } from './sdk/FeederClient';

const client = new FeederClient({
  apiUrl: 'http://your-server:3006',
  apiKey: 'sk_live_...'
});

await client.submitBatch(aircraftStates);
```

### For Developers

**Create Custom Client:**
```typescript
import { FeederClient } from './sdk/FeederClient';
import { FeederAdapter } from './adapters/FeederAdapter';

class MyCustomClient {
  private client: FeederClient;
  private adapter: FeederAdapter;

  constructor(config) {
    this.client = new FeederClient(config);
    this.adapter = new MyCustomAdapter();
  }

  async start() {
    const aircraft = await this.adapter.fetchAircraft();
    await this.client.submitBatch(aircraft);
  }
}
```

## Building

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run setup wizard
npm run setup

# Run universal client
npm run client
```

## Publishing

When ready to publish as npm package:

```bash
# Package as @fly-overhead/feeder-sdk
npm publish --access public
```

## Testing

```bash
# Test SDK
npm test

# Test adapters
npm run test:adapters

# Test setup wizard
npm run test:setup
```


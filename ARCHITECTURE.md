# Network Architecture

## Your Setup

```
┌─────────────────────────────────────────────────────────────┐
│                    Local Network                            │
│                                                              │
│  ┌──────────────────┐         ┌──────────────────┐        │
│  │   Machine 1       │         │   Machine 2       │        │
│  │   192.168.58.15   │         │   192.168.58.11   │        │
│  │                   │         │                   │        │
│  │  • PostgreSQL DB  │◄────────┤  • Feeder Service│        │
│  │  • Main Service   │         │    (Port 3006)    │        │
│  │    (Port 3005)    │         │                   │        │
│  └───────────────────┘         └─────────┬─────────┘        │
│                                           │                   │
│                                           │                   │
│                                  ┌────────▼─────────┐        │
│                                  │   PiAware Device  │        │
│                                  │                   │        │
│                                  │  • dump1090       │        │
│                                  │  • Client Script  │        │
│                                  └───────────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

## Configuration Summary

### Machine 1 (192.168.58.15)
- **PostgreSQL Database**: Port 5433 (external), 5432 (internal)
- **Main fly-overhead Service**: Port 3005
- **Role**: Database server + main API service

### Machine 2 (192.168.58.11) - Current Machine
- **Feeder Ingestion Service**: Port 3006
- **Database Connection**: `postgresql://postgres:postgres@192.168.58.15:5433/fly_overhead`
- **Role**: Feeder service that accepts data from PiAware

### PiAware Device
- **Feeder Client**: Connects to Machine 2 (192.168.58.11:3006)
- **dump1090**: Local port 8080
- **Role**: Feeds aircraft data to Machine 2's feeder service

## Data Flow

```
PiAware Device
    │
    │ (HTTP POST)
    ▼
Machine 2 (192.168.58.11:3006)
    │ Feeder Service
    │ • Validates data
    │ • Transforms format
    │ • Batch processes
    │
    │ (PostgreSQL)
    ▼
Machine 1 (192.168.58.15:5433)
    │ Database
    │ • Stores aircraft_states
    │ • Updates feeder_stats
    │
    │ (Reads)
    ▼
Machine 1 (192.168.58.15:3005)
    Main Service
    • Serves API
    • WebSocket updates
```

## Important IPs

- **Database Server**: `192.168.58.15:5433`
- **Feeder Service**: `192.168.58.11:3006` ← PiAware connects here
- **Main Service**: `192.168.58.15:3005`

## Verification

### Test from Machine 2 (current machine):
```bash
# Test feeder service
curl http://localhost:3006/health

# Test database connection
curl http://192.168.58.15:3005/health  # Main service
```

### Test from PiAware:
```bash
# Test feeder service reachability
curl http://192.168.58.11:3006/health

# Test dump1090
curl http://localhost:8080/data/aircraft.json
```

## Firewall Considerations

Make sure Machine 2's port 3006 is accessible from PiAware:

```bash
# On Machine 2 (if using firewall)
sudo ufw allow 3006/tcp
```

## Configuration Files

### Machine 2 - `.env`
```bash
POSTGRES_URL=postgresql://postgres:postgres@192.168.58.15:5433/fly_overhead
PORT=3006
```

### PiAware - `piaware-feeder-client.js`
```javascript
const YOUR_SERVER_IP = '192.168.58.11'; // Machine 2
```


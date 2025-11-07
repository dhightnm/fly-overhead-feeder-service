#!/bin/bash
# Quick check script for feeder data

echo "🔍 Checking Feeder Aircraft Data..."
echo ""

# Check if we can connect via Docker
if docker ps | grep -q fly-overhead-db; then
  echo "✅ Found Docker database container"
  echo ""
  echo "📊 Total feeder aircraft:"
  docker exec fly-overhead-db psql -U postgres -d fly_overhead -t -c "SELECT COUNT(*) FROM aircraft_states WHERE data_source = 'feeder';" 2>/dev/null | xargs
  
  echo ""
  echo "📈 Recent activity (last 5 minutes):"
  docker exec fly-overhead-db psql -U postgres -d fly_overhead -c "SELECT COUNT(*) as count, COUNT(DISTINCT icao24) as unique_aircraft, MAX(ingestion_timestamp) as last_seen FROM aircraft_states WHERE data_source = 'feeder' AND ingestion_timestamp > NOW() - INTERVAL '5 minutes';" 2>/dev/null
  
  echo ""
  echo "✈️  Most recent aircraft (last 5):"
  docker exec fly-overhead-db psql -U postgres -d fly_overhead -c "SELECT icao24, callsign, ROUND(latitude::numeric, 4) as lat, ROUND(longitude::numeric, 4) as lon, ROUND(baro_altitude::numeric) as alt_m, ingestion_timestamp FROM aircraft_states WHERE data_source = 'feeder' ORDER BY ingestion_timestamp DESC LIMIT 5;" 2>/dev/null
  
  echo ""
  echo "📡 Feeder status:"
  docker exec fly-overhead-db psql -U postgres -d fly_overhead -c "SELECT feeder_id, name, status, last_seen_at, EXTRACT(EPOCH FROM (NOW() - last_seen_at))/60 as minutes_ago FROM feeders;" 2>/dev/null
else
  echo "⚠️  Docker database not found. Trying direct connection..."
  echo ""
  echo "Run manually:"
  echo "  psql -h 192.168.58.15 -p 5433 -U postgres -d fly_overhead"
  echo ""
  echo "Or use the API:"
  echo "  curl http://localhost:3006/api/v1/feeders/me -H 'Authorization: Bearer sk_live_...'"
fi

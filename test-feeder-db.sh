#!/bin/bash

# Test script to check feeder aircraft data in database
# Run this on Machine 2 (or Machine 1)

DB_HOST="${DB_HOST:-192.168.58.15}"
DB_PORT="${DB_PORT:-5433}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-fly_overhead}"

echo "=========================================="
echo "Feeder Aircraft Data Test"
echo "=========================================="
echo ""

# Test 1: Count total feeder aircraft
echo "1. Total aircraft from feeders:"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
  SELECT COUNT(*) 
  FROM aircraft_states 
  WHERE data_source = 'feeder';
" 2>/dev/null || echo "  (Run: docker exec fly-overhead-db psql -U postgres -d fly_overhead -c \"SELECT COUNT(*) FROM aircraft_states WHERE data_source = 'feeder';\")"

echo ""

# Test 2: Recent feeder aircraft (last 10)
echo "2. Most recent feeder aircraft (last 10):"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
  SELECT 
    icao24,
    callsign,
    latitude,
    longitude,
    baro_altitude,
    feeder_id,
    ingestion_timestamp
  FROM aircraft_states 
  WHERE data_source = 'feeder'
  ORDER BY ingestion_timestamp DESC 
  LIMIT 10;
" 2>/dev/null || echo "  (Run: docker exec fly-overhead-db psql -U postgres -d fly_overhead -c \"SELECT icao24, callsign, latitude, longitude, baro_altitude, feeder_id, ingestion_timestamp FROM aircraft_states WHERE data_source = 'feeder' ORDER BY ingestion_timestamp DESC LIMIT 10;\")"

echo ""

# Test 3: Feeder statistics
echo "3. Feeder statistics:"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
  SELECT 
    f.feeder_id,
    f.name,
    f.status,
    f.last_seen_at,
    COUNT(DISTINCT a.icao24) as unique_aircraft,
    COUNT(a.id) as total_records,
    MAX(a.ingestion_timestamp) as last_update
  FROM feeders f
  LEFT JOIN aircraft_states a ON a.feeder_id = f.feeder_id
  GROUP BY f.feeder_id, f.name, f.status, f.last_seen_at;
" 2>/dev/null || echo "  (Run: docker exec fly-overhead-db psql -U postgres -d fly_overhead -c \"SELECT f.feeder_id, f.name, f.status, f.last_seen_at, COUNT(DISTINCT a.icao24) as unique_aircraft, COUNT(a.id) as total_records FROM feeders f LEFT JOIN aircraft_states a ON a.feeder_id = f.feeder_id GROUP BY f.feeder_id, f.name, f.status, f.last_seen_at;\")"

echo ""

# Test 4: Recent activity (last 5 minutes)
echo "4. Aircraft ingested in last 5 minutes:"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
  SELECT 
    COUNT(*) as count,
    COUNT(DISTINCT icao24) as unique_aircraft,
    MIN(ingestion_timestamp) as first_seen,
    MAX(ingestion_timestamp) as last_seen
  FROM aircraft_states 
  WHERE data_source = 'feeder'
    AND ingestion_timestamp > NOW() - INTERVAL '5 minutes';
" 2>/dev/null || echo "  (Run: docker exec fly-overhead-db psql -U postgres -d fly_overhead -c \"SELECT COUNT(*) as count, COUNT(DISTINCT icao24) as unique_aircraft, MIN(ingestion_timestamp) as first_seen, MAX(ingestion_timestamp) as last_seen FROM aircraft_states WHERE data_source = 'feeder' AND ingestion_timestamp > NOW() - INTERVAL '5 minutes';\")"

echo ""
echo "=========================================="


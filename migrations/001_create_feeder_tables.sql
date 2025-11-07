-- Migration: Create feeder tables and add tracking columns
-- This migration creates the feeder management tables and adds source tracking
-- to the existing aircraft_states tables

-- Enable PostGIS if not already enabled
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================================
-- Feeder Management Tables
-- ============================================================================

-- Feeder registration and management
CREATE TABLE IF NOT EXISTS feeders (
  id SERIAL PRIMARY KEY,
  feeder_id TEXT UNIQUE NOT NULL,           -- UUID or custom ID
  api_key_hash TEXT NOT NULL,               -- bcrypt hashed API key
  name TEXT,                                 -- Human-readable name
  location GEOGRAPHY(POINT, 4326),          -- PostGIS point (lat/lng)
  status TEXT DEFAULT 'active',             -- active, inactive, suspended
  metadata JSONB DEFAULT '{}',              -- {hardware, version, software, etc}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  CONSTRAINT status_check CHECK (status IN ('active', 'inactive', 'suspended'))
);

CREATE INDEX IF NOT EXISTS idx_feeders_status ON feeders(status);
CREATE INDEX IF NOT EXISTS idx_feeders_location ON feeders USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_feeders_last_seen ON feeders(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_feeders_feeder_id ON feeders(feeder_id);

-- Feeder statistics (daily aggregates)
CREATE TABLE IF NOT EXISTS feeder_stats (
  id SERIAL PRIMARY KEY,
  feeder_id TEXT NOT NULL REFERENCES feeders(feeder_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  messages_received BIGINT DEFAULT 0,
  unique_aircraft INT DEFAULT 0,
  data_quality_score FLOAT,                 -- 0-100 score
  avg_latency_ms FLOAT,                     -- Average processing latency
  error_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(feeder_id, date)
);

CREATE INDEX IF NOT EXISTS idx_feeder_stats_date ON feeder_stats(date);
CREATE INDEX IF NOT EXISTS idx_feeder_stats_feeder ON feeder_stats(feeder_id);

-- ============================================================================
-- Add Data Source Tracking to Existing Tables
-- ============================================================================

-- Add columns to aircraft_states (if they don't exist)
ALTER TABLE aircraft_states 
  ADD COLUMN IF NOT EXISTS data_source TEXT DEFAULT 'opensky',
  ADD COLUMN IF NOT EXISTS feeder_id TEXT,
  ADD COLUMN IF NOT EXISTS source_priority INT DEFAULT 10,
  ADD COLUMN IF NOT EXISTS ingestion_timestamp TIMESTAMPTZ DEFAULT NOW();

-- Add foreign key constraint (only if column was just created)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_aircraft_states_feeder'
  ) THEN
    ALTER TABLE aircraft_states
      ADD CONSTRAINT fk_aircraft_states_feeder 
      FOREIGN KEY (feeder_id) 
      REFERENCES feeders(feeder_id) 
      ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes on aircraft_states
CREATE INDEX IF NOT EXISTS idx_aircraft_states_data_source ON aircraft_states(data_source);
CREATE INDEX IF NOT EXISTS idx_aircraft_states_feeder ON aircraft_states(feeder_id);
CREATE INDEX IF NOT EXISTS idx_aircraft_states_ingestion ON aircraft_states(ingestion_timestamp);

-- Add columns to aircraft_states_history (if they don't exist)
ALTER TABLE aircraft_states_history 
  ADD COLUMN IF NOT EXISTS data_source TEXT DEFAULT 'opensky',
  ADD COLUMN IF NOT EXISTS feeder_id TEXT,
  ADD COLUMN IF NOT EXISTS source_priority INT DEFAULT 10;

-- Add foreign key constraint for history table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_aircraft_history_feeder'
  ) THEN
    ALTER TABLE aircraft_states_history
      ADD CONSTRAINT fk_aircraft_history_feeder 
      FOREIGN KEY (feeder_id) 
      REFERENCES feeders(feeder_id) 
      ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes on aircraft_states_history
CREATE INDEX IF NOT EXISTS idx_aircraft_history_data_source ON aircraft_states_history(data_source);
CREATE INDEX IF NOT EXISTS idx_aircraft_history_feeder ON aircraft_states_history(feeder_id);

-- ============================================================================
-- Update Trigger for feeders table
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_feeders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_update_feeders_updated_at'
  ) THEN
    CREATE TRIGGER trigger_update_feeders_updated_at
      BEFORE UPDATE ON feeders
      FOR EACH ROW
      EXECUTE FUNCTION update_feeders_updated_at();
  END IF;
END $$;

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON TABLE feeders IS 'Registered ADS-B data feeders';
COMMENT ON TABLE feeder_stats IS 'Daily statistics for each feeder';
COMMENT ON COLUMN aircraft_states.data_source IS 'Source of data: opensky, feeder, manual, etc';
COMMENT ON COLUMN aircraft_states.feeder_id IS 'ID of the feeder that provided this data';
COMMENT ON COLUMN aircraft_states.source_priority IS 'Priority of data source (higher = more trusted)';


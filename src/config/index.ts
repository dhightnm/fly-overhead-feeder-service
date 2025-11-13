import dotenv from 'dotenv';
import { Config } from '../types';

dotenv.config();

const config: Config = {
  // Server
  port: parseInt(process.env.PORT || '3006', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database
  database: {
    url: process.env.POSTGRES_URL || 'postgresql://postgres:postgres@localhost:5432/fly_overhead',
    pool: {
      min: parseInt(process.env.POSTGRES_POOL_MIN || '2', 10),
      max: parseInt(process.env.POSTGRES_POOL_MAX || '10', 10),
    },
  },

  // Security
  security: {
    apiKeySecret: process.env.API_KEY_SECRET || 'change-this-in-production',
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),
  },

  // Rate Limiting
  // Note: Data ingestion (/data endpoint) is UNLIMITED - feeders can submit as much data as needed
  // Tier-based limits only apply to other API operations (stats, health, etc.)
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000', 10),
    // Tier-based rate limits for API operations (not data ingestion)
    // These are now handled in generalLimiter with different limits
    tiers: {
      production: parseInt(process.env.RATE_LIMIT_PRODUCTION || '500', 10), // Legacy - not used for data ingestion
      standard: parseInt(process.env.RATE_LIMIT_STANDARD || '1000', 10), // Legacy - not used for data ingestion
      premium: parseInt(process.env.RATE_LIMIT_PREMIUM || '5000', 10), // Legacy - not used for data ingestion
    },
  },

  // Data Processing
  dataProcessing: {
    batchSize: parseInt(process.env.BATCH_SIZE || '50', 10),
    batchIntervalMs: parseInt(process.env.BATCH_INTERVAL_MS || '1000', 10),
    maxDataAgeSeconds: parseInt(process.env.MAX_DATA_AGE_SECONDS || '300', 10),
  },

  // Main Service Integration
  mainService: {
    url: process.env.MAIN_SERVICE_URL || 'http://localhost:3005',
    aircraftEndpoint: process.env.MAIN_SERVICE_AIRCRAFT_ENDPOINT || '/api/feeder/aircraft',
    registerEndpoint: process.env.MAIN_SERVICE_REGISTER_ENDPOINT || '/api/feeder/register',
    statsEndpoint: process.env.MAIN_SERVICE_STATS_ENDPOINT || '/api/feeder/stats',
    lastSeenEndpoint: process.env.MAIN_SERVICE_LAST_SEEN_ENDPOINT || '/api/feeder/last-seen',
    authEndpoint: process.env.MAIN_SERVICE_AUTH_ENDPOINT || '/api/feeder/me',
    // User authentication endpoints for account linking
    loginEndpoint: process.env.MAIN_SERVICE_LOGIN_ENDPOINT || '/api/auth/login',
    googleAuthEndpoint: process.env.MAIN_SERVICE_GOOGLE_AUTH_ENDPOINT || '/api/auth/google',
    timeout: parseInt(process.env.MAIN_SERVICE_TIMEOUT_MS || '5000', 10),
  },

  // Queue (Optional)
  queue: {
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    useQueue: process.env.USE_QUEUE === 'true',
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

// Validate required config
if (config.nodeEnv === 'production' && config.security.apiKeySecret === 'change-this-in-production') {
  throw new Error('API_KEY_SECRET must be set in production');
}

export default config;


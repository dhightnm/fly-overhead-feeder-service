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
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000', 10),
  },

  // Data Processing
  dataProcessing: {
    batchSize: parseInt(process.env.BATCH_SIZE || '50', 10),
    batchIntervalMs: parseInt(process.env.BATCH_INTERVAL_MS || '1000', 10),
    maxDataAgeSeconds: parseInt(process.env.MAX_DATA_AGE_SECONDS || '300', 10),
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


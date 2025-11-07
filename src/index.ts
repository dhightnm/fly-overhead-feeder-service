import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import config from './config';
import logger from './utils/logger';
import postgresRepository from './repositories/PostgresRepository';
import { errorHandler, notFoundHandler } from './middlewares/validator';

// Import routes
import feederRoutes from './routes/feeder.routes';
import healthRoutes from './routes/health.routes';

// Initialize Express app
const app: Express = express();

// ============================================================================
// Middleware
// ============================================================================

// CORS configuration
app.use(
  cors({
    origin: config.nodeEnv === 'production' ? process.env.ALLOWED_ORIGINS?.split(',') : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();

  // Log request
  logger.debug('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'debug';

    logger[logLevel]('Request completed', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
    });
  });

  next();
});

// ============================================================================
// Routes
// ============================================================================

// Health check routes (no /api prefix)
app.use('/health', healthRoutes);
app.use('/ready', healthRoutes);
app.use('/live', healthRoutes);

// API routes
app.use('/api/v1/feeders', feederRoutes);

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'fly-overhead-feeder-ingestion',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      register: 'POST /api/v1/feeders/register',
      submitData: 'POST /api/v1/feeders/data',
      getInfo: 'GET /api/v1/feeders/me',
      getStats: 'GET /api/v1/feeders/me/stats',
      getHealth: 'GET /api/v1/feeders/me/health',
    },
  });
});

// ============================================================================
// Error Handling
// ============================================================================

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// ============================================================================
// Server Initialization
// ============================================================================

async function startServer(): Promise<void> {
  try {
    // Connect to database
    logger.info('Connecting to database...');
    const connected = await postgresRepository.connect();

    if (!connected) {
      logger.error('Failed to connect to database. Exiting...');
      process.exit(1);
    }

    // Start HTTP server
    const server = app.listen(config.port, config.host, () => {
      logger.info('Server started successfully', {
        port: config.port,
        host: config.host,
        environment: config.nodeEnv,
        databaseUrl: config.database.url.replace(/:[^:]*@/, ':****@'),
      });

      logger.info('Service endpoints:', {
        health: `http://${config.host}:${config.port}/health`,
        api: `http://${config.host}:${config.port}/api/v1`,
      });
    });

    // Graceful shutdown handler
    const gracefulShutdown = async (signal: string): Promise<void> => {
      logger.info(`${signal} received, shutting down gracefully...`);

      // Stop accepting new connections
      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          // Close database connection
          postgresRepository.disconnect();
          logger.info('Database connection closed');

          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          const err = error as Error;
          logger.error('Error during graceful shutdown', {
            error: err.message,
          });
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    // Register shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught exception', {
        error: error.message,
        stack: error.stack,
      });
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: unknown, _promise: Promise<any>) => {
      logger.error('Unhandled promise rejection', {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      });
      process.exit(1);
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to start server', {
      error: err.message,
      stack: err.stack,
    });
    process.exit(1);
  }
}

// Start the server
if (require.main === module) {
  startServer();
}

export default app;


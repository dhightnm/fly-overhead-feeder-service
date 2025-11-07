import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import config from './config';
import logger from './utils/logger';
import postgresRepository from './repositories/PostgresRepository';
import { errorHandler, notFoundHandler } from './middlewares/validator';

import feederRoutes from './routes/feeder.routes';
import healthRoutes from './routes/health.routes';

const app: Express = express();

app.use(
  cors({
    origin: config.nodeEnv === 'production' ? process.env.ALLOWED_ORIGINS?.split(',') : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req: Request, res: Response, next: NextFunction) => {
  res.on('finish', () => {
    if (res.statusCode >= 400) {
      logger.warn('Request failed', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        ip: req.ip,
      });
    }
  });
  next();
});

app.use('/health', healthRoutes);
app.use('/ready', healthRoutes);
app.use('/live', healthRoutes);
app.use('/api/v1/feeders', feederRoutes);

app.get('/setup.sh', (_req: Request, res: Response) => {
  try {
    const scriptPath = path.join(__dirname, '../setup-public-feeder.sh');
    const githubRawUrl = process.env.SETUP_SCRIPT_GITHUB_URL || 
      'https://raw.githubusercontent.com/dhightnm/fly-overhead-feeder-service/main/setup-public-feeder.sh';
    
    if (fs.existsSync(scriptPath)) {
      res.setHeader('Content-Type', 'text/x-sh');
      res.setHeader('Content-Disposition', 'attachment; filename="setup.sh"');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.sendFile(path.resolve(scriptPath));
      return;
    }
    
    res.redirect(302, githubRawUrl);
  } catch (error) {
    const githubRawUrl = process.env.SETUP_SCRIPT_GITHUB_URL || 
      'https://raw.githubusercontent.com/dhightnm/fly-overhead-feeder-service/main/setup-public-feeder.sh';
    res.redirect(302, githubRawUrl);
  }
});

app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'fly-overhead-feeder-ingestion',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
      endpoints: {
        health: '/health',
        setup: '/setup.sh',
        register: 'POST /api/v1/feeders/register',
        submitData: 'POST /api/v1/feeders/data',
        getInfo: 'GET /api/v1/feeders/me',
        getStats: 'GET /api/v1/feeders/me/stats',
        getHealth: 'GET /api/v1/feeders/me/health',
      },
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

async function startServer(): Promise<void> {
  try {
    const connected = await postgresRepository.connect();
    if (!connected) {
      logger.error('Failed to connect to database. Exiting...');
      process.exit(1);
    }

    const server = app.listen(config.port, config.host, () => {
      logger.info('Server started', {
        port: config.port,
        host: config.host,
        environment: config.nodeEnv,
      });
    });

    const gracefulShutdown = async (signal: string): Promise<void> => {
      logger.info(`${signal} received, shutting down...`);

      server.close(async () => {
        postgresRepository.disconnect();
        logger.info('Graceful shutdown completed');
        process.exit(0);
      });

      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught exception', { error: error.message });
      process.exit(1);
    });

    process.on('unhandledRejection', (reason: unknown) => {
      logger.error('Unhandled promise rejection', {
        reason: reason instanceof Error ? reason.message : String(reason),
      });
      process.exit(1);
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

export default app;


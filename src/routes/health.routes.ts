import express, { Router, Request, Response } from 'express';
import postgresRepository from '../repositories/PostgresRepository';

const router: Router = express.Router();

router.get('/health', async (_req: Request, res: Response) => {
  const health: {
    status: string;
    timestamp: string;
    uptime: number;
    checks: Record<string, string>;
    memory?: {
      rss: string;
      heapUsed: string;
      heapTotal: string;
    };
  } = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {},
  };

  // Database is optional - service can operate without it
  try {
    if (postgresRepository.isConnected) {
      const dbHealthy = await postgresRepository.healthCheck();
      health.checks.database = dbHealthy ? 'connected' : 'disconnected';
      // Don't mark as degraded - database is optional
    } else {
      health.checks.database = 'not_connected';
      // Service is still healthy without database
    }
  } catch (error) {
    health.checks.database = 'error';
    // Don't mark as degraded - database is optional
  }

  const memUsage = process.memoryUsage();
  health.memory = {
    rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
  };

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

router.get('/ready', async (_req: Request, res: Response) => {
  // Service is ready if it can forward requests to main service
  // Database is optional for read operations only
  res.status(200).json({
    ready: true,
    timestamp: new Date().toISOString(),
    note: 'Database optional - all writes forwarded to main service',
  });
});

router.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({
    alive: true,
    timestamp: new Date().toISOString(),
  });
});

export default router;


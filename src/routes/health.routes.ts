import express, { Router, Request, Response } from 'express';
import postgresRepository from '../repositories/PostgresRepository';
import logger from '../utils/logger';

const router: Router = express.Router();

router.get('/', async (_req: Request, res: Response) => {
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

  try {
    const dbHealthy = await postgresRepository.healthCheck();
    health.checks.database = dbHealthy ? 'connected' : 'disconnected';
    if (!dbHealthy) {
      health.status = 'degraded';
    }
  } catch (error) {
    const err = error as Error;
    logger.error('Health check database error', { error: err.message });
    health.checks.database = 'error';
    health.status = 'degraded';
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
  try {
    const dbHealthy = await postgresRepository.healthCheck();

    if (dbHealthy) {
      res.status(200).json({
        ready: true,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        ready: false,
        reason: 'Database not connected',
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    const err = error as Error;
    logger.error('Readiness probe failed', { error: err.message });
    res.status(503).json({
      ready: false,
      reason: 'Health check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

router.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({
    alive: true,
    timestamp: new Date().toISOString(),
  });
});

export default router;


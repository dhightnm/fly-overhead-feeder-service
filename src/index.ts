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

app.get('/', (req: Request, res: Response) => {
  // Check if this is a browser request (HTML) or API request (JSON)
  const acceptHeader = req.headers.accept || '';
  
  if (acceptHeader.includes('text/html')) {
    // Serve HTML landing page for browsers
    const setupUrl = process.env.SETUP_URL || 
      (config.nodeEnv === 'production' 
        ? 'https://api.fly-overhead.com' 
        : `http://${config.host}:${config.port}`);
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fly Overhead Feeder Setup</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            max-width: 600px;
            width: 100%;
            padding: 40px;
        }
        h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 2em;
        }
        .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 1.1em;
        }
        .code-block {
            background: #f5f5f5;
            border: 1px solid #ddd;
            border-radius: 6px;
            padding: 15px;
            margin: 20px 0;
            font-family: 'Monaco', 'Courier New', monospace;
            font-size: 0.9em;
            overflow-x: auto;
        }
        .info-box {
            background: #e3f2fd;
            border-left: 4px solid #2196f3;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
        }
        .warning-box {
            background: #fff3e0;
            border-left: 4px solid #ff9800;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
        }
        ul {
            margin-left: 20px;
            margin-top: 10px;
        }
        li {
            margin: 5px 0;
        }
        .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            text-align: center;
            color: #999;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Fly Overhead Feeder Setup</h1>
        <p class="subtitle">Connect your ADS-B feeder in minutes</p>
        
        <div class="info-box">
            <strong>What you need:</strong>
            <ul>
                <li>An existing ADS-B feeder (PiAware, dump1090, etc.)</li>
                <li>SSH access to your feeder device</li>
                <li>About 5 minutes</li>
            </ul>
        </div>
        
        <h2>Quick Setup</h2>
        <p>Run this command on your feeder device:</p>
        <div class="code-block">
curl -fsSL ${setupUrl}/setup.sh | bash
        </div>
        
        <div class="warning-box">
            <strong>⚠️ Important:</strong> This script will:
            <ul>
                <li>Register your feeder automatically</li>
                <li>Install required dependencies</li>
                <li>Set up a systemd service</li>
                <li>Start feeding data to Fly Overhead</li>
            </ul>
            <p style="margin-top: 10px;">Make sure to save your API key when prompted!</p>
        </div>
        
        <div class="footer">
            <p>Thank you for contributing to Fly Overhead! 🎉</p>
        </div>
    </div>
</body>
</html>`;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
    return;
  }
  
  // Default: serve JSON API info for API clients
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
    // Try to connect to database, but don't fail if unavailable
    // Database is only used for read operations (stats, health checks)
    // All writes are forwarded to main service
    try {
      const connected = await postgresRepository.connect();
      if (connected) {
        logger.info('Database connected (optional - used for stats/health checks only)');
        
        // Log feeder activity summary on startup (non-critical)
        try {
          const summary = await postgresRepository.getFeederActivitySummary(24);
          logger.info('Feeder activity summary (last 24h)', {
            totalFeeders: summary.totalFeeders,
            activeFeeders: summary.activeFeeders,
            feeders: summary.feeders.map(f => ({
              id: f.feeder_id,
              name: f.name,
              status: f.status,
              lastSeen: f.last_seen_at ? `${Math.round(f.minutes_since_last_seen || 0)}m ago` : 'Never',
              messages24h: f.messages_24h,
              uniqueAircraft24h: f.unique_aircraft_24h,
            })),
          });
        } catch (error) {
          // Non-critical, just log warning
          logger.warn('Could not fetch feeder activity summary', {
            error: (error as Error).message,
          });
        }
      } else {
        logger.warn('Database not available - service will continue without database (all operations forwarded to main service)');
      }
    } catch (error) {
      // Database connection failed, but service can still operate
      logger.warn('Database connection failed - service will continue without database', {
        error: (error as Error).message,
      });
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


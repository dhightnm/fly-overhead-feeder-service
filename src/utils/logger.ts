import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import config from '../config';
import fs from 'fs';
import path from 'path';

// Ensure logs directory exists with proper permissions
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  try {
    fs.mkdirSync(logsDir, { recursive: true, mode: 0o755 });
  } catch (error) {
    // If we can't create logs directory, continue without file logging
    // This is fine for containerized environments where logs go to stdout
    console.warn('Could not create logs directory, file logging disabled:', (error as Error).message);
  }
}

const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'fly-overhead-feeder-ingestion' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          let msg = `${timestamp} [${level}]: ${message}`;
          if (Object.keys(meta).length > 0 && 'service' in meta) {
            const { service, ...rest } = meta;
            if (Object.keys(rest).length > 0) {
              msg += ` ${JSON.stringify(rest)}`;
            }
          } else if (Object.keys(meta).length > 0) {
            msg += ` ${JSON.stringify(meta)}`;
          }
          return msg;
        })
      ),
    }),
  ],
});

if (config.nodeEnv === 'production') {
  // Only enable file logging if logs directory is writable
  // In containerized environments (like Lightsail), logs typically go to stdout
  try {
    // Test if we can write to logs directory
    fs.accessSync(logsDir, fs.constants.W_OK);
    
    // Error logs - rotate hourly, keep 12 hours (12 files max)
    logger.add(
      new DailyRotateFile({
        filename: path.join(logsDir, 'error-%DATE%.log'),
        datePattern: 'YYYY-MM-DD-HH',
        level: 'error',
        maxSize: '10m',
        maxFiles: 12, // Keep 12 hours worth of logs (12 files)
        zippedArchive: true,
        auditFile: path.join(logsDir, '.error-audit.json'),
      })
    );

    // Combined logs - rotate hourly, keep 12 hours (12 files max)
    logger.add(
      new DailyRotateFile({
        filename: path.join(logsDir, 'combined-%DATE%.log'),
        datePattern: 'YYYY-MM-DD-HH',
        maxSize: '10m',
        maxFiles: 12, // Keep 12 hours worth of logs (12 files)
        zippedArchive: true,
        auditFile: path.join(logsDir, '.combined-audit.json'),
      })
    );
  } catch (error) {
    // Logs directory not writable - this is fine for containerized environments
    // Logs will go to stdout/stderr which Lightsail captures
    console.warn('Logs directory not writable, using console logging only');
  }
}

export default logger;


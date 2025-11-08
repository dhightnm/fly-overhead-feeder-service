import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import config from '../config';
import fs from 'fs';
import path from 'path';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
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
}

export default logger;


import pino from 'pino';
import type { AppConfig } from '../types/index.js';

let loggerInstance: pino.Logger | null = null;

export function createLogger(config: AppConfig): pino.Logger {
  loggerInstance = pino({
    level: config.logLevel,
    transport:
      process.env.NODE_ENV !== 'production'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
  });

  return loggerInstance;
}

export function getLogger(): pino.Logger {
  if (!loggerInstance) {
    throw new Error('Logger not initialized. Call createLogger() first.');
  }
  return loggerInstance;
}

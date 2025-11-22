import winston from 'winston';

export type Logger = winston.Logger;

export function createLogger(level: string = 'info'): Logger {
  return winston.createLogger({
    level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
        return `${timestamp} [${level}]: ${message} ${metaStr}`;
      })
    ),
    transports: [
      new winston.transports.Console()
    ]
  });
}

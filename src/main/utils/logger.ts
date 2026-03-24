import winston from 'winston'
import path    from 'path'
import os      from 'os'

// Safe userData path: use electron app if available, otherwise fall back to OS temp dir
function getLogDir(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron')
    if (app && app.getPath) {
      return path.join(app.getPath('userData'), 'logs')
    }
  } catch {
    // Not running in Electron (e.g. unit tests)
  }
  return path.join(os.tmpdir(), 'agentos-logs')
}

const logDir = getLogDir()

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp }) =>
          `${timestamp} [${level}] ${message}`
        ),
      ),
      silent: process.env.NODE_ENV === 'test',
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level:    'error',
      maxsize:  5 * 1024 * 1024,
      maxFiles: 3,
      silent:   process.env.NODE_ENV === 'test',
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize:  10 * 1024 * 1024,
      maxFiles: 5,
      silent:   process.env.NODE_ENV === 'test',
    }),
  ],
})

/* eslint-disable no-console */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Minimal scoped logger that works in both the Node and the browser context.
 *
 * The main process additionally pipes these records into electron-log, see
 * src/main/index.ts.
 */
export class Logger {
  static level: LogLevel = import.meta.env?.DEV ? 'debug' : 'info';

  constructor(private readonly scope: string) {}

  debug(message: string, ...args: unknown[]): void {
    this.write('debug', message, args);
  }

  info(message: string, ...args: unknown[]): void {
    this.write('info', message, args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.write('warn', message, args);
  }

  error(message: string, ...args: unknown[]): void {
    this.write('error', message, args);
  }

  private write(level: LogLevel, message: string, args: unknown[]): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[Logger.level]) return;
    const prefix = `[${this.scope}]`;
    const target = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    target(prefix, message, ...args);
  }
}

export function createLogger(scope: string): Logger {
  return new Logger(scope);
}

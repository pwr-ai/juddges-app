/**
 * Simple logger utility for production-safe logging
 * Replaces console.log statements throughout the application
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

class Logger {
  private level: LogLevel;
  private isDevelopment: boolean;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
    this.level = this.isDevelopment ? LogLevel.DEBUG : LogLevel.INFO;

    // Override log level from environment variable if provided
    const envLogLevel = process.env.LOG_LEVEL?.toUpperCase();
    if (envLogLevel && LogLevel[envLogLevel as keyof typeof LogLevel] !== undefined) {
      this.level = LogLevel[envLogLevel as keyof typeof LogLevel];
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const baseMessage = `[${timestamp}] [${level}] ${message}`;

    if (data !== undefined) {
      try {
        return `${baseMessage} ${JSON.stringify(data, null, this.isDevelopment ? 2 : 0)}`;
      } catch {
        return `${baseMessage} [Unparseable data]`;
      }
    }

    return baseMessage;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      // eslint-disable-next-line no-console
      console.log(this.formatMessage('DEBUG', message, data));
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.INFO)) {
      // eslint-disable-next-line no-console
      console.info(this.formatMessage('INFO', message, data));
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.WARN)) {
      // eslint-disable-next-line no-console
      console.warn(this.formatMessage('WARN', message, data));
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error(message: string, error?: any, data?: any): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const errorData = {
        ...data,
        error: error instanceof Error ? {
          message: error.message,
          stack: this.isDevelopment ? error.stack : undefined,
          name: error.name
        } : error
      };
      // eslint-disable-next-line no-console
      console.error(this.formatMessage('ERROR', message, errorData));
    }
  }

  /**
   * Log API request details
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logRequest(method: string, path: string, data?: any): void {
    this.info(`${method} ${path}`, data);
  }

  /**
   * Log API response details
   */
  logResponse(method: string, path: string, status: number, duration: number): void {
    const level = status >= 400 ? LogLevel.ERROR : LogLevel.INFO;
    const message = `${method} ${path} - ${status} (${duration}ms)`;

    if (level === LogLevel.ERROR) {
      this.error(message);
    } else {
      this.info(message);
    }
  }

  /**
   * Create a child logger with a specific context
   */
  child(context: string): ContextLogger {
    return new ContextLogger(context, this);
  }
}

class ContextLogger {
  constructor(
    private context: string,
    private parent: Logger
  ) {}

  private prefixMessage(message: string): string {
    return `[${this.context}] ${message}`;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug(message: string, data?: any): void {
    this.parent.debug(this.prefixMessage(message), data);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info(message: string, data?: any): void {
    this.parent.info(this.prefixMessage(message), data);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn(message: string, data?: any): void {
    this.parent.warn(this.prefixMessage(message), data);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error(message: string, error?: any, data?: any): void {
    this.parent.error(this.prefixMessage(message), error, data);
  }
}

// Create singleton instance
const logger = new Logger();

// Export singleton and classes
export default logger;
export { logger, Logger, ContextLogger };

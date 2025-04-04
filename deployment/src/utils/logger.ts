import { LogLevel } from '../types/config';

export class Logger {
  private level: LogLevel;

  constructor(level: LogLevel = 'info') {
    this.level = level;
  }

  private getLogLevelPriority(level: LogLevel): number {
    const priorities: Record<LogLevel, number> = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
      trace: 4
    };
    return priorities[level];
  }

  private shouldLog(messageLevel: LogLevel): boolean {
    return this.getLogLevelPriority(messageLevel) <= this.getLogLevelPriority(this.level);
  }

  private formatMessage(level: string, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const formattedMessage = args.length > 0 ? `${message} ${args.join(' ')}` : message;
    return `[${timestamp}] [${level.toUpperCase()}] ${formattedMessage}`;
  }

  public error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, ...args));
    }
  }

  public warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, ...args));
    }
  }

  public info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message, ...args));
    }
  }

  public debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message, ...args));
    }
  }

  public trace(message: string, ...args: any[]): void {
    if (this.shouldLog('trace')) {
      console.log(this.formatMessage('trace', message, ...args));
    }
  }
} 
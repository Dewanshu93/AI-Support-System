import pino from 'pino';

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * Process-wide JSON logger. Silent under Jest; server.ts applies the validated
 * LOG_LEVEL after config loads. Never log raw message content or secrets.
 */
export const logger = pino({
  base: { service: 'api' },
  level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
  redact: { paths: ['*.password', '*.token', '*.cookie', '*.authorization'], censor: '[redacted]' },
});

export type Logger = pino.Logger;

import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: { target: 'pino-pretty', options: { colorize: false } },
});

/**
 * Reduced-noise logger for third-party libraries (Baileys, etc.)
 * Only logs warnings and above to prevent protocol-level log spam.
 * Note: level must be set via options param, not bindings.
 */
export const libLogger = logger.child({ lib: true }, { level: 'warn' });

// Route uncaught errors through pino so they get timestamps in stderr
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled rejection');
});

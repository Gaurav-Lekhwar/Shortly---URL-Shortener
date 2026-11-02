const pino = require('pino');
const env = require('../config/env');

// Structured logger: JSON in production (for log aggregators),
// pretty + coloured in development.
const logger = pino({
  level: env.isTest ? 'silent' : env.isDevelopment ? 'debug' : 'info',
  transport:
    env.isDevelopment && !env.isTest
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
        }
      : undefined,
});

module.exports = logger;

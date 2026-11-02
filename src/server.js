const app = require('./app');
const env = require('./config/env');
const logger = require('./lib/logger');
const { pool } = require('./config/database');
const { redis } = require('./lib/redis');

const server = app.listen(env.port, () => {
  logger.info({ port: env.port, env: env.nodeEnv }, `Shortly web app running at ${env.appUrl}`);
});

function shutdown(signal) {
  logger.info({ signal }, 'Shutting down...');
  server.close(async () => {
    try {
      await pool.end();
      redis.disconnect();
    } catch (err) {
      logger.warn({ err: err.message }, 'Error during shutdown');
    }
    logger.info('Server closed');
    process.exit(0);
  });
  // Force-exit if graceful shutdown hangs
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = server;

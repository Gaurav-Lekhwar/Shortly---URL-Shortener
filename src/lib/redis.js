const Redis = require('ioredis');
const logger = require('./logger');
const env = require('../config/env');

// Single shared Redis connection used for the URL cache and rate limiting.
// Redis is supporting infrastructure: if it is unreachable we log a warning
// and fall back (PostgreSQL for cache reads, in-memory for rate limits).
const redis = new Redis(env.redisUrl, {
  maxRetriesPerRequest: 1,
  retryStrategy: (times) => Math.min(times * 100, 2000),
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on('connect', () => logger.debug('Redis client connected'));
redis.on('error', (err) => logger.warn({ err: err.message }, 'Redis error (falling back gracefully)'));

let available = false;
redis.on('ready', () => {
  available = true;
  logger.info('Redis connection ready');
});
redis.on('close', () => {
  available = false;
});

/**
 * Whether Redis can currently be used. When false, callers must fall back
 * to PostgreSQL / in-memory behaviour instead of failing the request.
 */
function isAvailable() {
  return available && redis.status === 'ready';
}

module.exports = { redis, isAvailable };

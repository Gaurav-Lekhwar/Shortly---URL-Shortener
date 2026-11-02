const { redis, isAvailable: redisAvailable } = require('../lib/redis');
const { Errors } = require('../utils/errors');
const logger = require('../lib/logger');

// In-memory fallback when Redis is unavailable (per-process; fine for dev/tests).
const memoryBuckets = new Map(); // key -> array of timestamps

function pruneMemory(key, now, windowMs) {
  const hits = memoryBuckets.get(key) || [];
  const fresh = hits.filter((t) => now - t < windowMs);
  memoryBuckets.set(key, fresh);
  return fresh;
}

async function hitRedis(key, windowMs, limit) {
  const now = Date.now();
  const pipeline = redis.pipeline();
  pipeline.incr(key);
  pipeline.pexpire(key, windowMs);
  const results = await pipeline.exec();
  const count = results[0][1];
  const ttl = await redis.pttl(key);
  return { count, remaining: Math.max(0, limit - count), resetMs: ttl > 0 ? ttl : windowMs };
}

/**
 * Fixed-window rate limiter, Redis-backed with in-memory fallback.
 *
 * @param {Object} opts
 * @param {number} opts.limit      max requests per window
 * @param {number} opts.windowMs   window size in ms
 * @param {(req) => string} opts.keyFn  how to identify the client (IP, user id, ...)
 */
function rateLimit({ limit, windowMs, keyFn, name = 'global' }) {
  return async (req, res, next) => {
    const identifier = keyFn(req);
    const key = `rl:${name}:${identifier}`;

    let count;
    let remaining;
    let resetMs = windowMs;

    try {
      if (redisAvailable()) {
        const r = await hitRedis(key, windowMs, limit);
        count = r.count;
        remaining = r.remaining;
        resetMs = r.resetMs;
      } else {
        throw new Error('redis unavailable');
      }
    } catch (err) {
      // Graceful fallback: per-process in-memory window
      const now = Date.now();
      const fresh = pruneMemory(key, now, windowMs);
      fresh.push(now);
      memoryBuckets.set(key, fresh);
      count = fresh.length;
      remaining = Math.max(0, limit - count);
      resetMs = windowMs;
    }

    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(resetMs / 1000));

    if (count > limit) {
      logger.warn({ key, count, limit }, 'Rate limit exceeded');
      return next(Errors.rateLimited('Too many requests, please try again later'));
    }
    next();
  };
}

// Presets from the spec
const authLimiter = () =>
  rateLimit({
    limit: 5,
    windowMs: 60_000,
    name: 'auth',
    keyFn: (req) => req.ip,
  });

const urlCreateLimiter = () =>
  rateLimit({
    limit: 30,
    windowMs: 60_000,
    name: 'url-create',
    keyFn: (req) => `user:${req.user?.id || req.ip}`,
  });

const apiLimiter = () =>
  rateLimit({
    limit: 100,
    windowMs: 60_000,
    name: 'api',
    keyFn: (req) => `user:${req.user?.id || req.ip}`,
  });

const redirectLimiter = () =>
  rateLimit({
    limit: 300,
    windowMs: 60_000,
    name: 'redirect',
    keyFn: (req) => req.ip,
  });

module.exports = { rateLimit, authLimiter, urlCreateLimiter, apiLimiter, redirectLimiter };

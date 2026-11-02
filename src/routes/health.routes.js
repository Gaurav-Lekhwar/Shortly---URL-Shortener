const express = require('express');
const { pool } = require('../config/database');
const { redis, isAvailable: redisAvailable } = require('../lib/redis');

const router = express.Router();

// Liveness: is the process running?
router.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Readiness: can we serve traffic? Checks PostgreSQL and Redis.
router.get('/ready', async (req, res) => {
  const checks = { postgres: 'down', redis: 'down' };
  try {
    await pool.query('SELECT 1');
    checks.postgres = 'up';
  } catch {
    checks.postgres = 'down';
  }
  try {
    if (redisAvailable()) {
      await redis.ping();
      checks.redis = 'up';
    }
  } catch {
    checks.redis = 'down';
  }

  // Redis is supporting infra: degrade but report. Postgres down => not ready.
  const ready = checks.postgres === 'up';
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not-ready', checks });
});

module.exports = router;

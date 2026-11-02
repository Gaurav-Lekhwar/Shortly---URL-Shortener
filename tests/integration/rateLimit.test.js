const express = require('express');
const request = require('supertest');
const { rateLimit } = require('../../src/middleware/rateLimit.middleware');

/**
 * Rate-limiting is tested against the real middleware (Redis-backed with
 * in-memory fallback) mounted on a tiny throwaway app, so the test does not
 * depend on the production limits of any particular route.
 */
describe('rate limiting', () => {
  function buildApp(limit) {
    const t = express();
    t.get(
      '/ping',
      rateLimit({ limit, windowMs: 60_000, name: `test-${limit}-${Date.now()}`, keyFn: () => 'shared-test-key' }),
      (req, res) => res.json({ success: true })
    );
    // Minimal error handler with the same response shape as the app
    // eslint-disable-next-line no-unused-vars
    t.use((err, req, res, next) => {
      res.status(err.statusCode || 500).json({
        success: false,
        error: { code: err.code || 'INTERNAL_SERVER_ERROR', message: err.message },
      });
    });
    return t;
  }

  test('allows requests under the limit and returns 429 beyond it', async () => {
    const t = buildApp(3);
    for (let i = 0; i < 3; i++) {
      const ok = await request(t).get('/ping');
      expect(ok.status).toBe(200);
      expect(ok.headers['x-ratelimit-limit']).toBe('3');
    }
    const limited = await request(t).get('/ping');
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      success: false,
      error: { code: 'RATE_LIMIT_EXCEEDED', message: expect.any(String) },
    });
    expect(limited.headers['x-ratelimit-remaining']).toBe('0');
  });

  afterAll(async () => {
    const { redis } = require('../../src/lib/redis');
    try { redis.disconnect(); } catch { /* ignore */ }
  });
});

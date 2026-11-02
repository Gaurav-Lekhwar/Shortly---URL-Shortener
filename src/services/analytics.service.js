const urlRepository = require('../repositories/url.repository');
const analyticsRepository = require('../repositories/analytics.repository');
const { redis, isAvailable: redisAvailable } = require('../lib/redis');
const { enqueueClickAsync } = require('../lib/queue');
const { UAParser } = require('ua-parser-js');
const { Errors } = require('../utils/errors');
const { isExpired, hashVisitor } = require('../utils/url');
const logger = require('../lib/logger');
const { cacheKey, CACHE_TTL_SECONDS } = require('./url.service');

/**
 * Resolve a short code to its destination.
 * Cache-aside: Redis first, PostgreSQL on miss; Redis failure falls back
 * gracefully to PostgreSQL (never breaks the redirect).
 */
async function resolveShortCode(shortCode) {
  // 1. Try Redis cache
  if (redisAvailable()) {
    try {
      const cached = await redis.get(cacheKey(shortCode));
      if (cached) {
        const entry = JSON.parse(cached);
        return { ...entry, fromCache: true };
      }
    } catch (err) {
      logger.warn({ err: err.message, shortCode }, 'Redis cache read failed, using PostgreSQL');
    }
  }

  // 2. PostgreSQL fallback (source of truth)
  const url = await urlRepository.findByShortCode(shortCode);
  if (!url) return null;

  const entry = {
    urlId: url.id,
    url: url.originalUrl,
    isActive: url.isActive,
    expiresAt: url.expiresAt ? url.expiresAt.toISOString() : null,
  };

  // 3. Populate cache for next time
  if (redisAvailable()) {
    try {
      await redis.set(cacheKey(shortCode), JSON.stringify(entry), 'EX', CACHE_TTL_SECONDS);
    } catch (err) {
      logger.warn({ err: err.message, shortCode }, 'Redis cache write failed');
    }
  }

  return { ...entry, fromCache: false };
}

function buildClickEvent(req, urlId) {
  const ua = new UAParser(req.headers['user-agent'] || '');
  const result = ua.getResult();
  const forwarded = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || req.ip || req.socket?.remoteAddress || '';

  return {
    urlId,
    clickedAt: new Date().toISOString(),
    referrer: req.headers.referer || req.headers.referrer || null,
    browser: result.browser?.name || null,
    operatingSystem: result.os?.name || null,
    deviceType: result.device?.type || 'desktop',
    country: null, // geo-IP lookup is intentionally out of scope for this project
    visitorHash: hashVisitor(ip, req.headers['user-agent'] || ''),
  };
}

/**
 * Full redirect flow: rate limiting is applied by middleware; this handles
 * resolve -> expiry/disabled checks -> async analytics -> 302.
 * Analytics is enqueued WITHOUT awaiting so the redirect stays fast.
 */
async function handleRedirect(req, res) {
  const { shortCode } = req.params;
  const entry = await resolveShortCode(shortCode);

  if (!entry) throw Errors.urlNotFound();
  if (!entry.isActive) throw Errors.notFound('This link is disabled', 'URL_DISABLED');
  if (isExpired(entry.expiresAt)) throw Errors.gone();

  enqueueClickAsync(buildClickEvent(req, entry.urlId));

  res.redirect(302, entry.url);
}

async function getAnalyticsForUser(userId, id, days = 30) {
  const url = await urlRepository.findById(id);
  if (!url || url.userId !== userId) throw Errors.urlNotFound();
  return analyticsRepository.getAnalytics(url.id, days);
}

module.exports = { resolveShortCode, handleRedirect, getAnalyticsForUser, buildClickEvent };

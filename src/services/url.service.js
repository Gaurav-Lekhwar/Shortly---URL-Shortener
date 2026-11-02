const urlRepository = require('../repositories/url.repository');
const { generateShortCode, MAX_GENERATION_ATTEMPTS } = require('../utils/shortCode');
const { validateDestinationUrl, isExpired } = require('../utils/url');
const { Errors, AppError } = require('../utils/errors');
const { redis, isAvailable: redisAvailable } = require('../lib/redis');
const logger = require('../lib/logger');
const env = require('../config/env');

const CACHE_PREFIX = 'url:';
const CACHE_TTL_SECONDS = 24 * 60 * 60; // 1 day

function cacheKey(code) {
  return `${CACHE_PREFIX}${code}`;
}

function publicUrl(code) {
  return `${env.appUrl}/${code}`;
}

function toResponse(url, appUrl = env.appUrl) {
  const shortLink = `${appUrl}/${url.shortCode}`;
  return {
    id: url.id,
    shortCode: url.shortCode,
    customAlias: url.customAlias,
    shortUrl: shortLink,
    originalUrl: url.originalUrl,
    isActive: url.isActive,
    isExpired: isExpired(url.expiresAt),
    expiresAt: url.expiresAt,
    clickCount: url.clickCount ?? 0,
    createdAt: url.createdAt,
    updatedAt: url.updatedAt,
  };
}

async function invalidateCache(shortCode) {
  try {
    if (redisAvailable()) await redis.del(cacheKey(shortCode));
  } catch (err) {
    logger.warn({ err: err.message, shortCode }, 'Failed to invalidate URL cache');
  }
}

function isUniqueViolation(err) {
  return err && err.code === '23505';
}

/**
 * Create a short URL for a user.
 * Collision-safe: the UNIQUE constraint on short_code is the final guard;
 * on violation we generate a new code and retry (up to MAX attempts).
 */
async function createUrl(userId, { originalUrl, customAlias, expiresAt }) {
  const check = validateDestinationUrl(originalUrl);
  if (!check.valid) throw Errors.unprocessable(check.reason, 'INVALID_URL');

  if (expiresAt && new Date(expiresAt) <= new Date()) {
    throw Errors.unprocessable('Expiration must be in the future', 'INVALID_EXPIRATION');
  }

  if (customAlias) {
    const taken = await urlRepository.findByAlias(customAlias);
    if (taken) throw Errors.aliasTaken();
    try {
      const url = await urlRepository.create({
        userId,
        shortCode: customAlias, // custom aliases resolve via the same short_code lookup
        originalUrl: check.normalized,
        customAlias,
        expiresAt: expiresAt || null,
      });
      return toResponse(url);
    } catch (err) {
      if (isUniqueViolation(err)) throw Errors.aliasTaken();
      throw err;
    }
  }

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const code = generateShortCode();
    try {
      const url = await urlRepository.create({
        userId,
        shortCode: code,
        originalUrl: check.normalized,
        expiresAt: expiresAt || null,
      });
      return toResponse(url);
    } catch (err) {
      if (isUniqueViolation(err)) {
        logger.warn({ attempt, code }, 'Short code collision, retrying');
        continue; // race-safe retry: DB constraint is the source of truth
      }
      throw err;
    }
  }
  throw new AppError(500, 'CODE_GENERATION_FAILED', 'Could not generate a unique short code');
}

/** Fetch a user's own URL or 404 (authorization: never reveal other users' URLs). */
async function getUserUrl(userId, id) {
  const url = await urlRepository.findById(id);
  if (!url || url.userId !== userId) throw Errors.urlNotFound();
  return url;
}

async function listUrls(userId, query) {
  const { items, total, page, limit } = await urlRepository.listByUser(userId, query);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    urls: items.map((u) => toResponse(u)),
    pagination: { page, limit, total, totalPages },
  };
}

async function updateUrl(userId, id, fields) {
  const existing = await getUserUrl(userId, id);

  if (fields.originalUrl !== undefined) {
    const check = validateDestinationUrl(fields.originalUrl);
    if (!check.valid) throw Errors.unprocessable(check.reason, 'INVALID_URL');
    fields.originalUrl = check.normalized;
  }
  if (fields.expiresAt !== undefined && fields.expiresAt !== null) {
    if (new Date(fields.expiresAt) <= new Date()) {
      throw Errors.unprocessable('Expiration must be in the future', 'INVALID_EXPIRATION');
    }
  }
  if (fields.customAlias !== undefined && fields.customAlias !== null) {
    const taken = await urlRepository.findByAlias(fields.customAlias);
    if (taken && taken.id !== existing.id) throw Errors.aliasTaken();
  }

  try {
    const updated = await urlRepository.update(id, userId, fields);
    await invalidateCache(existing.shortCode);
    if (fields.customAlias !== undefined && existing.customAlias && existing.customAlias !== fields.customAlias) {
      await invalidateCache(existing.customAlias);
    }
    return toResponse(updated);
  } catch (err) {
    if (isUniqueViolation(err)) throw Errors.aliasTaken();
    throw err;
  }
}

async function deleteUrl(userId, id) {
  const existing = await getUserUrl(userId, id);
  const deleted = await urlRepository.remove(id, userId);
  if (!deleted) throw Errors.urlNotFound();
  await invalidateCache(existing.shortCode);
  if (existing.customAlias) await invalidateCache(existing.customAlias);
}

async function getQrBuffer(userId, id) {
  await getUserUrl(userId, id);
  const url = await urlRepository.findById(id);
  const QRCode = require('qrcode');
  return QRCode.toBuffer(publicUrl(url.shortCode), { type: 'png', width: 256, margin: 1 });
}

module.exports = {
  createUrl,
  getUserUrl,
  listUrls,
  updateUrl,
  deleteUrl,
  getQrBuffer,
  toResponse,
  cacheKey,
  invalidateCache,
  CACHE_TTL_SECONDS,
};

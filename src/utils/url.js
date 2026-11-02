const crypto = require('crypto');

const ALLOWED_PROTOCOLS = ['http:', 'https:'];
const BLOCKED_PROTOCOLS = ['javascript:', 'data:', 'file:', 'vbscript:'];

/**
 * Validate a destination URL before it can be shortened.
 * - Must parse as a URL.
 * - Only http:// and https:// are allowed.
 * - Dangerous schemes (javascript:, data:, file:, vbscript:) are rejected.
 *   This matters because Shortly redirects browsers to these URLs.
 * The server never fetches the URL (no SSRF exposure).
 */
function validateDestinationUrl(input) {
  if (typeof input !== 'string' || input.trim() === '') {
    return { valid: false, reason: 'URL must be a non-empty string' };
  }

  let parsed;
  try {
    parsed = new URL(input.trim());
  } catch {
    return { valid: false, reason: 'Invalid URL format' };
  }

  const protocol = parsed.protocol.toLowerCase();

  if (BLOCKED_PROTOCOLS.includes(protocol)) {
    return { valid: false, reason: 'URL scheme is not allowed' };
  }
  if (!ALLOWED_PROTOCOLS.includes(protocol)) {
    return { valid: false, reason: 'Only http and https URLs are allowed' };
  }
  if (!parsed.hostname) {
    return { valid: false, reason: 'URL must include a hostname' };
  }

  return { valid: true, normalized: parsed.toString() };
}

/**
 * Whether a URL row is expired. expires_at NULL => never expires.
 */
function isExpired(expiresAt, now = new Date()) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= now.getTime();
}

/**
 * Hash IP + User-Agent into an opaque visitor identifier.
 * Raw IPs are never stored — only this sha256 digest.
 */
function hashVisitor(ip, userAgent) {
  return crypto
    .createHash('sha256')
    .update(`${ip || ''}|${userAgent || ''}`)
    .digest('hex');
}

module.exports = { validateDestinationUrl, isExpired, hashVisitor };

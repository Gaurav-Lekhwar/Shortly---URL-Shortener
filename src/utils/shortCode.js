const crypto = require('crypto');

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; // Base62
const CODE_LENGTH = 7; // 62^7 ≈ 3.5 trillion possibilities
const MAX_GENERATION_ATTEMPTS = 5;

/**
 * Generate a cryptographically secure random Base62 short code.
 * crypto.randomInt (not Math.random) so codes are not predictable/guessable.
 */
function generateShortCode(length = CODE_LENGTH) {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  }
  return code;
}

/**
 * A generated code must only contain Base62 characters.
 */
function isValidShortCodeFormat(code) {
  return typeof code === 'string' && /^[A-Za-z0-9_-]{3,64}$/.test(code);
}

module.exports = { generateShortCode, isValidShortCodeFormat, MAX_GENERATION_ATTEMPTS };

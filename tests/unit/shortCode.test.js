const { generateShortCode, isValidShortCodeFormat } = require('../../src/utils/shortCode');

describe('short code generation', () => {
  test('generates codes of the requested length using only Base62 characters', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateShortCode();
      expect(code).toHaveLength(7);
      expect(code).toMatch(/^[A-Za-z0-9]+$/);
    }
  });

  test('generates unique codes across many samples', () => {
    const codes = new Set(Array.from({ length: 5000 }, () => generateShortCode()));
    // Random collisions at 62^7 space are practically impossible; assert no dups.
    expect(codes.size).toBe(5000);
  });

  test('isValidShortCodeFormat accepts reasonable codes and rejects junk', () => {
    expect(isValidShortCodeFormat('aZ82kP')).toBe(true);
    expect(isValidShortCodeFormat('abc-123_XYZ')).toBe(true);
    expect(isValidShortCodeFormat('ab')).toBe(false); // too short
    expect(isValidShortCodeFormat('a'.repeat(65))).toBe(false); // too long
    expect(isValidShortCodeFormat('abc 123')).toBe(false); // space
    expect(isValidShortCodeFormat('abc/123')).toBe(false); // path separator
    expect(isValidShortCodeFormat('../etc')).toBe(false); // traversal attempt
    expect(isValidShortCodeFormat('')).toBe(false);
    expect(isValidShortCodeFormat(null)).toBe(false);
  });
});

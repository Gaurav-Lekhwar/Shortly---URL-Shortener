const { validateDestinationUrl, isExpired, hashVisitor } = require('../../src/utils/url');

describe('URL validation', () => {
  test.each([
    'https://example.com',
    'http://example.com/some/long/path?q=1',
    'https://sub.domain.co.uk:8443/a?b=c#frag',
  ])('accepts %s', (url) => {
    expect(validateDestinationUrl(url).valid).toBe(true);
  });

  test.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<h1>hi</h1>',
    'file:///etc/passwd',
    'vbscript:msgbox(1)',
    'ftp://example.com/file',
  ])('rejects dangerous scheme: %s', (url) => {
    const result = validateDestinationUrl(url);
    expect(result.valid).toBe(false);
  });

  test('rejects malformed and empty input', () => {
    expect(validateDestinationUrl('not a url').valid).toBe(false);
    expect(validateDestinationUrl('').valid).toBe(false);
    expect(validateDestinationUrl(null).valid).toBe(false);
    expect(validateDestinationUrl('https://').valid).toBe(false);
  });
});

describe('expiration logic', () => {
  const now = new Date('2026-01-01T12:00:00Z');

  test('NULL expires_at never expires', () => {
    expect(isExpired(null, now)).toBe(false);
    expect(isExpired(undefined, now)).toBe(false);
  });

  test('future expiry is not expired', () => {
    expect(isExpired('2026-12-31T00:00:00Z', now)).toBe(false);
  });

  test('past expiry is expired', () => {
    expect(isExpired('2025-01-01T00:00:00Z', now)).toBe(true);
  });

  test('expiry exactly at now counts as expired', () => {
    expect(isExpired(now.toISOString(), now)).toBe(true);
  });
});

describe('visitor hashing', () => {
  test('is deterministic and never contains the raw IP', () => {
    const h1 = hashVisitor('1.2.3.4', 'Mozilla/5.0');
    const h2 = hashVisitor('1.2.3.4', 'Mozilla/5.0');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
    expect(h1).not.toContain('1.2.3.4');
    expect(hashVisitor('5.6.7.8', 'Mozilla/5.0')).not.toBe(h1);
  });
});

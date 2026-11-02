const request = require('supertest');
const { dbAvailable, applyMigrations, truncateAll, closeConnections } = require('../helpers');

(dbAvailable ? describe : describe.skip)('redirect', () => {
  let app;
  let ipSeq = 1;

  function client(agent) {
    const base = agent || request(app);
    const ip = `10.40.0.${ipSeq++}`;
    const withIp = (req) => req.set('X-Forwarded-For', ip);
    return {
      get: (p) => withIp(base.get(p)),
      post: (p) => withIp(base.post(p)),
      patch: (p) => withIp(base.patch(p)),
      delete: (p) => withIp(base.delete(p)),
    };
  }

  async function loginAs(email) {
    const agent = request.agent(app);
    const c = client(agent);
    await c.post('/api/v1/auth/register').send({ email, password: 'password123' });
    await c.post('/api/v1/auth/login').send({ email, password: 'password123' });
    return c;
  }

  // Unauthenticated redirect check (own IP so the redirect limiter is untouched by other tests)
  function anonGet(path) {
    return request(app).get(path).set('X-Forwarded-For', `10.41.0.${ipSeq++}`).redirects(0);
  }

  beforeAll(async () => {
    await applyMigrations();
    app = require('../../src/app');
  });

  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await closeConnections();
  });

  test('GET /:shortCode 302-redirects to the original URL', async () => {
    const c = await loginAs('redir@example.com');
    const created = await c.post('/api/v1/urls').send({ originalUrl: 'https://example.com/target' });
    const code = created.body.data.shortCode;

    const res = await anonGet(`/${code}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://example.com/target');
  });

  test('unknown short code is 404', async () => {
    const res = await anonGet('/nope123');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('URL_NOT_FOUND');
  });

  test('disabled URL is 404', async () => {
    const c = await loginAs('dis@example.com');
    const created = await c.post('/api/v1/urls').send({ originalUrl: 'https://example.com/d' });
    await c.patch(`/api/v1/urls/${created.body.data.id}`).send({ isActive: false });

    const res = await anonGet(`/${created.body.data.shortCode}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('URL_DISABLED');
  });

  test('expired URL is 410', async () => {
    const c = await loginAs('exp2@example.com');
    const future = new Date(Date.now() + 60_000).toISOString();
    const created = await c
      .post('/api/v1/urls')
      .send({ originalUrl: 'https://example.com/e', expiresAt: future });
    const id = created.body.data.id;

    // Force expiry directly in the DB (simulates time passing)
    const { query } = require('../../src/config/database');
    await query("UPDATE urls SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = $1", [id]);

    const res = await anonGet(`/${created.body.data.shortCode}`);
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('URL_EXPIRED');
  });

  test('custom alias redirects too', async () => {
    const c = await loginAs('aliasredir@example.com');
    await c.post('/api/v1/urls').send({ originalUrl: 'https://example.com/c', customAlias: 'cool-link' });

    const res = await anonGet('/cool-link');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://example.com/c');
  });
});

const request = require('supertest');
const { dbAvailable, applyMigrations, truncateAll, closeConnections } = require('../helpers');

(dbAvailable ? describe : describe.skip)('URL management', () => {
  let app;
  let ipSeq = 1;

  // Unique client IP per test so the IP-based auth rate limiter cannot leak
  // state between tests (the app honours X-Forwarded-For via trust proxy).
  function client(agent) {
    const base = agent || request(app);
    const ip = `10.30.0.${ipSeq++}`;
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
    return { agent, c };
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

  test('full CRUD: create → get → update → delete', async () => {
    const { c } = await loginAs('crud@example.com');

    const created = await c.post('/api/v1/urls').send({ originalUrl: 'https://example.com/long' });
    expect(created.status).toBe(201);
    expect(created.body.data.shortCode).toMatch(/^[A-Za-z0-9]{7}$/);
    expect(created.body.data.shortUrl).toMatch(/\/[A-Za-z0-9]{7}$/);
    const id = created.body.data.id;

    const got = await c.get(`/api/v1/urls/${id}`);
    expect(got.status).toBe(200);
    expect(got.body.data.originalUrl).toBe('https://example.com/long');

    const updated = await c.patch(`/api/v1/urls/${id}`).send({ isActive: false });
    expect(updated.status).toBe(200);
    expect(updated.body.data.isActive).toBe(false);

    const deleted = await c.delete(`/api/v1/urls/${id}`);
    expect(deleted.status).toBe(204);

    const gone = await c.get(`/api/v1/urls/${id}`);
    expect(gone.status).toBe(404);
    expect(gone.body.error.code).toBe('URL_NOT_FOUND');
  });

  test('custom alias works and duplicate alias is 409', async () => {
    const { c } = await loginAs('alias@example.com');

    const first = await c
      .post('/api/v1/urls')
      .send({ originalUrl: 'https://example.com/a', customAlias: 'my-link' });
    expect(first.status).toBe(201);
    expect(first.body.data.shortCode).toBe('my-link');

    const dup = await c
      .post('/api/v1/urls')
      .send({ originalUrl: 'https://example.com/b', customAlias: 'my-link' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('ALIAS_TAKEN');
  });

  test('custom alias conflict across different users is also 409', async () => {
    const a = await loginAs('usera@example.com');
    const b = await loginAs('userb@example.com');
    await a.c.post('/api/v1/urls').send({ originalUrl: 'https://example.com/a', customAlias: 'shared' });
    const res = await b.c.post('/api/v1/urls').send({ originalUrl: 'https://example.com/b', customAlias: 'shared' });
    expect(res.status).toBe(409);
  });

  test('users cannot access each other\'s URLs', async () => {
    const a = await loginAs('ownera@example.com');
    const b = await loginAs('ownerb@example.com');
    const created = await a.c.post('/api/v1/urls').send({ originalUrl: 'https://example.com/secret' });
    const id = created.body.data.id;

    for (const res of [
      await b.c.get(`/api/v1/urls/${id}`),
      await b.c.patch(`/api/v1/urls/${id}`).send({ isActive: false }),
      await b.c.delete(`/api/v1/urls/${id}`),
      await b.c.get(`/api/v1/urls/${id}/analytics`),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('URL_NOT_FOUND');
    }
  });

  test('invalid URLs are rejected (400/422)', async () => {
    const { c } = await loginAs('badurl@example.com');
    for (const originalUrl of ['javascript:alert(1)', 'data:text/html,hi', 'not-a-url', '']) {
      const res = await c.post('/api/v1/urls').send({ originalUrl });
      expect([400, 422]).toContain(res.status);
    }
  });

  test('past expiration date is rejected', async () => {
    const { c } = await loginAs('exp@example.com');
    const res = await c
      .post('/api/v1/urls')
      .send({ originalUrl: 'https://example.com/x', expiresAt: '2020-01-01T00:00:00Z' });
    expect(res.status).toBe(422);
  });

  test('list supports search, status filter and pagination', async () => {
    const { c } = await loginAs('list@example.com');
    await c.post('/api/v1/urls').send({ originalUrl: 'https://github.com/foo' });
    await c.post('/api/v1/urls').send({ originalUrl: 'https://example.com/bar' });
    const disabled = await c.post('/api/v1/urls').send({ originalUrl: 'https://example.com/baz' });
    await c.patch(`/api/v1/urls/${disabled.body.data.id}`).send({ isActive: false });

    const search = await c.get('/api/v1/urls?search=github');
    expect(search.body.data.urls).toHaveLength(1);
    expect(search.body.data.urls[0].originalUrl).toContain('github.com');

    const active = await c.get('/api/v1/urls?status=active');
    expect(active.body.data.urls).toHaveLength(2);

    const dis = await c.get('/api/v1/urls?status=disabled');
    expect(dis.body.data.urls).toHaveLength(1);

    const paged = await c.get('/api/v1/urls?page=1&limit=2');
    expect(paged.body.data.urls).toHaveLength(2);
    expect(paged.body.data.pagination.total).toBe(3);
    expect(paged.body.data.pagination.totalPages).toBe(2);
  });

  test('QR endpoint returns a PNG', async () => {
    const { c } = await loginAs('qr@example.com');
    const created = await c.post('/api/v1/urls').send({ originalUrl: 'https://example.com/qr' });
    const res = await c.get(`/api/v1/urls/${created.body.data.id}/qr`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
    expect(res.body.length).toBeGreaterThan(100);
  });

  test('analytics endpoint returns aggregated shape', async () => {
    const { c } = await loginAs('analytics@example.com');
    const created = await c.post('/api/v1/urls').send({ originalUrl: 'https://example.com/an' });
    const res = await c.get(`/api/v1/urls/${created.body.data.id}/analytics`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      totalClicks: 0,
      uniqueVisitors: 0,
      clicksOverTime: [],
      byBrowser: [],
      byDevice: [],
    });
  });
});

const request = require('supertest');
const { dbAvailable, applyMigrations, truncateAll, closeConnections } = require('../helpers');

(dbAvailable ? describe : describe.skip)('auth flow', () => {
  let app;
  let ipSeq = 1;

  // Every test gets its own client IP (via X-Forwarded-For, honoured because
  // the app trusts the proxy) so the 5 req/min/IP auth rate limiter cannot
  // leak state between tests.
  function client(agent) {
    const base = agent || request(app);
    const ip = `10.20.0.${ipSeq++}`;
    const withIp = (req) => req.set('X-Forwarded-For', ip);
    return {
      get: (p) => withIp(base.get(p)),
      post: (p) => withIp(base.post(p)),
      patch: (p) => withIp(base.patch(p)),
      delete: (p) => withIp(base.delete(p)),
    };
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

  test('register → me → logout → me(401)', async () => {
    const agent = request.agent(app);
    const c = client(agent);

    const reg = await c
      .post('/api/v1/auth/register')
      .send({ email: 'alice@example.com', password: 'password123' });
    expect(reg.status).toBe(201);
    expect(reg.body.success).toBe(true);
    expect(reg.body.data.user.email).toBe('alice@example.com');
    expect(reg.body.data.user.passwordHash).toBeUndefined();
    expect(reg.body.data.user.password_hash).toBeUndefined();
    // Session cookie is set
    expect(reg.headers['set-cookie'].join(';')).toMatch(/shortly\.sid/);

    const me = await c.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe('alice@example.com');

    const logout = await c.post('/api/v1/auth/logout');
    expect(logout.status).toBe(200);

    const meAfter = await c.get('/api/v1/auth/me');
    expect(meAfter.status).toBe(401);
    expect(meAfter.body.error.code).toBe('UNAUTHORIZED');
  });

  test('login with valid credentials works; wrong password is 401', async () => {
    const c = client();
    await c.post('/api/v1/auth/register').send({ email: 'bob@example.com', password: 'password123' });

    const agent = request.agent(app);
    const lc = client(agent);
    const ok = await lc.post('/api/v1/auth/login').send({ email: 'bob@example.com', password: 'password123' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.user.email).toBe('bob@example.com');

    const bad = await c.post('/api/v1/auth/login').send({ email: 'bob@example.com', password: 'wrong-password' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('duplicate email registration is 409', async () => {
    const c = client();
    const payload = { email: 'dup@example.com', password: 'password123' };
    expect((await c.post('/api/v1/auth/register').send(payload)).status).toBe(201);
    const again = await c.post('/api/v1/auth/register').send(payload);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('EMAIL_TAKEN');
  });

  test('validation errors are 422', async () => {
    const res = await client()
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email', password: 'short' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('rate limiter returns 429 after 5 auth attempts per minute', async () => {
    const c = client();
    for (let i = 0; i < 5; i++) {
      await c.post('/api/v1/auth/login').send({ email: `nobody${i}@example.com`, password: 'wrong' });
    }
    const limited = await c.post('/api/v1/auth/login').send({ email: 'nobody5@example.com', password: 'wrong' });
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      success: false,
      error: { code: 'RATE_LIMIT_EXCEEDED', message: expect.any(String) },
    });
  });

  test('unauthenticated API access is 401; browser page redirects to /login', async () => {
    const c = client();
    const api = await c.get('/api/v1/urls');
    expect(api.status).toBe(401);

    const page = await c.get('/dashboard').set('Accept', 'text/html');
    expect(page.status).toBe(302);
    expect(page.headers.location).toBe('/login');
  });
});

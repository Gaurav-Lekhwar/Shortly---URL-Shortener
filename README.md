# Shortly — URL Shortening & Analytics Platform

A small production-style URL shortening SaaS: cookie-based auth, short links with
custom aliases and expirations, Redis-cached redirects, rate limiting, and
asynchronous click analytics via BullMQ — all in a modular Express monolith with
a server-rendered (EJS + Tailwind) dashboard.

live link = https://shortly-app-gawz.onrender.com

## Quick start (Docker)

```bash
cp .env.example .env        # then set a real SESSION_SECRET
docker compose up --build
```

This starts four services: `app` (web, :3000), `worker` (analytics), `postgres`
(:5432) and `redis` (:6379). Migrations run automatically? No — run them once:

```bash
docker compose exec app npm run migrate
```

Then open http://localhost:3000 → sign up → dashboard. API docs:
http://localhost:3000/api-docs.

## Local development (without Docker)

Requires PostgreSQL 16+ and Redis 7+ running locally.

```bash
npm install
cp .env.example .env        # point DATABASE_URL / REDIS_URL at your local services
npm run migrate
npm run dev                 # web app with nodemon
npm run worker              # analytics worker (separate terminal)
```

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `production` enables secure cookies + JSON logs |
| `PORT` | no | `3000` | Web port |
| `APP_URL` | no | `http://localhost:3000` | Base URL used to build short links |
| `DATABASE_URL` | **yes** | — | PostgreSQL connection string |
| `REDIS_URL` | no | `redis://localhost:6379` | Redis (cache, rate limits, queue) |
| `SESSION_SECRET` | **yes** | — | Signs session cookies; use a long random string |
| `SESSION_MAX_AGE_MS` | no | `604800000` (7d) | Session lifetime |
| `POSTGRES_USER/PASSWORD/DB` | no | `shortly/…` | Used by docker-compose for the DB container |

## API summary

Auth is cookie-session based; the browser and API share the same endpoints.
API responses are always `{ success: true, data }` or
`{ success: false, error: { code, message } }`.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/auth/register` | Register (rate-limited 5/min/IP) |
| POST | `/api/v1/auth/login` | Log in, sets `httpOnly` session cookie |
| POST | `/api/v1/auth/logout` | Log out |
| GET | `/api/v1/auth/me` | Current user |
| POST | `/api/v1/urls` | Create short URL (30/min/user) |
| GET | `/api/v1/urls?page=&limit=&search=&status=&sort=` | List my URLs (100/min/user) |
| GET | `/api/v1/urls/:id` | Get one URL |
| PATCH | `/api/v1/urls/:id` | Update destination / alias / active / expiry |
| DELETE | `/api/v1/urls/:id` | Delete (204) |
| GET | `/api/v1/urls/:id/analytics?days=30` | Click analytics |
| GET | `/api/v1/urls/:id/qr` | QR code PNG |
| GET | `/:shortCode` | 302 redirect (rate-limited per IP) |
| GET | `/health` `/ready` | Liveness / readiness (checks Postgres + Redis) |

Pages: `/login`, `/register`, `/dashboard`, `/dashboard/urls/:id`,
`/api-docs` (Swagger UI).

## Architecture

```
                    ┌─────────────────┐
                    │      User       │
                    └────────┬────────┘
                             │  EJS pages / REST API
                             ▼
                    ┌─────────────────┐
                    │     Express     │
                    │ Routes→Controllers→Services→Repositories
                    └────────┬────────┘
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        Auth (session)  URL Service    Redirect Service
              │              │              │
              │              │              ▼ Redis (url:{code})
              │              │         cache hit? ──yes──▶ 302
              │              │              │ no
              │              │              ▼ PostgreSQL
              │              │         store in Redis ──▶ 302
              │              │              │
              │              │              ▼ BullMQ (not awaited)
              │              │         analytics queue
              │              │              │
              │              ▼              ▼
              └──────────────┴──────▶ PostgreSQL (url_clicks)
```

Key design decisions:

- **PostgreSQL is the source of truth.** Redis is a cache-aside layer for
  redirects (`url:{code}` → `{url,isActive,expiresAt,urlId}`, 24h TTL).
  If Redis is down, redirects fall back to PostgreSQL transparently.
- **Redirects never wait for analytics.** The click event (referrer, browser,
  OS, device, `sha256(ip+UA)` visitor hash — never raw IPs) is enqueued to
  BullMQ and the 302 is sent immediately. A separate `worker` process consumes
  the queue with 3 attempts + exponential backoff.
- **Uniqueness is enforced by the database.** Short codes are
  cryptographically random Base62; on a `UNIQUE` violation we regenerate and
  retry (race-safe — no check-then-insert).
- **Auth is cookie sessions** (`express-session` + PostgreSQL store,
  `httpOnly`, `SameSite=Lax`, `Secure` in production). CSRF risk is mitigated
  by `SameSite=Lax`; the API is same-origin by default (CORS locked to
  `APP_URL`).
- **Rate limiting** is Redis-backed with an in-memory fallback:
  auth 5/min/IP, URL creation 30/min/user, API 100/min/user, redirects
  300/min/IP → `429 { code: "RATE_LIMIT_EXCEEDED" }`.

## Database

Migrations live in `migrations/` (`npm run migrate` applies them in order,
tracked in `schema_migrations`):

- `001` users · `002` urls (FK → users, `UNIQUE(short_code)`,
  `UNIQUE(custom_alias)`) · `003` url_clicks (FK → urls, anonymized)
- `004` indexes: `urls(user_id)`, `urls(user_id, created_at)`,
  `url_clicks(url_id, clicked_at)` (+ unique indexes from constraints)
- `005` session table for the login store

## Scripts

| Script | Purpose |
|---|---|
| `npm start` | Start the web app |
| `npm run dev` | Start with nodemon |
| `npm run worker` | Start the analytics worker |
| `npm run migrate` | Apply pending DB migrations |
| `npm test` | Run all tests (unit + integration) |
| `npm run test:unit` / `test:integration` | Run one suite |

Integration tests use a real PostgreSQL (`DATABASE_URL`) and skip gracefully
without one; Redis is optional thanks to the graceful fallback.

## Security notes

- Passwords hashed with bcrypt; hashes never leave the server.
- All SQL is parameterized; EJS output is escaped.
- Helmet security headers; `X-Request-Id` on every request for log correlation.
- URL validation allows only `http(s)`; `javascript:`/`data:`/`file:` rejected.
  The server never fetches user URLs (no SSRF).
- Global error handler returns consistent error JSON and hides stack traces in
  production.

## Project layout

```
src/            config · controllers · services · repositories · routes
                middleware · validators · utils · lib (redis, queue, logger)
workers/        analytics.worker.js (BullMQ consumer)
migrations/     versioned SQL
views/          EJS: layouts, partials, auth, dashboard, errors
public/         Tailwind (CDN) + css/js
tests/          unit + integration (Jest + Supertest)
```

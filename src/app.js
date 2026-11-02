const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const methodOverride = require('method-override');
const pinoHttp = require('pino-http');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yaml');
const fs = require('fs');

const env = require('./config/env');
const logger = require('./lib/logger');
const { pool } = require('./config/database');

const requestId = require('./middleware/requestId.middleware');
const errorHandler = require('./middleware/error.middleware');

const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const urlRoutes = require('./routes/url.routes');
const redirectRoutes = require('./routes/redirect.routes');
const webRoutes = require('./routes/web.routes');

const app = express();

// Behind Docker / a reverse proxy — needed for correct req.ip and secure cookies.
app.set('trust proxy', 1);

// ---- Views (EJS + Tailwind via CDN) ----
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---- Security headers ----
app.use(helmet({ contentSecurityPolicy: false })); // CSP disabled: Tailwind CDN + inline scripts

// ---- CORS: only the app's own origin needs API access from a browser ----
app.use(
  cors({
    origin: env.appUrl,
    credentials: true,
  })
);

// ---- Request ID + structured HTTP logging ----
app.use(requestId);
app.use(pinoHttp({ logger, genReqId: (req) => req.id }));

// ---- Body parsing ----
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(methodOverride('_method')); // allow HTML forms to send PATCH/DELETE

// ---- Cookie-based sessions (PostgreSQL-backed store) ----
app.use(
  session({
    store: new PgSession({ pool, tableName: 'session', createTableIfMissing: false }),
    name: 'shortly.sid',
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax', // CSRF mitigation for cookie auth (see README security notes)
      secure: env.isProduction, // HTTPS only in production
      maxAge: env.sessionMaxAgeMs,
    },
  })
);

// ---- Routes ----
app.use('/', healthRoutes); // /health, /ready
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/urls', urlRoutes);
app.use('/', webRoutes); // /, /login, /register, /dashboard...

// ---- Swagger docs ----
try {
  const swaggerDoc = YAML.parse(fs.readFileSync(path.join(__dirname, '..', 'swagger.yaml'), 'utf8'));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));
} catch (err) {
  logger.warn({ err: err.message }, 'Could not load swagger.yaml');
}

// ---- Redirect route LAST: GET /:shortCode must not shadow anything above ----
app.use('/', redirectRoutes);

// ---- 404 for unknown routes ----
app.use((req, res) => {
  const wantsHtml = (req.headers.accept || '').includes('text/html');
  if (wantsHtml) return res.status(404).render('errors/404', { title: 'Not found', message: 'Page not found' });
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
  });
});

// ---- Global error handler (must be last) ----
app.use(errorHandler);

module.exports = app;

const logger = require('../lib/logger');
const env = require('../config/env');

/**
 * Global error handler (must be the last middleware).
 * Converts thrown AppErrors into the consistent shape:
 *   { success: false, error: { code, message } }
 * and never leaks stack traces / internals to the client.
 * Browser page requests get a friendly error page instead of JSON.
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_SERVER_ERROR';

  logger.error(
    { err, requestId: req.id, method: req.method, path: req.originalUrl, statusCode },
    'Request failed'
  );

  let message = err.message || 'Something went wrong';
  if (statusCode === 500 && env.isProduction) {
    message = 'Internal server error'; // never leak internals in production
  }

  const wantsHtml = (req.headers.accept || '').includes('text/html');

  // Friendly error pages for the specific browser-visible cases
  if (wantsHtml && ['URL_EXPIRED', 'URL_DISABLED', 'URL_NOT_FOUND', 'RATE_LIMIT_EXCEEDED'].includes(code)) {
    const status = { URL_EXPIRED: 410, URL_DISABLED: 404, URL_NOT_FOUND: 404, RATE_LIMIT_EXCEEDED: 429 }[code];
    return res.status(status).render(`errors/${status}`, { message, title: `Error ${status}` });
  }
  if (wantsHtml && statusCode === 404 && req.path !== '/') {
    return res.status(404).render('errors/404', { message, title: 'Not found' });
  }

  const body = { success: false, error: { code, message } };
  if (err.details) body.error.details = err.details;
  res.status(statusCode).json(body);
}

module.exports = errorHandler;

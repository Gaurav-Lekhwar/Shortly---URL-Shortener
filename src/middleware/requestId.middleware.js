const crypto = require('crypto');

/**
 * Assign a request ID to every request for log correlation.
 * Reuses an incoming X-Request-Id header if present (load balancers, tests).
 */
function requestIdMiddleware(req, res, next) {
  const id = req.headers['x-request-id'] || crypto.randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}

module.exports = requestIdMiddleware;

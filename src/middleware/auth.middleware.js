const { Errors } = require('../utils/errors');

/**
 * Cookie-session auth guard.
 * - req.session.userId set at login => req.user = { id }.
 * - API callers get 401 JSON; browser page loads redirect to /login.
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    req.user = { id: req.session.userId, email: req.session.email };
    return next();
  }
  if (wantsHtml(req)) {
    return res.redirect('/login');
  }
  return next(Errors.unauthorized());
}

/**
 * Same as requireAuth but always responds with 401 JSON (used by /api routes).
 */
function requireApiAuth(req, res, next) {
  if (req.session && req.session.userId) {
    req.user = { id: req.session.userId, email: req.session.email };
    return next();
  }
  return next(Errors.unauthorized());
}

/**
 * Redirect already-logged-in users away from /login and /register.
 */
function redirectIfAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  next();
}

function wantsHtml(req) {
  const accept = req.headers.accept || '';
  return accept.includes('text/html');
}

module.exports = { requireAuth, requireApiAuth, redirectIfAuthenticated };

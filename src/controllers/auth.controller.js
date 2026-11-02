const authService = require('../services/auth.service');
const logger = require('../lib/logger');

function setSession(req, user) {
  req.session.userId = user.id;
  req.session.email = user.email;
}

function wantsHtml(req) {
  return (req.headers.accept || '').includes('text/html');
}

async function register(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await authService.register({ email, password });
    setSession(req, user);
    logger.info({ userId: user.id }, 'User registered');

    if (wantsHtml(req)) return res.redirect('/dashboard');
    res.status(201).json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await authService.login({ email, password });
    setSession(req, user);
    logger.info({ userId: user.id }, 'User logged in');

    if (wantsHtml(req)) return res.redirect('/dashboard');
    res.json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('shortly.sid');
    if (wantsHtml(req)) return res.redirect('/login');
    res.json({ success: true, data: { message: 'Logged out' } });
  });
}

async function me(req, res) {
  res.json({ success: true, data: { user: req.user } });
}

module.exports = { register, login, logout, me };

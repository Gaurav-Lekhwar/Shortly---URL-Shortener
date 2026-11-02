const express = require('express');
const urlService = require('../services/url.service');
const analyticsService = require('../services/analytics.service');
const urlRepository = require('../repositories/url.repository');
const { requireAuth, redirectIfAuthenticated } = require('../middleware/auth.middleware');

const router = express.Router();

// ---- Public auth pages ----
router.get('/login', redirectIfAuthenticated, (req, res) => {
  res.render('auth/login', { title: 'Log in', error: req.query.error });
});
router.get('/register', redirectIfAuthenticated, (req, res) => {
  res.render('auth/register', { title: 'Create account', error: req.query.error });
});

// ---- Dashboard (protected) ----
router.get('/', (req, res) => res.redirect('/dashboard'));

router.get('/dashboard', requireAuth, async (req, res, next) => {
  try {
    const stats = await urlRepository.dashboardStats(req.user.id);
    res.render('dashboard/index', {
      title: 'Dashboard',
      user: req.user,
      stats,
      query: req.query,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/dashboard/urls/:id', requireAuth, async (req, res, next) => {
  try {
    const url = await urlService.getUserUrl(req.user.id, Number(req.params.id));
    const analytics = await analyticsService.getAnalyticsForUser(req.user.id, Number(req.params.id), 30);
    res.render('dashboard/details', {
      title: `Analytics — ${url.shortCode}`,
      user: req.user,
      url: urlService.toResponse(url),
      analytics,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

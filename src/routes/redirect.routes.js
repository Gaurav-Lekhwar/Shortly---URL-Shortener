const express = require('express');
const analyticsService = require('../services/analytics.service');
const { isValidShortCodeFormat } = require('../utils/shortCode');
const { Errors } = require('../utils/errors');
const { redirectLimiter } = require('../middleware/rateLimit.middleware');

const router = express.Router();

// Registered LAST in app.js so it never shadows /api/*, /login, /dashboard, etc.
router.get('/:shortCode', redirectLimiter(), async (req, res, next) => {
  try {
    if (!isValidShortCodeFormat(req.params.shortCode)) {
      throw Errors.urlNotFound();
    }
    await analyticsService.handleRedirect(req, res);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

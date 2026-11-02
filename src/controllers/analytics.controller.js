const analyticsService = require('../services/analytics.service');

async function getUrlAnalytics(req, res, next) {
  try {
    const days = req.validated?.query?.days ?? Number(req.query.days) ?? 30;
    const data = await analyticsService.getAnalyticsForUser(req.user.id, Number(req.params.id), days);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = { getUrlAnalytics };

const urlService = require('../services/url.service');
const logger = require('../lib/logger');

function wantsHtml(req) {
  return (req.headers.accept || '').includes('text/html');
}

async function create(req, res, next) {
  try {
    const data = await urlService.createUrl(req.user.id, req.body);
    logger.info({ userId: req.user.id, shortCode: data.shortCode }, 'URL created');
    if (wantsHtml(req)) return res.redirect('/dashboard?created=1');
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const q = req.validated?.query || req.query;
    const data = await urlService.listUrls(req.user.id, {
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 10,
      search: q.search || '',
      status: q.status || 'all',
      sort: q.sort || 'newest',
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const url = await urlService.getUserUrl(req.user.id, Number(req.params.id));
    res.json({ success: true, data: urlService.toResponse(url) });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const data = await urlService.updateUrl(req.user.id, Number(req.params.id), { ...req.body });
    logger.info({ userId: req.user.id, urlId: req.params.id }, 'URL updated');
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await urlService.deleteUrl(req.user.id, Number(req.params.id));
    logger.info({ userId: req.user.id, urlId: req.params.id }, 'URL deleted');
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

async function qr(req, res, next) {
  try {
    const png = await urlService.getQrBuffer(req.user.id, Number(req.params.id));
    res.type('png').send(png);
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list, getOne, update, remove, qr };

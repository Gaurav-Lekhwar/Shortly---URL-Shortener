const express = require('express');
const urlController = require('../controllers/url.controller');
const analyticsController = require('../controllers/analytics.controller');
const validate = require('../middleware/validate.middleware');
const { requireApiAuth } = require('../middleware/auth.middleware');
const { urlCreateLimiter, apiLimiter } = require('../middleware/rateLimit.middleware');
const {
  createUrlSchema,
  updateUrlSchema,
  urlIdParamSchema,
  listUrlsSchema,
  analyticsQuerySchema,
} = require('../validators/url.validator');

const router = express.Router();

router.use(requireApiAuth); // all URL endpoints require login
router.use(apiLimiter()); // 100 req/min/user

router.post('/', urlCreateLimiter(), validate(createUrlSchema), urlController.create);
router.get('/', validate(listUrlsSchema), urlController.list);
router.get('/:id', validate(urlIdParamSchema), urlController.getOne);
router.patch('/:id', validate(updateUrlSchema), urlController.update);
router.delete('/:id', validate(urlIdParamSchema), urlController.remove);
router.get('/:id/analytics', validate(analyticsQuerySchema), analyticsController.getUrlAnalytics);
router.get('/:id/qr', validate(urlIdParamSchema), urlController.qr);

module.exports = router;

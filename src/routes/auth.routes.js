const express = require('express');
const authController = require('../controllers/auth.controller');
const validate = require('../middleware/validate.middleware');
const { registerSchema, loginSchema } = require('../validators/auth.validator');
const { authLimiter } = require('../middleware/rateLimit.middleware');
const { requireApiAuth } = require('../middleware/auth.middleware');

const router = express.Router();

// 5 req/min/IP on auth endpoints (brute-force protection)
router.post('/register', authLimiter(), validate(registerSchema), authController.register);
router.post('/login', authLimiter(), validate(loginSchema), authController.login);
router.post('/logout', authController.logout);
router.get('/me', requireApiAuth, authController.me);

module.exports = router;

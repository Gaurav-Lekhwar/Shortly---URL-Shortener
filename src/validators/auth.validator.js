const { z } = require('zod');

const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Must be a valid email').max(255),
    password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Must be a valid email'),
    password: z.string().min(1, 'Password is required'),
  }),
});

module.exports = { registerSchema, loginSchema };

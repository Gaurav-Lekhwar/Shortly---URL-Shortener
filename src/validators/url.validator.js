const { z } = require('zod');

const ALIAS_PATTERN = /^[A-Za-z0-9_-]{3,64}$/;

const createUrlSchema = z.object({
  body: z.object({
    originalUrl: z.string().min(1, 'originalUrl is required').max(4096),
    customAlias: z
      .string()
      .regex(ALIAS_PATTERN, 'Custom alias must be 3-64 chars: letters, numbers, - or _')
      .optional()
      .or(z.literal('').transform(() => undefined)),
    expiresAt: z
      .string()
      .datetime({ offset: true, message: 'expiresAt must be an ISO 8601 datetime' })
      .optional()
      .or(z.literal('').transform(() => undefined)),
  }),
});

const updateUrlSchema = z.object({
  params: z.object({ id: z.string().regex(/^\d+$/, 'URL id must be a number') }),
  body: z.object({
    originalUrl: z.string().min(1).max(4096).optional(),
    customAlias: z
      .string()
      .regex(ALIAS_PATTERN, 'Custom alias must be 3-64 chars: letters, numbers, - or _')
      .nullable()
      .optional()
      .or(z.literal('').transform(() => null)),
    isActive: z.boolean().optional(),
    expiresAt: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .optional()
      .or(z.literal('').transform(() => null)),
  }),
});

const urlIdParamSchema = z.object({
  params: z.object({ id: z.string().regex(/^\d+$/, 'URL id must be a number') }),
});

const listUrlsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    search: z.string().max(255).optional().default(''),
    status: z.enum(['all', 'active', 'expired', 'disabled']).optional().default('all'),
    sort: z.enum(['newest', 'oldest', 'clicks']).optional().default('newest'),
  }),
});

const analyticsQuerySchema = z.object({
  params: z.object({ id: z.string().regex(/^\d+$/, 'URL id must be a number') }),
  query: z.object({
    days: z.coerce.number().int().min(0).max(365).default(30),
  }),
});

module.exports = {
  createUrlSchema,
  updateUrlSchema,
  urlIdParamSchema,
  listUrlsSchema,
  analyticsQuerySchema,
};

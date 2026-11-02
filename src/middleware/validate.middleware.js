const { AppError } = require('../utils/errors');

/**
 * Validate req (body/query/params) against a Zod schema.
 * Validation errors -> 422 with a consistent error body.
 */
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      const err = new AppError(422, 'VALIDATION_ERROR', 'Request validation failed');
      err.details = details;
      return next(err);
    }
    req.validated = result.data;
    next();
  };
}

module.exports = validate;

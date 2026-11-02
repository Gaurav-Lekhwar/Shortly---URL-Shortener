/**
 * Application errors with an HTTP status code and a stable machine-readable code.
 * The global error middleware converts these into { success: false, error: { code, message } }.
 */
class AppError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

const Errors = {
  badRequest: (message = 'Bad request', code = 'BAD_REQUEST') =>
    new AppError(400, code, message),
  unauthorized: (message = 'Authentication required', code = 'UNAUTHORIZED') =>
    new AppError(401, code, message),
  forbidden: (message = 'You do not have access to this resource', code = 'FORBIDDEN') =>
    new AppError(403, code, message),
  notFound: (message = 'Resource not found', code = 'NOT_FOUND') =>
    new AppError(404, code, message),
  urlNotFound: () => new AppError(404, 'URL_NOT_FOUND', 'URL does not exist'),
  gone: (message = 'This link has expired', code = 'URL_EXPIRED') =>
    new AppError(410, code, message),
  conflict: (message = 'Resource already exists', code = 'CONFLICT') =>
    new AppError(409, code, message),
  aliasTaken: () => new AppError(409, 'ALIAS_TAKEN', 'This custom alias is already taken'),
  emailTaken: () => new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists'),
  unprocessable: (message = 'Unprocessable entity', code = 'UNPROCESSABLE_ENTITY') =>
    new AppError(422, code, message),
  rateLimited: (message = 'Too many requests', code = 'RATE_LIMIT_EXCEEDED') =>
    new AppError(429, code, message),
};

module.exports = { AppError, Errors };

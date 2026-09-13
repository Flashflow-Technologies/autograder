/**
 * Operational error with an HTTP status code. Anything thrown as an ApiError
 * is "expected" (validation, auth, not-found) and is logged at warn level;
 * everything else is treated as an unexpected fault and logged at error level.
 */
export class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Convenience factories for the common cases
export const BadRequest = (msg, details) => new ApiError(400, msg, details);
export const Unauthorized = (msg = 'Authentication required') => new ApiError(401, msg);
export const Forbidden = (msg = 'You do not have permission to perform this action') => new ApiError(403, msg);
export const NotFound = (msg = 'Resource not found') => new ApiError(404, msg);
export const Conflict = (msg, details) => new ApiError(409, msg, details);
export const Unprocessable = (msg, details) => new ApiError(422, msg, details);

/**
 * Wraps an async route handler so any rejected promise is forwarded to the
 * Express error middleware instead of crashing or hanging the request.
 * Used on every controller — this is how errors get logged everywhere.
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

import logger from '../utils/logger.js';
import { ApiError } from '../utils/errors.js';

/** 404 handler for unmatched routes. */
export function notFoundHandler(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

/**
 * Central error handler. Every error in the app funnels here via asyncHandler
 * or next(err). Operational (expected) errors log at warn; everything else
 * logs at error with a full stack trace. This is the single point that
 * guarantees errors are logged everywhere.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let details = err.details || null;

  // Translate common Mongoose/JWT errors into clean client responses
  if (err.name === 'ValidationError') {
    statusCode = 422;
    message = 'Validation failed';
    details = err.details || Object.values(err.errors || {}).map((e) => e.message);
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid value for field "${err.path}"`;
  } else if (err.code === 11000) {
    statusCode = 409;
    message = 'Duplicate key';
    details = err.keyValue;
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Invalid or expired token';
  } else if (err.name === 'MulterError') {
    statusCode = 400;
    message = err.code === 'LIMIT_FILE_SIZE'
      ? 'Uploaded file is too large. Please upload a smaller file.'
      : `Upload error: ${err.message}`;
  }

  const logMeta = {
    reqId: req.id,
    method: req.method,
    url: req.originalUrl,
    statusCode,
    userId: req.user?.id,
    ip: req.ip,
    details,
  };

  if (statusCode >= 500 || !err.isOperational) {
    logger.error(err.message, { ...logMeta, stack: err.stack });
  } else {
    logger.warn(`${statusCode} ${message}`, logMeta);
  }

  res.status(statusCode).json({
    success: false,
    error: { message, details, reqId: req.id, ...(process.env.NODE_ENV !== 'production' && statusCode >= 500 ? { stack: err.stack } : {}) },
  });
}

import { randomUUID } from 'crypto';
import logger from '../utils/logger.js';

/**
 * Attaches a unique request id to every request and exposes it on the response
 * header (x-request-id). The id is included in error logs so a single failing
 * request can be traced from the client through the API. Also logs the start
 * and completion of each request at debug/http level.
 */
export function requestContext(req, res, next) {
  req.id = req.headers['x-request-id'] || randomUUID();
  res.setHeader('x-request-id', req.id);

  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    // Log slow or error responses with more weight
    const meta = { reqId: req.id, method: req.method, url: req.originalUrl, status: res.statusCode, ms, userId: req.user?.id };
    if (res.statusCode >= 500) logger.error('Request failed', meta);
    else if (res.statusCode >= 400) logger.warn('Request rejected', meta);
    else if (ms > 3000) logger.warn('Slow request', meta);
  });
  next();
}

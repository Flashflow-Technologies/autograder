import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import logger from '../utils/logger.js';

const router = Router();

// Tight rate limit so a buggy/looping client can't flood the logs
const limiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

/**
 * @swagger
 * /client-logs:
 *   post:
 *     tags: [Auth]
 *     summary: Receive a client-side error for central logging
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message: { type: string }
 *               stack: { type: string }
 *               url: { type: string }
 *               level: { type: string, enum: [error, warn, info] }
 *               context: { type: object }
 *     responses:
 *       204: { description: Logged }
 */
router.post('/client-logs', limiter, (req, res) => {
  const { message, stack, url, level = 'error', context } = req.body || {};
  const meta = { source: 'client', url, ua: req.headers['user-agent'], ip: req.ip, context, stack };
  if (level === 'warn') logger.warn(`[client] ${message}`, meta);
  else if (level === 'info') logger.info(`[client] ${message}`, meta);
  else logger.error(`[client] ${message}`, meta);
  res.status(204).end();
});

export default router;

import { Queue } from 'bullmq';
import logger from '../utils/logger.js';

/**
 * Shared Redis connection options for BullMQ. If Redis is unavailable the
 * queue is created lazily and callers fall back to inline scoring, so the
 * system still works in a minimal (no-Redis) free deployment.
 */
export const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null, // required by BullMQ workers
};

export const QUEUE_NAMES = {
  SCORING: 'scoring',
  EMAIL: 'email',
};

let scoringQueue = null;
let emailQueue = null;

// Whether the async queue path is enabled. Set REDIS_DISABLED=true to force
// inline processing (e.g. tiny free hosting without a Redis instance).
export const queueEnabled = process.env.REDIS_DISABLED !== 'true';

export function getScoringQueue() {
  if (!queueEnabled) return null;
  if (!scoringQueue) {
    scoringQueue = new Queue(QUEUE_NAMES.SCORING, { connection });
    scoringQueue.on('error', (err) => logger.error('Scoring queue error', { error: err.message }));
  }
  return scoringQueue;
}

export function getEmailQueue() {
  if (!queueEnabled) return null;
  if (!emailQueue) {
    emailQueue = new Queue(QUEUE_NAMES.EMAIL, { connection });
    emailQueue.on('error', (err) => logger.error('Email queue error', { error: err.message }));
  }
  return emailQueue;
}

export async function closeQueues() {
  if (scoringQueue) await scoringQueue.close();
  if (emailQueue) await emailQueue.close();
}

import { getScoringQueue, getEmailQueue, queueEnabled } from '../config/queue.js';
import { scoreSubmission } from './scoringService.js';
import { sendEmail } from './notificationService.js';
import logger from '../utils/logger.js';

/**
 * Enqueue a scoring job. If the queue (Redis) is unavailable, run scoring
 * inline in the background so the feature still works on a minimal deployment.
 */
export async function enqueueScoring(submissionId) {
  const queue = getScoringQueue();
  if (queue) {
    try {
      await queue.add('score', { submissionId }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      });
      logger.info('Scoring job enqueued', { submissionId });
      return;
    } catch (err) {
      logger.error('Failed to enqueue scoring — falling back to inline', { submissionId, error: err.message });
    }
  }
  // Inline fallback (non-blocking)
  scoreSubmission(submissionId).catch((err) =>
    logger.error('Inline scoring failed', { submissionId, error: err.message, stack: err.stack })
  );
}

/** Enqueue an email job (or send inline if no queue). */
export async function enqueueEmail(payload) {
  const queue = getEmailQueue();
  if (queue) {
    try {
      await queue.add('send', payload, { attempts: 3, backoff: { type: 'exponential', delay: 10000 }, removeOnComplete: 200 });
      return;
    } catch (err) {
      logger.error('Failed to enqueue email — sending inline', { error: err.message });
    }
  }
  sendEmail(payload).catch((err) => logger.error('Inline email failed', { error: err.message }));
}

export { queueEnabled };

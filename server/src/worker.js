import 'dotenv/config';
import { Worker } from 'bullmq';
import { connection, QUEUE_NAMES, queueEnabled } from './config/queue.js';
import { connectDB, disconnectDB } from './config/db.js';
import { scoreSubmission } from './services/scoringService.js';
import { sendEmail } from './services/notificationService.js';
import logger from './utils/logger.js';

/**
 * Standalone background worker. Run with `npm run worker` as a separate process
 * from the API server so heavy NLP scoring never blocks HTTP requests.
 *
 * Consumes two queues:
 *   - scoring : runs the full NLP scoring pipeline for a submission
 *   - email   : sends notification emails via Nodemailer
 *
 * If Redis is disabled (REDIS_DISABLED=true) the API falls back to inline
 * processing and this worker is simply not needed.
 */

let scoringWorker = null;
let emailWorker = null;

async function start() {
  if (!queueEnabled) {
    logger.warn('REDIS_DISABLED=true — worker not started (API runs scoring inline)');
    process.exit(0);
  }

  // The scoring worker needs DB access to read submissions/schemes and write scores
  await connectDB();

  // ---- Scoring worker ----
  scoringWorker = new Worker(
    QUEUE_NAMES.SCORING,
    async (job) => {
      const { submissionId } = job.data;
      logger.info('Worker: scoring job started', { jobId: job.id, submissionId });
      const score = await scoreSubmission(submissionId);
      logger.info('Worker: scoring job done', { jobId: job.id, submissionId, total: score.totalScore });
      return { totalScore: score.totalScore };
    },
    { connection, concurrency: Number(process.env.SCORING_CONCURRENCY) || 2 }
  );

  // ---- Email worker ----
  emailWorker = new Worker(
    QUEUE_NAMES.EMAIL,
    async (job) => {
      logger.info('Worker: email job started', { jobId: job.id, to: job.data.to });
      const sent = await sendEmail(job.data);
      return { sent };
    },
    { connection, concurrency: Number(process.env.EMAIL_CONCURRENCY) || 3 }
  );

  // Per-job lifecycle logging — failures are captured with the job context
  for (const [name, worker] of [['scoring', scoringWorker], ['email', emailWorker]]) {
    worker.on('completed', (job) => logger.info(`Worker[${name}]: completed`, { jobId: job.id }));
    worker.on('failed', (job, err) =>
      logger.error(`Worker[${name}]: failed`, {
        jobId: job?.id,
        attemptsMade: job?.attemptsMade,
        data: job?.data,
        error: err.message,
        stack: err.stack,
      })
    );
    worker.on('error', (err) => logger.error(`Worker[${name}]: worker error`, { error: err.message }));
  }

  logger.info('BullMQ workers started (scoring + email)');
}

async function shutdown(signal) {
  logger.info(`${signal} received — shutting down workers`);
  try {
    if (scoringWorker) await scoringWorker.close();
    if (emailWorker) await emailWorker.close();
    await disconnectDB();
  } catch (err) {
    logger.error('Error during worker shutdown', { error: err.message });
  }
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start().catch((err) => {
  logger.error('Worker failed to start', { error: err.message, stack: err.stack });
  process.exit(1);
});

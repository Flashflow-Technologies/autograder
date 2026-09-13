import 'dotenv/config';
import { createApp } from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import { closeQueues } from './config/queue.js';
import { loadLicence } from './services/licenseService.js';
import logger from './utils/logger.js';

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await connectDB();
    loadLicence(); // verify + cache the licence (logs status)
    const app = createApp();
    const server = app.listen(PORT, () => {
      logger.info(`Server listening on port ${PORT}`);
      logger.info(`API docs at http://localhost:${PORT}/api-docs`);
    });

    // Graceful shutdown so in-flight requests finish and DB closes cleanly
    const shutdown = async (signal) => {
      logger.info(`${signal} received — shutting down`);
      server.close(async () => {
        await closeQueues();
        await disconnectDB();
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10000).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.error('Fatal startup error', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

start();

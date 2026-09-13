import mongoose from 'mongoose';
import logger from '../utils/logger.js';

export async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    logger.error('MONGO_URI is not set — cannot start the server');
    throw new Error('MONGO_URI is not set');
  }

  // Log connection lifecycle events so DB issues are always captured
  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('error', (err) => logger.error('MongoDB connection error', { error: err.message }));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    });
  } catch (err) {
    logger.error('Initial MongoDB connection failed', { error: err.message, stack: err.stack });
    throw err;
  }
}

export async function disconnectDB() {
  await mongoose.connection.close();
  logger.info('MongoDB connection closed');
}

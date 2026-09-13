import mongoose from 'mongoose';
import logger from '../utils/logger.js';

/**
 * Control-plane connection.
 *
 * The control plane is ONE shared database that knows about all tenants but holds
 * NO institutional academic data. It contains the tenant registry, super-admins,
 * subscription/billing references, and per-tenant schema-migration state.
 *
 * This is a dedicated Mongoose connection (separate from any tenant connection),
 * created with createConnection so it never becomes the global default.
 */

let controlConn = null;

export async function connectControlPlane() {
  const uri = process.env.CONTROL_DB_URI;
  if (!uri) {
    logger.error('CONTROL_DB_URI is not set — cannot start the SaaS control plane');
    throw new Error('CONTROL_DB_URI is not set');
  }
  controlConn = mongoose.createConnection(uri, { serverSelectionTimeoutMS: 10000 });

  controlConn.on('connected', () => logger.info('Control-plane DB connected'));
  controlConn.on('error', (err) => logger.error('Control-plane DB error', { error: err.message }));
  controlConn.on('disconnected', () => logger.warn('Control-plane DB disconnected'));

  await controlConn.asPromise();
  return controlConn;
}

export function getControlConnection() {
  if (!controlConn) throw new Error('Control plane not connected — call connectControlPlane() first');
  return controlConn;
}

export async function disconnectControlPlane() {
  if (controlConn) {
    await controlConn.close();
    controlConn = null;
    logger.info('Control-plane DB closed');
  }
}

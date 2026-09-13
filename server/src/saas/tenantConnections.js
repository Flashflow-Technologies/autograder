import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import { bindTenantModels } from './tenantModels.js';

/**
 * Per-tenant connection manager (database-per-tenant).
 *
 * Each tenant has its own MongoDB database. We keep a pool: a map of
 * tenantId -> { connection, models, lastUsed }. Connections are created lazily
 * on first use and reused; idle ones are closed after a TTL to bound resources.
 *
 * CRITICAL ISOLATION RULE: a request only ever receives the connection/models
 * for ITS OWN tenant (resolved from the signed JWT). There is no code path in a
 * normal request that resolves a different tenant's database. This is what makes
 * cross-tenant access impossible by construction.
 */

const POOL = new Map(); // tenantId -> { connection, models, lastUsed }
const IDLE_TTL_MS = Number(process.env.TENANT_CONN_IDLE_TTL_MS || 15 * 60 * 1000); // 15 min
const MAX_OPEN = Number(process.env.TENANT_CONN_MAX_OPEN || 50);

// The base URI of the cluster hosting tenant databases. The specific DB name is
// appended per tenant. Credentials come from the environment/secrets, never code.
function tenantUri(dbName) {
  const base = process.env.TENANT_DB_BASE_URI;
  if (!base) throw new Error('TENANT_DB_BASE_URI is not set');
  // base like: mongodb://user:pass@host:27017  (no trailing db)
  return `${base.replace(/\/$/, '')}/${dbName}`;
}

/**
 * Get (or create) the connection + bound models for a tenant.
 * @param {{_id:string, dbName:string}} tenant  a Tenant registry record
 */
export async function getTenantContext(tenant) {
  const key = String(tenant._id);
  const existing = POOL.get(key);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing;
  }

  // Bound the number of simultaneously open connections (evict the oldest idle).
  if (POOL.size >= MAX_OPEN) evictOldest();

  const connection = mongoose.createConnection(tenantUri(tenant.dbName), {
    serverSelectionTimeoutMS: 10000,
  });
  connection.on('error', (err) => logger.error('Tenant DB error', { tenant: tenant.slug, error: err.message }));
  await connection.asPromise();

  const models = bindTenantModels(connection);
  const ctx = { connection, models, lastUsed: Date.now() };
  POOL.set(key, ctx);
  logger.info('Opened tenant connection', { tenant: tenant.slug, open: POOL.size });
  return ctx;
}

function evictOldest() {
  let oldestKey = null;
  let oldest = Infinity;
  for (const [k, v] of POOL.entries()) {
    if (v.lastUsed < oldest) { oldest = v.lastUsed; oldestKey = k; }
  }
  if (oldestKey) {
    const v = POOL.get(oldestKey);
    POOL.delete(oldestKey);
    v.connection.close().catch(() => {});
    logger.info('Evicted idle tenant connection', { open: POOL.size });
  }
}

// Periodic sweep of idle connections.
let sweeper = null;
export function startConnectionSweeper() {
  if (sweeper) return;
  sweeper = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of POOL.entries()) {
      if (now - v.lastUsed > IDLE_TTL_MS) {
        POOL.delete(k);
        v.connection.close().catch(() => {});
        logger.info('Closed idle tenant connection (TTL)', { open: POOL.size });
      }
    }
  }, Math.min(IDLE_TTL_MS, 5 * 60 * 1000));
  sweeper.unref?.();
}

export async function closeAllTenantConnections() {
  for (const [, v] of POOL.entries()) {
    await v.connection.close().catch(() => {});
  }
  POOL.clear();
  if (sweeper) { clearInterval(sweeper); sweeper = null; }
}

export function openConnectionCount() { return POOL.size; }

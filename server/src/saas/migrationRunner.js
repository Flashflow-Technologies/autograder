import { controlModels } from './controlModels.js';
import { getTenantContext } from './tenantConnections.js';
import { TENANT_MODEL_NAMES } from './tenantModels.js';
import logger from '../utils/logger.js';

/**
 * Migration runner for the database-per-tenant model.
 *
 * Because each tenant has its own database, every schema/index change must be
 * applied to every tenant DB. Migrations are ordered, idempotent steps; each
 * tenant records its current schemaVersion (in the control plane).
 *
 * To add a migration: append a step to MIGRATIONS with the next version number.
 * Each step receives the tenant's bound models + connection and must be safe to
 * run more than once.
 */

const MIGRATIONS = [
  {
    version: 1,
    name: 'initial-indexes',
    async up({ models }) {
      // Ensure indexes defined on the schemas exist in this tenant DB.
      for (const name of TENANT_MODEL_NAMES) {
        if (models[name]?.createIndexes) {
          await models[name].createIndexes();
        }
      }
    },
  },
  // Future migrations append here, e.g.:
  // { version: 2, name: 'add-x', async up({ models, connection }) { ... } },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS.reduce((m, s) => Math.max(m, s.version), 0);

/** Run all pending migrations for one tenant (idempotent). */
export async function runMigrationsForTenant(tenant, ctx = null) {
  const context = ctx || (await getTenantContext(tenant));
  const from = tenant.schemaVersion || 0;
  const pending = MIGRATIONS.filter((m) => m.version > from).sort((a, b) => a.version - b.version);

  for (const step of pending) {
    logger.info('Running migration', { tenant: tenant.slug, version: step.version, name: step.name });
    await step.up(context);
    tenant.schemaVersion = step.version;
    await tenant.save();
  }
  return tenant.schemaVersion;
}

/**
 * Run pending migrations across ALL active tenants, tracking per-tenant
 * success/failure so a failure on one tenant doesn't silently leave the fleet
 * half-migrated. Returns a report.
 */
export async function runMigrationsForAllTenants() {
  const { Tenant } = controlModels();
  const tenants = await Tenant.find({ status: { $in: ['active', 'suspended'] } });
  const report = { latest: LATEST_SCHEMA_VERSION, ok: [], failed: [] };

  for (const tenant of tenants) {
    try {
      const v = await runMigrationsForTenant(tenant);
      report.ok.push({ slug: tenant.slug, version: v });
    } catch (err) {
      report.failed.push({ slug: tenant.slug, error: err.message });
      logger.error('Migration failed for tenant', { tenant: tenant.slug, error: err.message });
    }
  }
  logger.info('Fleet migration complete', { ok: report.ok.length, failed: report.failed.length });
  return report;
}

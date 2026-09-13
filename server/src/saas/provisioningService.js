import bcrypt from 'bcryptjs';
import { controlModels } from './controlModels.js';
import { getTenantContext } from './tenantConnections.js';
import { runMigrationsForTenant, LATEST_SCHEMA_VERSION } from './migrationRunner.js';
import logger from '../utils/logger.js';

/**
 * Vendor-provisioned tenant lifecycle. Driven by the super-admin console.
 * Creating a tenant: register it, open its (new) database, run migrations to
 * build indexes/structure, seed the first tenant-admin, mark active.
 */

const PLAN_LIMITS = {
  essentials: { maxStudents: 1500, maxCoursesActive: 10 },
  institution: { maxStudents: 5000, maxCoursesActive: 50 },
  university: { maxStudents: null, maxCoursesActive: null },
  enterprise: { maxStudents: null, maxCoursesActive: null },
};

function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

/**
 * Provision a new tenant.
 * @returns {{ tenant, adminEmail, tempPassword }}
 */
export async function provisionTenant({ name, plan = 'institution', adminName, adminEmail }) {
  const { Tenant, Subscription, ProvisioningJob } = controlModels();

  if (!name || !adminEmail) throw new Error('name and adminEmail are required');
  if (!PLAN_LIMITS[plan]) throw new Error(`Unknown plan: ${plan}`);

  let slug = slugify(name);
  // Ensure slug/dbName uniqueness.
  const existing = await Tenant.findOne({ slug });
  if (existing) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  const dbName = `evalai_t_${slug.replace(/-/g, '_')}`;

  const tenant = await Tenant.create({
    name, slug, dbName, status: 'provisioning', plan,
    limits: PLAN_LIMITS[plan],
    branding: { displayName: name },
    contact: { adminName, adminEmail },
    schemaVersion: 0,
  });
  const job = await ProvisioningJob.create({ tenantId: tenant._id, action: 'create' });

  try {
    // Opening the context creates the connection; Mongo creates the DB lazily on
    // first write. Migrations create the collections + indexes.
    const ctx = await getTenantContext(tenant);
    await runMigrationsForTenant(tenant, ctx);

    // Seed the first tenant-admin with a temporary password.
    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    await ctx.models.User.create({
      name: adminName || 'Administrator',
      email: String(adminEmail).toLowerCase(),
      passwordHash,
      role: 'admin', // tenant-admin within this tenant's DB
      active: true,
    });

    tenant.status = 'active';
    tenant.activatedAt = new Date();
    tenant.schemaVersion = LATEST_SCHEMA_VERSION;
    await tenant.save();

    // Start a trial subscription (billing wired in Phase 3).
    await Subscription.create({
      tenantId: tenant._id, status: 'trialing', plan,
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
    });

    job.status = 'done'; job.finishedAt = new Date(); await job.save();
    logger.info('Tenant provisioned', { slug, dbName });
    return { tenant, adminEmail: tenant.contact.adminEmail, tempPassword };
  } catch (err) {
    job.status = 'failed'; job.error = err.message; job.finishedAt = new Date(); await job.save();
    tenant.status = 'provisioning'; await tenant.save();
    logger.error('Tenant provisioning failed', { slug, error: err.message });
    throw err;
  }
}

export async function suspendTenant(tenantId) {
  const { Tenant } = controlModels();
  const tenant = await Tenant.findByIdAndUpdate(tenantId, { status: 'suspended', suspendedAt: new Date() }, { new: true });
  logger.info('Tenant suspended', { tenant: tenant?.slug });
  return tenant;
}

export async function reactivateTenant(tenantId) {
  const { Tenant } = controlModels();
  const tenant = await Tenant.findByIdAndUpdate(tenantId, { status: 'active', suspendedAt: null }, { new: true });
  logger.info('Tenant reactivated', { tenant: tenant?.slug });
  return tenant;
}

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let p = '';
  for (let i = 0; i < 12; i++) p += chars[Math.floor(Math.random() * chars.length)];
  return p;
}

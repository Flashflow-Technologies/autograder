import { Forbidden, Unauthorized } from '../utils/errors.js';
import { controlModels } from './controlModels.js';
import { getTenantContext } from './tenantConnections.js';
import logger from '../utils/logger.js';

/**
 * Resolves the tenant for the current request and attaches:
 *   req.tenant  -> the Tenant registry record
 *   req.db      -> tenant-bound models  (req.db.User, req.db.Exam, ...)
 *   req.dbConn  -> the tenant Mongoose connection (for GridFS, transactions)
 *
 * The tenantId comes ONLY from the verified JWT (set by the auth middleware),
 * never from a header/param the client can spoof. This must run AFTER
 * authentication and BEFORE any controller that touches tenant data.
 *
 * Subscription gating (replaces licence keys): a suspended/lapsed tenant is
 * blocked from new actions but its data is never destroyed.
 */
export function resolveTenant({ requireActiveSubscription = true } = {}) {
  return async function tenantMiddleware(req, res, next) {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) return next(Unauthorized('No tenant context in session'));

      const { Tenant, Subscription } = controlModels();
      const tenant = await Tenant.findById(tenantId);
      if (!tenant) return next(Unauthorized('Tenant not found'));

      if (tenant.status === 'offboarded') {
        return next(Forbidden('This institution account has been closed.'));
      }
      if (tenant.status === 'suspended') {
        return next(Forbidden('This institution account is suspended. Please contact your provider.'));
      }
      if (tenant.status === 'provisioning') {
        return next(Forbidden('This institution account is still being set up.'));
      }

      // Subscription check (skipped for read-only endpoints that pass
      // requireActiveSubscription:false, e.g. viewing existing data).
      if (requireActiveSubscription) {
        const sub = await Subscription.findOne({ tenantId: tenant._id }).sort({ createdAt: -1 });
        const ok = sub && ['active', 'trialing'].includes(sub.status)
          && (!sub.currentPeriodEnd || sub.currentPeriodEnd.getTime() > Date.now());
        if (!ok) {
          return next(Forbidden('Your subscription is not active. Existing data remains accessible, but new actions are disabled until renewal.'));
        }
      }

      const ctx = await getTenantContext(tenant);
      req.tenant = tenant;
      req.db = ctx.models;
      req.dbConn = ctx.connection;
      return next();
    } catch (err) {
      logger.error('Tenant resolution failed', { error: err.message });
      return next(err);
    }
  };
}

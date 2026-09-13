# EvalAI SaaS — Phase 1 Build Status

This documents what the Phase 1 multi-tenancy foundation contains, what is
verified, and what remains. **Decisions in effect:** database-per-tenant,
vendor-provisioned, SaaS-only for customers, subscription-status gating (no
licence keys in SaaS).

## What was built (Phase 1 foundation)

All under `server/src/saas/`:

| File | Purpose | Status |
|---|---|---|
| `controlPlane.js` | Connection to the shared control-plane DB | Built, syntax-verified |
| `controlModels.js` | Tenant / Subscription / SuperAdmin / ProvisioningJob | Built, syntax-verified |
| `tenantConnections.js` | Per-tenant connection pool (tenantId → connection), lazy open + idle eviction | Built, syntax-verified |
| `tenantModels.js` | Binds all existing schemas to a tenant connection | Built, syntax-verified |
| `tenantContext.js` | Middleware: resolves tenant from JWT, gates on subscription, injects `req.db` | Built, syntax-verified |
| `provisioningService.js` | Create / suspend / reactivate a tenant (vendor-provisioned) | Built, syntax-verified |
| `migrationRunner.js` | Per-tenant, fleet-wide schema/index migrations with version tracking | Built, syntax-verified |
| `__tests__/isolation.test.js` | **Cross-tenant isolation suite** — the critical safety net | Written; MUST be run against a real MongoDB |

Plus `server/src/services/codeExecProvider.js` — a swappable code-execution seam
so Judge0 can be replaced by a managed/safer provider without touching scoring.

The existing model files gained **named schema exports** (e.g. `export { courseSchema }`)
so the same schemas can be bound to any tenant connection. The original
`export default mongoose.model(...)` lines are untouched, so nothing existing breaks.

## What is verified vs NOT verified — read this

- **Verified here:** every new file is syntax-checked; existing logic tests still
  pass (6/6); the import graph is sound.
- **NOT verified here (cannot be, in the build sandbox):** actual multi-database
  behaviour and tenant isolation. The sandbox has no MongoDB and cannot run
  multi-connection code. **The isolation test suite is the proof, and it must be
  run against a real MongoDB before any of this is trusted.** Isolation is the one
  area where unverified code is dangerous, so treat Phase 1 as "written, pending
  validation" until that suite passes in a real environment.

## How to validate (you, in a real environment)

1. Provide a MongoDB and set `CONTROL_DB_URI` and `TENANT_DB_BASE_URI`.
2. Run the isolation suite:
   ```bash
   cd server
   node --test src/saas/__tests__/isolation.test.js
   ```
3. All tests must pass. Any failure = a cross-tenant leak = do not proceed.

## What remains in Phase 1 (not yet done)

The foundation exists, but to make the app actually serve tenants, the remaining
Phase 1 work is:

1. **Convert controllers to `req.db.<Model>`.** Controllers still import global
   models today. Each must use the tenant-bound models from `req.db`. This is the
   large, pervasive (but mechanical) change, and it should be done module-by-module
   with the app wired to the tenant middleware. **This is the biggest remaining piece.**
2. **Tenant-scoped auth.** The login flow must resolve which tenant a user belongs
   to and embed `tenantId` in the JWT (the design recommends subdomain-based
   identification — to be confirmed).
3. **Wire the app bootstrap** to connect the control plane, start the connection
   sweeper, and mount the tenant middleware ahead of tenant routes.
4. **Super-admin console** (minimal: create/list/suspend tenants) calling
   `provisioningService`.

These were intentionally NOT auto-applied, because converting every controller is
high-impact and should be done deliberately, with the isolation suite passing
first to prove the foundation, and with the tenant-login approach confirmed.

## Open choices still to confirm (from the design doc §13)

1. **Tenant login routing:** subdomain (recommended) vs tenant code vs email domain.
2. **Hosting + managed MongoDB** (e.g. Atlas) — affects backups and provisioning.
3. **Per-tenant backup** retention/restore SLA.
4. **Support impersonation** policy (DPDP-relevant) + logging.
5. **Trial policy** (free trial vs paid from day one).

## Out of scope (specialists)

DPDP legal compliance (lawyer), GST billing (CA, Phase 3), penetration test
(security firm, Phase 4). The code provides the seams; certification is theirs.

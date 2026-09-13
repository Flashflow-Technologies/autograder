# EvalAI SaaS — Phase 0/1 Tenancy Design Document

> **Status:** Design only. No code is being changed by this document. It specifies
> *how* multi-tenancy and data isolation will work, as the foundation for the SaaS
> build. Hand it to any developer you engage; share the compliance sections with
> your DPDP lawyer and GST CA.

> **Decisions locked in:**
> - **Isolation model:** database-per-tenant (each institution = its own database)
> - **Provisioning:** vendor-provisioned (you create tenants; no public self-signup)
> - **Self-hosted** remains your private/internal tool, unchanged. SaaS is the only
>   thing customers receive — they never get source code, which is how your IP is
>   protected.

---

## 1. Architecture overview: control plane + tenant databases

The system splits into two planes.

### 1.1 Control plane (one shared database)
A single small database — call it the **control DB** — that knows about all
tenants but holds **no institutional academic data**. It contains:

- **Tenant registry:** for each institution — id, name, slug, status
  (`provisioning` / `active` / `suspended` / `offboarded`), plan tier,
  subscription status & dates, and **the connection info for that tenant's
  database** (host + database name; credentials via secrets, never stored plainly).
- **Super-admin accounts** (you / your team) — the only accounts that live in the
  control plane.
- **Billing records** (subscription/invoice references; actual card data stays
  with the payment gateway).
- **Provisioning & migration state** (which schema version each tenant DB is on).

### 1.2 Tenant plane (one database per institution)
Each institution gets its **own dedicated database** containing all the existing
collections — `users`, `courses`, `exams`, `questionpapers`, `schemes`,
`submissions`, `scores`, `appeals`, `questionbanks`, `modulenotes`, `auditlogs` —
plus its **own GridFS buckets** (answer scans, question images).

> **Why this gives strong IP/data protection:** because each institution's data is
> a physically separate database, cross-tenant leakage is prevented *by
> construction* — there is no shared table where a missing filter could expose
> another tenant. This is the main benefit of the database-per-tenant choice.

```
                         ┌───────────────────────────┐
   Super-admin (you) ───►│      CONTROL DATABASE     │
                         │  - tenant registry        │
                         │  - super-admins           │
                         │  - billing/subscription   │
                         │  - migration state        │
                         └─────────────┬─────────────┘
                                       │ resolves tenant → DB
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                               ▼                              ▼
┌────────────────┐            ┌────────────────┐            ┌────────────────┐
│ TENANT DB: CEC │            │ TENANT DB: XYZ │            │ TENANT DB: ABC │
│ users, exams,  │            │ users, exams,  │            │ users, exams,  │
│ scores, files… │            │ scores, files… │    ...     │ scores, files… │
└────────────────┘            └────────────────┘            └────────────────┘
```

---

## 2. The core technical pivot: per-tenant database connections

**Today** the app calls `mongoose.connect(MONGO_URI)` once — a single global
connection. Database-per-tenant **cannot** use this; it is the central change.

### 2.1 Connection strategy
- On startup, the app connects to the **control DB** (one global connection).
- For each request, after authentication, the app determines the tenant and
  obtains a **connection to that tenant's database**, using
  `mongoose.createConnection()` (a separate connection per database).
- Tenant connections are **cached/pooled** (a map of `tenantId → connection`), so
  repeat requests reuse the connection rather than reconnecting. Idle connections
  are closed after a TTL to bound resource use.
- Models are **bound to the tenant connection per request** (e.g.
  `conn.model('Exam', examSchema)`), not imported as global singletons as they are
  today. This is the largest mechanical change to the codebase.

### 2.2 Request lifecycle
```
1. Request arrives with JWT.
2. Auth middleware verifies JWT → yields { userId, tenantId, role }.
3. Tenant-resolution middleware:
     - looks up tenantId in the control DB tenant registry (cached)
     - checks tenant status = 'active' and subscription is current
       (if suspended/expired → 402/403 with a clear message; reads may be
        allowed read-only per policy, writes blocked)
     - attaches the tenant DB connection (from pool) to the request context
4. Controllers use req.tenantConn.model(...) for ALL data access.
5. No controller may touch another tenant's connection — there is no code path
   that resolves a different tenant's DB within a normal request.
```

### 2.3 Where the tenant id comes from
- It is embedded in the **JWT at login** (a user belongs to exactly one tenant).
- The login flow itself must find the user: since users live in tenant DBs, login
  resolves the tenant first (via the institution slug/subdomain or an email→tenant
  lookup in the control DB), then authenticates against that tenant's DB.
- **Recommended:** per-tenant subdomain or login slug (e.g. `cec.evalai.app`) so
  the tenant is known *before* authentication. The design should pick one of:
  subdomain, a tenant code on the login page, or email-domain mapping.

---

## 3. Provisioning flow (vendor-provisioned)

No public self-service signup. You create tenants from a **super-admin console**.

```
1. Sales conversation → you decide to onboard "Canara Engineering College".
2. In the super-admin console you enter: institution name, slug, plan tier,
   primary admin's name + email.
3. The system:
     a. creates a tenant registry row (status = 'provisioning')
     b. creates a new database for the tenant
     c. initializes it: indexes, GridFS buckets, schema version = latest
     d. creates the institution's first ADMIN user in that tenant DB
     e. sets status = 'active'
     f. triggers a welcome email with a first-login / set-password link
4. The institution's admin logs in and runs their own setup (courses, users…),
   exactly as the admin does in the current product — but scoped to their DB.
```

Offboarding reverses this: status → `offboarded`, provide a **data export** (their
data is theirs), then schedule deletion of the tenant database per the retention
policy (a DPDP consideration — see §7).

---

## 4. What changes in the existing codebase (Phase 1 scope)

| Area | Change |
|---|---|
| DB config | Replace single global `mongoose.connect` with: one control-DB connection + a per-tenant connection manager (`createConnection`, pooled by tenantId) |
| Models | Convert from globally-imported models to schemas bound to a connection per request (`conn.model(name, schema)`). Schemas themselves change little. |
| Auth | JWT carries `tenantId`; login resolves tenant first, then authenticates in that tenant's DB |
| Middleware | New tenant-resolution middleware (registry lookup + status/subscription check + attach connection) |
| Controllers | All data access goes through the request's tenant connection (no global model imports) |
| GridFS | Buckets opened on the tenant connection, so files are physically per-tenant |
| Super-admin | New control-plane area: tenant CRUD, provisioning, status, billing view |
| Seed/migrate | Per-tenant initialization + the cross-tenant migration runner (§5) |

> Note: the *business logic* (scoring, attainment, Judge0, paper generation, etc.)
> barely changes — it just operates on a tenant-scoped connection instead of the
> global one. The change is in **how data is accessed**, not what the features do.

---

## 5. Schema migrations across many databases (the ongoing tax)

With database-per-tenant, a schema/index change must be applied to **every** tenant
database. This needs a disciplined process:

- **Schema versioning:** each tenant registry row stores its current schema
  version. A central, ordered list of migrations exists in the codebase.
- **Migration runner:** on deploy, the runner iterates all tenants and applies any
  migrations newer than each tenant's version, recording success/failure per
  tenant.
- **Failure handling:** if a migration fails on a tenant, that tenant is flagged
  and held at its prior version; the deploy doesn't silently leave tenants in mixed
  states. Alerting on partial failures is required.
- **New tenants** are always initialized at the latest version.

This is the main recurring cost of the chosen model — budget operational time for
it on every schema-changing release.

---

## 6. Isolation verification (still required, even though it's structural)

Database-per-tenant makes isolation *structurally* strong, but the test suite still
must prove there is **no code path** that crosses tenants:

- A user authenticated in Tenant A, supplying Tenant B's ids (exam, score, file,
  user) cannot have them resolve — because A's connection simply doesn't contain
  them.
- The tenant-resolution middleware cannot be bypassed on any data route.
- The control plane never exposes tenant academic data to the wrong tenant.
- Super-admin endpoints are not reachable by tenant users.

This suite gates go-live.

---

## 7. Security & compliance hooks (specialists own these)

- **Tenant DB credentials** live in a secrets manager, never in code or the
  registry in plaintext. The app fetches them to open connections.
- **DPDP Act:** per-tenant databases make per-institution data export and erasure
  (right-to-erasure, offboarding deletion) clean to implement — a genuine advantage
  for compliance. A lawyer must define retention periods, consent, breach
  notification, and the Data Processing Agreement signed with each institution.
- **GST billing:** the control-plane billing integrates the payment gateway
  (Razorpay) and must produce GST-compliant invoices — a CA owns the tax correctness.
- **Judge0:** runs untrusted student code centrally; must be isolated (no network,
  resource limits) and ideally on a separate execution tier shared carefully across
  tenants. Code execution carries no tenant data beyond the submitted source, which
  limits the blast radius, but host-level isolation is still essential.

---

## 8. Subscription status replaces licence keys (customer path)

For SaaS, the cryptographic licence-key system is **not used**. Instead:

- Each tenant's **subscription status** lives in the control DB, updated by the
  payment gateway's webhooks (active / past-due / cancelled).
- The tenant-resolution middleware checks this status each request: active →
  proceed; past-due → grace-period behaviour; cancelled/expired → block new actions
  with a renewal prompt (data preserved, never destroyed — same graceful-degradation
  principle as the licence system).
- The licence-key system you already built stays only with your **private
  self-hosted** copy, if you want it there at all.

---

## 9. Phase 1 exit criteria

Phase 1 (this design, implemented) is complete when:
1. The control DB + per-tenant connection manager work; models bind per request.
2. A tenant can be provisioned (its own DB created and initialized) from the
   super-admin console.
3. Two tenants can operate simultaneously with the full feature set, each only
   seeing its own data.
4. The isolation test suite passes.
5. The migration runner can apply a schema change across all tenant DBs.

Only then do Phases 2 (lifecycle polish), 3 (billing), 4 (infra/hardening), and 5
(go-live) proceed.

---

## 10. Open design choices to confirm before build

1. **Tenant identification at login:** subdomain (`cec.evalai.app`), tenant code on
   the login page, or email-domain mapping? (Recommended: subdomain — cleanest, and
   it identifies the tenant before authentication.)
2. **Database hosting:** managed MongoDB Atlas (per-tenant databases within a
   cluster, scaling to dedicated clusters for large tenants) vs self-managed. Atlas
   is recommended to offload backups/HA.
3. **Connection pool limits:** max concurrent tenant connections to hold open, and
   idle TTL — tuned to expected concurrent-tenant count.
4. **Backups:** per-tenant backup/restore cadence and retention (ties to DPDP).

These don't block writing the design but should be settled before implementation.

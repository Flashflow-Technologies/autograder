# EvalAI → SaaS: Detailed Plan of Action

> **Purpose.** This document is a planning and requirements artifact for converting
> EvalAI from a single-tenant, self-hosted application into a multi-tenant SaaS
> product that retains all features built to date. It is written to be handed to
> advisors (a lawyer for DPDP/data law, a chartered accountant for GST/billing,
> and any developers you engage). **No code is being changed by this document.**

> **Honesty note up front.** This is the largest undertaking in the project's
> history — effectively building a second product around the first. The effort is
> measured in **quarters, not weeks**, and SaaS brings a **permanent operational
> and legal commitment** (you run everyone's infrastructure and hold their
> students' data). Read Section 1 (the strategic decision) before committing.

---

## 1. The strategic decision (decide this first)

Converting to SaaS is not only technical — it is a business pivot, because your
current differentiator is *self-hosted, data-stays-on-campus*. Resolve these
before building:

1. **Does your market want SaaS?** Many Indian institutions prefer on-premise for
   data-sovereignty reasons. Validate demand with real prospects first.
2. **Replace self-hosted, or run both?** Recommended: **run both.** Keep the
   self-hosted licence model you already built for institutions that want it, and
   offer SaaS as a hosted tier. You build multi-tenancy once but keep your
   data-sovereignty story. (This plan assumes "both," and notes where it differs
   from "replace.")
3. **Can you fund the runway?** Cloud + ops + security costs are ongoing and
   precede subscription revenue. Budget for months of cost before break-even.
4. **Are you prepared for the liability?** In SaaS you become the custodian of
   many institutions' student personal data, with DPDP Act obligations and breach
   liability. This is the biggest change to your risk profile.

> **Go/No-Go gate:** Do not start Phase 1 until 1–4 are answered and you have at
> least an initial consultation with a data-protection lawyer.

---

## 2. What changes architecturally (the core challenge)

The dominant theme of the entire conversion is **tenant isolation**.

- **Today:** one deployment = one institution. Isolation is physical (separate
  servers). "Faculty sees only their exams" is a *filter*, not a security boundary.
- **SaaS:** one deployment serves many institutions. Isolation must be enforced
  *in software, on every single database query.* A single missed scope = one
  college seeing another college's students' marks = a catastrophic breach.

This is why the conversion touches essentially every model and every controller,
and why the isolation test suite (Section 5, Phase 1) is the most important code
in the whole project.

### Tenancy model choice

| Model | Isolation | Ops cost | Recommendation |
|---|---|---|---|
| Shared DB, `tenantId` on every record | Logical (enforced in code) | Low | **Recommended** for your scale |
| Schema/DB per tenant | Stronger | Higher | Only if a large customer demands it |

Recommended: **shared database with a `tenantId` on every document, enforced
centrally** by middleware and base-query helpers that refuse to run unscoped —
never relying on each query remembering to filter.

---

## 3. Requirements breakdown

### 3.1 Multi-tenancy (foundation)
- Add a `Tenant` model (institution: name, plan, status, config, branding).
- Add `tenantId` to **every** existing model: User, Course, Exam, QuestionPaper,
  Scheme, Submission, Score, Appeal, QuestionBank, ModuleNotes, AuditLog, and the
  GridFS buckets (answer scans, question images).
- Central tenant-scoping layer: middleware resolves the current tenant from the
  authenticated user; a query helper enforces `tenantId` on every read/write.
- Convert "super admin" (you, the vendor) vs "tenant admin" (the institution's
  admin) into distinct roles.

### 3.2 Tenant lifecycle
- Self-service sign-up **or** vendor-provisioned onboarding.
- Tenant provisioning: create the isolated space + first tenant-admin + defaults.
- Per-tenant configuration: institution name, logo/branding, departments,
  programme, plan tier.
- Suspend / reactivate / offboard (with data export + deletion on exit).

### 3.3 Billing & subscriptions (India-specific)
- Payment gateway: **Razorpay** (subscriptions, UPI, cards, GST invoicing) — the
  natural India choice; Stripe as alternative if going international.
- Subscription lifecycle: plans (reuse your Essentials/Institution/University/
  Enterprise tiers), recurring billing, **webhooks** (success/failure/renewal),
  proration on upgrade/downgrade, dunning (failed-payment retries), grace period,
  suspension on non-payment.
- **GST-compliant invoicing** (legal requirement — needs a CA).
- The licence-key system you built is **replaced** for SaaS by live
  subscription-status checks; keep the licence system only for the self-hosted tier.
- **Never store raw card data** — delegate entirely to the gateway (PCI scope stays
  with them).

### 3.4 Infrastructure you now operate (permanent)
- Cloud hosting (servers, autoscaling), managed MongoDB (with per-tenant backups),
  managed Redis, the Python AI service, and **Judge0**.
- **Judge0 is the hardest part in multi-tenant cloud:** it runs untrusted student
  code centrally. One tenant's malicious code must never affect another tenant or
  the host. Requires strong sandbox isolation, per-execution resource governance,
  and likely a dedicated, locked-down execution cluster.
- Monitoring, logging, alerting, status page, incident response, backups/restore
  drills, scaling plan.

### 3.5 Security & compliance
- **DPDP Act, 2023:** you become a data fiduciary/processor for student personal
  data. Obligations: lawful basis/consent, retention limits, breach notification,
  right to erasure, a Data Processing Agreement with each institution. **Engage a
  lawyer.**
- Tenant-aware auth, secrets management, cross-tenant audit logging.
- A **cross-tenant penetration test** before go-live — non-negotiable.

### 3.6 Application changes
- Tenant context threaded through every request.
- Per-tenant branding in the UI and on generated documents (papers/schemes).
- Super-admin console (you): manage tenants, plans, usage, billing status.
- Usage metering if any limits are enforced (e.g. student caps per plan).

---

## 4. Phased action plan (sequenced to de-risk)

**Resist a big-bang rewrite.** Each phase has a clear exit criterion.

### Phase 0 — Decision & design *(no code)*
- Resolve the Section 1 strategic questions.
- Lawyer consult (DPDP) + CA consult (GST).
- Write the tenancy design doc (model choice, enforcement strategy, data model).
- **Exit:** signed-off architecture + Go decision.

### Phase 1 — Tenancy foundation & isolation *(highest risk; do first)*
- `Tenant` model; `tenantId` on every model and GridFS bucket.
- Central scoping middleware + query helpers that refuse unscoped access.
- **Exhaustive cross-tenant isolation test suite** (proves College A can never
  reach College B's data through any endpoint).
- **Exit:** isolation suite passes; a security review of the isolation layer is clean.

### Phase 2 — Tenant lifecycle
- Provisioning, onboarding, per-tenant config & branding, super-admin vs
  tenant-admin roles, suspend/reactivate/offboard with data export.
- **Exit:** a tenant can be created, configured, used in isolation, and removed.

### Phase 3 — Billing & subscriptions
- Razorpay integration, plan mapping, subscription lifecycle, webhooks, GST
  invoicing, suspension on non-payment, dunning.
- **Exit:** a full paid sign-up → renew → fail-payment → suspend cycle works in a
  test environment.

### Phase 4 — Cloud infrastructure & hardening
- Production cloud deployment, managed DB/Redis, **Judge0 isolation**, monitoring,
  backups, secrets management.
- Cross-tenant **penetration test**; fix findings.
- **Exit:** pen test clean; backup/restore drill succeeds; monitoring live.

### Phase 5 — Migration & go-live
- Path for existing self-hosted customers (if any) to move in, or running both
  models in parallel.
- Beta with 1–2 friendly institutions before general availability.
- **Exit:** beta tenants live and stable; runbooks and support process in place.

> **Effort:** Phases 1 and 4 are the long poles. Treat the whole program as
> multiple quarters. The operational commitment after go-live is permanent.

---

## 5. The most important tests in the project

The cross-tenant isolation suite (Phase 1) must verify, for **every** resource
type and **every** endpoint, that a user authenticated in Tenant A:
- cannot read, list, modify, or delete any Tenant B record;
- cannot reference a Tenant B id (exam, score, file, user) and have it resolve;
- cannot reach Tenant B data through GridFS file ids, report exports, attainment
  queries, audit logs, or the admin dashboards.

If any single one of these fails, go-live is blocked. This suite is your primary
defence against the one failure mode that could end the business.

---

## 6. Cost & resource picture (for budgeting)

- **One-time build:** the phased program above (engineering).
- **Ongoing (permanent):** cloud compute + managed DB/Redis + Judge0 execution
  cluster + monitoring; support staff time; payment-gateway fees (a % per
  transaction); legal/compliance upkeep.
- **Pre-revenue runway:** infra + ops costs begin before subscriptions cover them.
- **Specialist help to budget for:** a data-protection lawyer (DPDP), a CA (GST),
  and likely a security firm for the pen test.

---

## 7. Key risks & mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Cross-tenant data leak | Catastrophic | Central enforcement + exhaustive isolation suite + pen test |
| Judge0 abuse in shared cloud | High | Isolated execution cluster, resource governance, no network |
| DPDP non-compliance | High (legal) | Lawyer engagement, DPA with tenants, retention/erasure features |
| GST/billing errors | High (legal/financial) | CA engagement, gateway-native GST invoicing |
| Ops burden underestimated | High | Run a small beta first; build runbooks before GA |
| Market prefers self-hosted | Medium (business) | Keep self-hosted tier; offer SaaS alongside |
| Scope creep / big-bang rewrite | Medium | Strict phase gates; isolation before anything user-facing |

---

## 8. What I can build when you're ready (in order)

1. **Tenancy design doc** (detailed technical design for Phase 0→1).
2. **Phase 1 implementation:** `Tenant` model, `tenantId` migration across all
   models, central scoping layer, and the isolation test suite.
3. **Phase 2:** tenant lifecycle & super-admin console.
4. **Phase 3:** Razorpay subscription integration (I can build the integration; GST
   compliance review is yours/your CA's).
5. **Phase 4 support:** deployment config, Judge0 isolation hardening guidance.

I can build the software pieces. I **cannot** provide the legal (DPDP) or tax (GST)
compliance sign-off, or operate your infrastructure — those are yours, with the
specialists noted.

---

## 9. Recommended immediate next steps

1. Answer the Section 1 strategic questions (especially: replace self-hosted, or
   run both?).
2. Book the DPDP lawyer and GST CA consultations.
3. Validate SaaS demand with 2–3 real prospects.
4. When ready, ask me to produce the **Phase 0/1 tenancy design document** — the
   right first build artifact, before any code.

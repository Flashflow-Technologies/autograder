import crypto from 'crypto';
import logger from '../utils/logger.js';

/**
 * Licence enforcement for self-hosted deployments.
 *
 * A licence is a JSON payload signed with the VENDOR's RSA private key (kept
 * only by the vendor; never in this repo). The app verifies it with the
 * embedded public key, so a customer cannot forge a licence or extend its
 * expiry without the private key.
 *
 * Design principles:
 *  - Graceful degradation: an expired/missing licence NEVER destroys data or
 *    locks people out of reading it. It restricts privileged actions (e.g.
 *    creating new exams) and surfaces a clear renewal message.
 *  - Honest about limits: self-hosted software can ultimately be patched. This
 *    is a contractual/compliance speed bump for institutional buyers, not DRM.
 */

// ---- Plan tiers: feature flags + limits per plan ----
// Limits of null mean "unlimited". Flags gate optional capabilities.
export const PLANS = {
  essentials: {
    label: 'Essentials',
    limits: { maxStudents: 1500, maxCoursesActive: 10 },
    features: { programmingQuestions: false, hodDashboard: true, aiGeneration: true },
  },
  institution: {
    label: 'Institution',
    limits: { maxStudents: 5000, maxCoursesActive: 50 },
    features: { programmingQuestions: true, hodDashboard: true, aiGeneration: true },
  },
  university: {
    label: 'University',
    limits: { maxStudents: null, maxCoursesActive: null },
    features: { programmingQuestions: true, hodDashboard: true, aiGeneration: true },
  },
  enterprise: {
    label: 'Enterprise',
    limits: { maxStudents: null, maxCoursesActive: null },
    features: { programmingQuestions: true, hodDashboard: true, aiGeneration: true },
  },
};

// The vendor's PUBLIC key — safe to ship. Override via LICENSE_PUBLIC_KEY env
// (PEM). The matching PRIVATE key stays with the vendor only. The placeholder
// below lets the app boot in "unlicensed/dev" mode until a real key is set.
// Env vars can't hold real newlines easily, so we accept a single-line form
// with literal "\n" sequences and convert them back to real newlines.
const PUBLIC_KEY = (process.env.LICENSE_PUBLIC_KEY || '').replace(/\\n/g, '\n');

// In dev or before a licence is issued, allow running without enforcement so
// the product is usable for evaluation. Set LICENSE_ENFORCE=true in production.
const ENFORCE = String(process.env.LICENSE_ENFORCE || 'false') === 'true';

let cached = null; // { status, plan, institution, expiresAt, features, limits, daysLeft }

/**
 * Verify a licence string of the form  base64(payloadJSON).base64(signature).
 * Returns the parsed payload if the signature is valid, else throws.
 */
function verifyToken(token) {
  if (!PUBLIC_KEY) throw new Error('No licence public key configured');
  const [payloadB64, sigB64] = String(token).split('.');
  if (!payloadB64 || !sigB64) throw new Error('Malformed licence');
  const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(payloadJson);
  verifier.end();
  const ok = verifier.verify(PUBLIC_KEY, Buffer.from(sigB64, 'base64url'));
  if (!ok) throw new Error('Invalid licence signature');
  return JSON.parse(payloadJson);
}

/**
 * Evaluate a licence token into a status object. Pure (no I/O) so it can be
 * unit-tested. status is one of: active, expired, invalid, unlicensed.
 */
export function evaluateLicence(token, now = Date.now()) {
  if (!token) {
    return ENFORCE
      ? { status: 'unlicensed', message: 'No licence installed.', plan: null }
      : { status: 'active', plan: 'university', institution: 'Development (unenforced)', expiresAt: null, dev: true };
  }
  let payload;
  try {
    payload = verifyToken(token);
  } catch (e) {
    return { status: 'invalid', message: e.message, plan: null };
  }
  const planKey = String(payload.plan || '').toLowerCase();
  const plan = PLANS[planKey];
  if (!plan) return { status: 'invalid', message: `Unknown plan: ${payload.plan}`, plan: null };

  const expiresAt = payload.expiresAt ? new Date(payload.expiresAt).getTime() : null;
  const expired = expiresAt != null && now > expiresAt;
  const daysLeft = expiresAt != null ? Math.ceil((expiresAt - now) / 86400000) : null;

  return {
    status: expired ? 'expired' : 'active',
    plan: planKey,
    planLabel: plan.label,
    institution: payload.institution || 'Unknown',
    issuedAt: payload.issuedAt || null,
    expiresAt: payload.expiresAt || null,
    daysLeft,
    features: plan.features,
    limits: plan.limits,
    message: expired ? 'Licence has expired. Please renew.' : undefined,
  };
}

/** Load + cache the active licence from env (LICENSE_KEY). */
export function loadLicence() {
  cached = evaluateLicence(process.env.LICENSE_KEY || '');
  const { status, institution, planLabel, daysLeft } = cached;
  if (status === 'active') {
    logger.info('Licence active', { institution, plan: planLabel, daysLeft });
  } else {
    logger.warn('Licence not active', { status, message: cached.message });
  }
  return cached;
}

/** Re-evaluate a freshly-pasted licence token and cache it (admin renewal). */
export function applyLicence(token) {
  const result = evaluateLicence(token);
  if (result.status === 'active') cached = result;
  return result;
}

export function getLicence() {
  if (!cached) loadLicence();
  return cached;
}

/** Is enforcement on? (false in dev) */
export function isEnforced() { return ENFORCE; }

/** Does the current licence permit a given feature flag? */
export function hasFeature(flag) {
  const lic = getLicence();
  if (!ENFORCE) return true; // dev: everything on
  if (lic.status !== 'active') return false;
  return !!lic.features?.[flag];
}

/** Is the licence currently in good standing (active)? */
export function isActive() {
  const lic = getLicence();
  if (!ENFORCE) return true;
  return lic.status === 'active';
}

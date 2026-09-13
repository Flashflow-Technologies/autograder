import { getLicence, isEnforced } from './licenseService.js';
import logger from '../utils/logger.js';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Current installed version, read from package.json at startup.
let CURRENT_VERSION = '0.0.0';
try {
  const pkg = JSON.parse(readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
  CURRENT_VERSION = pkg.version || '0.0.0';
} catch { /* keep default */ }

// The vendor's update server (you run this). It is the authority on what the
// latest version is and whether this licence is entitled to it. Configurable so
// you can point it at your own infrastructure.
const UPDATE_SERVER_URL = process.env.UPDATE_SERVER_URL || '';

/**
 * Whether this installation is ENTITLED to updates. Updates are a renewal
 * benefit: only an active (paid, unexpired) licence may fetch or apply them.
 * In dev (enforcement off) updates are always allowed.
 */
export function isUpdateEntitled() {
  if (!isEnforced()) return true;
  const lic = getLicence();
  return lic.status === 'active';
}

export function getCurrentVersion() { return CURRENT_VERSION; }

/**
 * Check the vendor update server for a newer release. The licence is sent so
 * the SERVER can also verify entitlement (defence in depth — never trust only
 * the client). If the local licence isn't active, we don't even make the call.
 *
 * Returns one of:
 *   { entitled:false, reason }                      -> lapsed/expired: no updates
 *   { entitled:true, upToDate:true, current }        -> already latest
 *   { entitled:true, upToDate:false, latest, notes } -> update available
 *   { entitled:true, error }                         -> couldn't reach server
 */
export async function checkForUpdates() {
  if (!isUpdateEntitled()) {
    return {
      entitled: false,
      current: CURRENT_VERSION,
      reason: 'Updates require an active EvalAI licence. Please renew to receive the latest version and security patches.',
    };
  }
  if (!UPDATE_SERVER_URL) {
    // No update server configured yet — report current version only.
    return { entitled: true, current: CURRENT_VERSION, upToDate: true, note: 'No update server configured.' };
  }

  const lic = getLicence();
  try {
    const res = await fetch(`${UPDATE_SERVER_URL.replace(/\/$/, '')}/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentVersion: CURRENT_VERSION,
        licenseKey: process.env.LICENSE_KEY || '',
        institution: lic.institution,
        plan: lic.plan,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      // 402/403 from the vendor server means "not entitled" (e.g. server-side
      // licence check failed even though local said active).
      if (res.status === 402 || res.status === 403) {
        return { entitled: false, current: CURRENT_VERSION, reason: 'Your licence is not entitled to updates. Please contact your provider.' };
      }
      return { entitled: true, current: CURRENT_VERSION, error: `Update server returned ${res.status}` };
    }
    const data = await res.json();
    const latest = data.latestVersion;
    const upToDate = !latest || compareVersions(latest, CURRENT_VERSION) <= 0;
    return {
      entitled: true,
      current: CURRENT_VERSION,
      upToDate,
      latest: latest || CURRENT_VERSION,
      notes: data.releaseNotes || null,
      downloadUrl: upToDate ? null : (data.downloadUrl || null),
    };
  } catch (e) {
    logger.warn('Update check failed', { error: e.message });
    return { entitled: true, current: CURRENT_VERSION, error: 'Could not reach the update server.' };
  }
}

/** Compare semver-ish strings. Returns >0 if a>b, <0 if a<b, 0 if equal. */
export function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

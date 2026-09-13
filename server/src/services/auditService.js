import crypto from 'crypto';
import { AuditLog } from '../models/index.js';
import logger from '../utils/logger.js';

/**
 * Append-only, TAMPER-EVIDENT audit log (#7).
 *
 * Each entry is hash-chained to the previous one:
 *   hash = SHA256( canonicalContent + prevHash )
 * Altering or deleting any past entry breaks the chain, which verifyAuditChain()
 * detects. This makes tampering *detectable* (the accountability goal for
 * high-stakes grading), though it does not make the log physically un-editable.
 */

function canonical(entry) {
  return JSON.stringify({
    actorId: String(entry.actorId),
    actorRole: entry.actorRole || '',
    action: entry.action,
    targetType: entry.targetType || '',
    targetId: entry.targetId ? String(entry.targetId) : '',
    before: entry.before ?? null,
    after: entry.after ?? null,
    reason: entry.reason || '',
    timestamp: new Date(entry.timestamp).toISOString(),
    seq: entry.seq,
    prevHash: entry.prevHash || '',
  });
}

function computeHash(entry) {
  return crypto.createHash('sha256').update(canonical(entry)).digest('hex');
}

export async function recordAudit({ actor, action, targetType, targetId, before, after, reason }) {
  try {
    const last = await AuditLog.findOne({}).sort({ seq: -1 }).lean();
    const seq = last ? (last.seq || 0) + 1 : 1;
    const prevHash = last?.hash || 'GENESIS';

    const base = {
      actorId: actor.id, actorRole: actor.role, action, targetType, targetId,
      before, after, reason, timestamp: new Date(), seq, prevHash,
    };
    base.hash = computeHash(base);

    await AuditLog.create(base);
    logger.info('Audit recorded', { action, targetType, targetId, actorId: actor.id, seq });
  } catch (err) {
    logger.error('Failed to record audit entry', { action, error: err.message });
  }
}

/**
 * Verify the integrity of the audit chain.
 * @returns {{ok:boolean, checked:number, total:number, brokenAt?:number}}
 */
export async function verifyAuditChain() {
  const entries = await AuditLog.find({}).sort({ seq: 1 }).lean();
  let prevHash = 'GENESIS';
  let checked = 0;
  for (const e of entries) {
    const recomputed = computeHash({
      actorId: e.actorId, actorRole: e.actorRole, action: e.action,
      targetType: e.targetType, targetId: e.targetId, before: e.before,
      after: e.after, reason: e.reason, timestamp: e.timestamp, seq: e.seq,
      prevHash,
    });
    if (e.prevHash !== prevHash || e.hash !== recomputed) {
      return { ok: false, checked, brokenAt: e.seq, total: entries.length };
    }
    prevHash = e.hash;
    checked += 1;
  }
  return { ok: true, checked, total: entries.length };
}

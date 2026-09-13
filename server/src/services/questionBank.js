import QuestionBank from '../models/QuestionBank.js';

const normalize = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Given generated OR pairs for a course, record any new questions in the bank
 * and report which option texts were already seen before (repeats). Both option
 * sides of every pair are considered.
 *
 * Returns { pairs (annotated with optionA.isNew/optionB.isNew), newCount, repeatCount }.
 */
export async function recordAndAnnotate(courseId, pairs) {
  if (!Array.isArray(pairs) || !pairs.length) return { pairs: pairs || [], newCount: 0, repeatCount: 0 };

  // Pull existing normalized texts for this course up front (one query).
  const existing = await QuestionBank.find({ courseId }).select('normalizedText').lean();
  const seen = new Set(existing.map((e) => e.normalizedText));

  let newCount = 0;
  let repeatCount = 0;
  const toInsert = [];
  const toBump = [];

  const mark = (opt, co, rbtl) => {
    const norm = normalize(opt.text);
    if (!norm) { opt.isNew = false; return; }
    if (seen.has(norm)) {
      opt.isNew = false;
      repeatCount += 1;
      toBump.push(norm);
    } else {
      opt.isNew = true;
      newCount += 1;
      seen.add(norm); // avoid double-insert within this same batch
      toInsert.push({
        courseId, co, rbtl, text: opt.text, normalizedText: norm,
        sourceConcept: opt.sourceConcept, usedCount: 1, lastUsedAt: new Date(),
      });
    }
  };

  for (const p of pairs) {
    if (p.optionA) mark(p.optionA, p.co, p.rbtl);
    if (p.optionB) mark(p.optionB, p.co, p.rbtl);
  }

  // Persist: insert new questions, bump reuse counters on repeats.
  if (toInsert.length) {
    try { await QuestionBank.insertMany(toInsert, { ordered: false }); }
    catch { /* ignore duplicate-key races; another request may have inserted */ }
  }
  if (toBump.length) {
    await QuestionBank.updateMany(
      { courseId, normalizedText: { $in: toBump } },
      { $inc: { usedCount: 1 }, $set: { lastUsedAt: new Date() } }
    );
  }

  return { pairs, newCount, repeatCount };
}

/**
 * Fetch previously-banked questions for a course that can be reused as fallback
 * fillers, least-recently-used first, optionally filtered by CO/RBTL.
 */
export async function fetchBanked(courseId, { co, rbtl, limit = 20 } = {}) {
  const q = { courseId };
  if (co) q.co = co;
  if (rbtl) q.rbtl = rbtl;
  return QuestionBank.find(q).sort({ usedCount: 1, lastUsedAt: 1 }).limit(limit).lean();
}

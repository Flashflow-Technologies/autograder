/**
 * Validates a question paper against the active exam-type marks scheme and the
 * VTU module structure. Returns an array of human-readable error strings (empty
 * = valid). Layered ON TOP of:
 *   - CO-ceiling enforcement (utils/bloom, checked in the controller), and
 *   - OR-equivalence (QuestionPaper pre-save hook), which already requires both
 *     sides of a pair to share an identical CO·RBTL·marks breakdown.
 *
 * What THIS validates:
 *   - flexible scheme  -> no marks/module rules (return []).
 *   - equal_per_module -> N modules, each an OR pair, each side summing to the
 *                         equal per-module marks.
 *   - per_co           -> one module per slot, in order; each module's CO and
 *                         marks match the slot; per-CO totals match exactly.
 *   - per-module sub-question sums equal the module's allotted marks.
 *   - strict module->CO mapping (if enabled on the course).
 */
import { expectedModules, perCoTotals } from './examScheme.js';

// Sum of a single question's sub-question marks.
function questionMarks(q) {
  return (q.subQuestions || []).reduce((s, sq) => s + (Number(sq.marks) || 0), 0);
}

// Distinct COs used within one question.
function questionCos(q) {
  return [...new Set((q.subQuestions || []).map((sq) => sq.co))];
}

export function validatePaperScheme(groups, scheme, course) {
  const errors = [];
  if (!scheme || scheme.kind === 'flexible') return errors; // nothing to enforce

  const expected = expectedModules(scheme);
  if (!expected) return errors;

  // 1) Every group must carry a module number (1-5, faculty's choice) and no two
  //    groups may share the same module. The SPECIFIC module numbers are up to
  //    the faculty; the scheme's marks/CO discipline is enforced by slot below,
  //    NOT by pinning requirements to fixed module numbers.
  const byModule = {};
  groups.forEach((g, gi) => {
    const q = g.questions[0];
    const mod = q.moduleNo;
    if (!mod) {
      errors.push(`Group ${gi + 1}: no module number assigned (pick a module 1-5 for this question).`);
      return;
    }
    if (mod < 1 || mod > 5) errors.push(`Group ${gi + 1}: module ${mod} is out of range (must be 1-5).`);
    if (byModule[mod]) errors.push(`Module ${mod}: more than one question group assigned to it (each module may be used once).`);
    byModule[mod] = g;
  });

  // 2) The paper must contain exactly the scheme's slots (by count), each with the
  //    right marks and (for per_co) the right CO — but those slots may sit on ANY
  //    module numbers the faculty chose. We greedily match each expected slot to
  //    an as-yet-unmatched group with the same marks (and CO, for per_co).
  const unmatched = [...groups];
  const takeMatch = (predicate) => {
    const idx = unmatched.findIndex(predicate);
    if (idx === -1) return null;
    return unmatched.splice(idx, 1)[0];
  };

  for (const em of expected) {
    // A group matches this slot if BOTH its sides sum to the slot marks and,
    // when the slot pins a CO, every side uses only that CO.
    const g = takeMatch((grp) => {
      const marksOk = grp.questions.every((q) => questionMarks(q) === em.marks);
      const coOk = !em.co || grp.questions.every((q) => questionCos(q).every((c) => c === em.co));
      return marksOk && coOk;
    });
    if (!g) {
      errors.push(
        em.co
          ? `Missing a question worth ${em.marks} marks assessing ${em.co} (any module).`
          : `Missing a question worth ${em.marks} marks (any module).`
      );
    }
  }
  // Any groups left over are beyond what the scheme allows.
  unmatched.forEach((grp) => {
    const q = grp.questions[0];
    errors.push(`Q${q.questionNo} (module ${q.moduleNo || '?'}, ${questionMarks(q)} marks) does not match any required slot for this exam type.`);
  });

  // 3) For per_co schemes, the whole-paper per-CO totals must still match exactly.
  if (scheme.kind === 'per_co') {
    const want = {};
    (scheme.slots || []).forEach((s) => { want[s.co] = (want[s.co] || 0) + s.marks; });
    const got = perCoTotals(groups);
    const cos = new Set([...Object.keys(want), ...Object.keys(got)]);
    for (const co of cos) {
      const w = want[co] || 0;
      const gg = got[co] || 0;
      if (w !== gg) errors.push(`${co} carries ${gg} marks but this exam type requires exactly ${w}.`);
    }
  }

  // 4) Strict module->CO mapping (course-level toggle), if enabled. This still
  //    applies to whichever modules the faculty used.
  if (course && course.enforceModuleCoMapping && Array.isArray(course.moduleCoMap)) {
    const allowed = {};
    course.moduleCoMap.forEach((m) => { allowed[m.moduleNo] = new Set(m.cos || []); });
    for (const [modStr, g] of Object.entries(byModule)) {
      const mod = Number(modStr);
      const allow = allowed[mod];
      if (!allow || allow.size === 0) continue; // no mapping defined for this module
      g.questions.forEach((q) => {
        questionCos(q).forEach((c) => {
          if (!allow.has(c)) errors.push(`Module ${mod} (Q${q.questionNo}) uses ${c}, which is not in this module's allowed COs (${[...allow].join(', ')}).`);
        });
      });
    }
  }

  return errors;
}

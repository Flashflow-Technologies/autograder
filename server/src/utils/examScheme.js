/**
 * Per-exam-type marks schemes (VTU-style module-structured papers).
 *
 * Two scheme kinds:
 *   - 'equal_per_module' (SEE): every module's question carries the same marks;
 *      module count and total are configurable; per-module marks = total / count.
 *   - 'per_co' (CIE-1, CIE-2): a fixed set of CO slots, each with a marks value.
 *      Each slot becomes one module (an OR pair). The per-CO totals across the
 *      paper must match exactly.
 *
 * These are DEFAULTS. They are stored on the Course (examSchemes) so an admin
 * can override per course/department. A scheme of kind 'flexible' imposes no
 * marks-distribution rule (only the CO-ceiling and OR-equivalence rules apply).
 */

export const SCHEME_KINDS = ['equal_per_module', 'per_co', 'flexible'];

// Factory: the built-in defaults the user specified.
export function defaultExamSchemes() {
  return [
    {
      examType: 'SEE',
      kind: 'equal_per_module',
      moduleCount: 5,      // configurable
      totalMarks: 100,     // configurable; perModule = totalMarks / moduleCount
    },
    {
      examType: 'CIE 1',
      kind: 'per_co',
      // Each slot is one module (OR pair). Order = module order in the paper.
      slots: [
        { co: 'CO1', marks: 10 },
        { co: 'CO2', marks: 10 },
        { co: 'CO3', marks: 5 },
      ],
    },
    {
      examType: 'CIE 2',
      kind: 'per_co',
      slots: [
        { co: 'CO3', marks: 5 },
        { co: 'CO4', marks: 10 },
        { co: 'CO5', marks: 10 },
      ],
    },
    // CIE 3, Model, Supplementary default to flexible unless the admin sets one.
    { examType: 'CIE 3', kind: 'flexible' },
    { examType: 'Model', kind: 'flexible' },
    { examType: 'Supplementary', kind: 'flexible' },
  ];
}

/** Look up the active scheme for an exam type from a course's stored schemes. */
export function schemeForExamType(course, examType) {
  const list = (course && course.examSchemes && course.examSchemes.length)
    ? course.examSchemes
    : defaultExamSchemes();
  return list.find((s) => s.examType === examType) || { examType, kind: 'flexible' };
}

/**
 * Given a scheme, return the ordered list of modules the paper must contain:
 *   [{ moduleNo, co|null, marks }]
 * For 'equal_per_module' the co is null (any CO allowed unless strict mapping
 * says otherwise); for 'per_co' the co is fixed by the slot.
 * For 'flexible' returns null (no module structure enforced).
 */
export function expectedModules(scheme) {
  if (!scheme) return null;
  if (scheme.kind === 'equal_per_module') {
    const count = scheme.moduleCount || 5;
    const total = scheme.totalMarks || 100;
    const per = total / count;
    return Array.from({ length: count }, (_, i) => ({ moduleNo: i + 1, co: null, marks: per }));
  }
  if (scheme.kind === 'per_co') {
    return (scheme.slots || []).map((s, i) => ({ moduleNo: i + 1, co: s.co, marks: s.marks }));
  }
  return null; // flexible
}

/**
 * Aggregate marks per CO across an entire paper, counting each OR pair ONCE
 * (both sides are equivalent, so we read side A). Solo groups count their one
 * question. Returns { CO1: n, CO2: n, ... }.
 */
export function perCoTotals(groups) {
  const totals = {};
  for (const g of (groups || [])) {
    const q = g.questions[0]; // OR sides are equivalent; solo has one
    for (const sq of (q.subQuestions || [])) {
      totals[sq.co] = (totals[sq.co] || 0) + sq.marks;
    }
  }
  return totals;
}

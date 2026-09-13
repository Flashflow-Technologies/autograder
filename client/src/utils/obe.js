// Mirrors the server's OR equivalence rule so faculty get instant feedback.
export function coRbtlMap(question) {
  const m = {};
  for (const sq of question.subQuestions) {
    if (!sq.co || !sq.rbtl || !sq.marks) continue;
    const k = `${sq.co}·${sq.rbtl}`;
    m[k] = (m[k] || 0) + Number(sq.marks);
  }
  return m;
}

export function checkOrEquivalence(group) {
  if (group.groupType !== 'or_pair' || group.questions.length < 2) return { ok: true, errors: [] };
  const [a, b] = group.questions;
  const ma = coRbtlMap(a), mb = coRbtlMap(b);
  const keys = new Set([...Object.keys(ma), ...Object.keys(mb)]);
  const errors = [];
  for (const k of keys) {
    const av = ma[k] || 0, bv = mb[k] || 0;
    if (av !== bv) errors.push(`${k}: Q${a.questionNo}=${av}m vs Q${b.questionNo}=${bv}m`);
  }
  return { ok: errors.length === 0, errors, mapA: ma, mapB: mb };
}

export function questionTotal(q) {
  return q.subQuestions.reduce((s, sq) => s + (Number(sq.marks) || 0), 0);
}

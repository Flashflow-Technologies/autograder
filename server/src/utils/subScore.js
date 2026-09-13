/**
 * Reliably determine whether a sub-score is a programming (code) question.
 *
 * IMPORTANT: The Score sub-schema defines `programming` as a nested object, so
 * Mongoose auto-initialises it to `{}` even for descriptive answers — and `{}`
 * is truthy. A naive `if (sub.programming)` therefore wrongly treats every
 * descriptive answer as a programming one. Always use this helper, which tests a
 * real marker (language or executed test results).
 */
export function isProgrammingSub(sub) {
  const p = sub && sub.programming;
  if (!p) return false;
  return !!(p.language || (Array.isArray(p.testResults) && p.testResults.length > 0));
}

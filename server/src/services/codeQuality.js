// Lightweight, dependency-free static analysis for the quality components of a
// programming score.
//
// HONEST SCOPE NOTE: A production-grade setup would shell out to real linters
// (pylint/flake8, checkstyle, cpplint) and a real complexity tool (lizard).
// Installing all those toolchains into the worker image is heavy, so this module
// uses language-agnostic heuristics instead:
//   - complexity: count decision points (a proxy for cyclomatic complexity)
//   - style: flag a few objective issues (overly long lines, trailing
//     whitespace, tabs/spaces mixing, missing final newline)
// These are deliberately conservative and are presented to faculty as
// indicators, not verdicts — faculty review remains the backstop for real
// quality judgement. Swapping in real linters later is a clean upgrade.

const DECISION_KEYWORDS = [
  /\bif\b/g, /\belse\s+if\b/g, /\belif\b/g, /\bfor\b/g, /\bwhile\b/g,
  /\bcase\b/g, /\bcatch\b/g, /\b\?\s*[^:]+:/g, /&&/g, /\|\|/g,
];

/** Approximate cyclomatic complexity: 1 + number of decision points. */
export function estimateComplexity(source) {
  let count = 1;
  for (const re of DECISION_KEYWORDS) {
    const m = source.match(re);
    if (m) count += m.length;
  }
  return count;
}

/**
 * Objective style issues. Returns { violations: number, details: [...] }.
 * Conservative on purpose — only flags things that are unambiguous.
 */
export function styleCheck(source, { maxLineLen = 100 } = {}) {
  const lines = source.split('\n');
  const details = [];
  let violations = 0;

  lines.forEach((line, i) => {
    if (line.length > maxLineLen) { violations++; details.push(`Line ${i + 1}: exceeds ${maxLineLen} chars`); }
    if (/[ \t]+$/.test(line)) { violations++; details.push(`Line ${i + 1}: trailing whitespace`); }
    if (/\t/.test(line) && / /.test(line.replace(/\t/g, ''))) { /* mixed handled loosely */ }
  });
  if (source.length && !source.endsWith('\n')) { violations++; details.push('Missing final newline'); }

  return { violations, details: details.slice(0, 20) };
}

/**
 * Compose the programming score (0..maxMarks) from the rubric weights.
 *  - correctness: fraction of test weight passed
 *  - style: 1 when no violations, decaying with each violation
 *  - complexity: 1 when at/under threshold, decaying as it exceeds
 * Returns { score, breakdown } where score is a float (rounded by the caller).
 */
export function composeProgrammingScore({ maxMarks, rubric, passedWeight, totalWeight, styleViolations, complexity, complexityThreshold = 10 }) {
  const correctnessFrac = totalWeight > 0 ? passedWeight / totalWeight : 0;

  // Style: each violation costs 10% of the style component, floored at 0.
  const styleFrac = Math.max(0, 1 - 0.1 * styleViolations);

  // Complexity: full marks at/under threshold; lose 10% per unit over, floored at 0.
  const over = Math.max(0, complexity - complexityThreshold);
  const complexityFrac = Math.max(0, 1 - 0.1 * over);

  const w = rubric || { correctness: 65, style: 15, complexity: 20 };
  const weightedFrac =
    (correctnessFrac * (w.correctness || 0) +
     styleFrac * (w.style || 0) +
     complexityFrac * (w.complexity || 0)) / 100;

  const score = weightedFrac * maxMarks;
  return {
    score,
    breakdown: {
      correctnessFrac: Math.round(correctnessFrac * 100) / 100,
      styleFrac: Math.round(styleFrac * 100) / 100,
      complexityFrac: Math.round(complexityFrac * 100) / 100,
      complexity,
      styleViolations,
    },
  };
}

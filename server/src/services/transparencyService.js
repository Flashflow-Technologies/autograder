/**
 * Transparency helpers — turn a raw subscore into student-explainable detail.
 *
 * Powers (from the TAR-AI analysis):
 *   #1 per-answer score-contribution breakdown
 *   #2 missing-concept feedback
 *   #3 natural-language feedback (rule-based, no LLM)
 *   #5 confidence indicator
 *
 * Pure functions over data the scorer already stores (components 0-1, confidence
 * 0-1, found/missing keywords). No new ML, no I/O — safe to unit-test.
 */

/** Map a 0-1 confidence into an honest, plain band + label. */
export function confidenceBand(confidence) {
  if (confidence == null) return { level: 'unknown', label: 'Not available', pct: null };
  const pct = Math.round(confidence * 100);
  if (confidence >= 0.85) return { level: 'high', label: 'High confidence', pct };
  if (confidence >= 0.6) return { level: 'medium', label: 'Moderate confidence', pct };
  return { level: 'low', label: 'Low confidence — reviewed by faculty', pct };
}

/**
 * Build the per-answer contribution breakdown (#1). Components are 0-1; we show
 * each as a percentage and label what it measured, in plain language.
 */
export function contributionBreakdown(components = {}) {
  const c = components || {};
  const pct = (v) => (v == null ? null : Math.round(v * 100));
  return [
    { key: 'semantic', label: 'Meaning match (vs. model answer)', value: pct(c.cosine) },
    { key: 'keywords', label: 'Key concepts covered', value: pct(c.keywords) },
    { key: 'structure', label: 'Structure & coherence', value: pct(c.style) },
    { key: 'grammar', label: 'Grammar & clarity', value: pct(c.grammar) },
  ].filter((x) => x.value != null);
}

/** Concept coverage (#2): how many key concepts were found vs missing. */
export function conceptCoverage(foundKeywords = [], missingKeywords = []) {
  const found = foundKeywords || [];
  const missing = missingKeywords || [];
  const total = found.length + missing.length;
  return {
    found,
    missing,
    covered: found.length,
    total,
    coveragePct: total ? Math.round((found.length / total) * 100) : null,
  };
}

/**
 * Rule-based natural-language feedback (#3): strengths / weaknesses / suggestions
 * derived from the component scores and concept coverage. No LLM — deterministic
 * templates, so it's consistent and explainable.
 */
export function naturalLanguageFeedback({ components = {}, foundKeywords = [], missingKeywords = [] }) {
  const c = components || {};
  const strengths = [];
  const weaknesses = [];
  const suggestions = [];

  const HIGH = 0.75;
  const LOW = 0.5;

  if (c.cosine != null) {
    if (c.cosine >= HIGH) strengths.push('Your answer closely matches the expected meaning.');
    else if (c.cosine < LOW) {
      weaknesses.push('Your answer differs notably from the expected explanation.');
      suggestions.push('Re-read the question and address the core idea more directly.');
    }
  }

  const cov = conceptCoverage(foundKeywords, missingKeywords);
  if (cov.total) {
    if (cov.coveragePct >= 80) strengths.push(`You covered ${cov.covered} of ${cov.total} key concepts.`);
    else {
      weaknesses.push(`You covered ${cov.covered} of ${cov.total} key concepts.`);
      if (cov.missing.length) {
        const show = cov.missing.slice(0, 5).join(', ');
        suggestions.push(`Consider including: ${show}${cov.missing.length > 5 ? ', …' : ''}.`);
      }
    }
  }

  if (c.style != null && c.style < LOW) {
    weaknesses.push('The answer could be better organised.');
    suggestions.push('Structure your answer into clear points or steps.');
  } else if (c.style != null && c.style >= HIGH) {
    strengths.push('Your answer is well structured.');
  }

  if (c.grammar != null && c.grammar < LOW) {
    suggestions.push('Check grammar and sentence clarity.');
  }

  return { strengths, weaknesses, suggestions };
}

/** Compose the full student-facing transparency view for one subscore. */
export function studentTransparency(sub) {
  return {
    breakdown: contributionBreakdown(sub.components),
    coverage: conceptCoverage(sub.foundKeywords, sub.missingKeywords),
    confidence: confidenceBand(sub.confidence),
    feedback: naturalLanguageFeedback({
      components: sub.components,
      foundKeywords: sub.foundKeywords,
      missingKeywords: sub.missingKeywords,
    }),
  };
}

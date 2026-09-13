/**
 * Bloom's Revised Taxonomy (RBTL) utilities.
 *
 * Two jobs:
 *  1. Map an action verb to its Bloom's level (L1..L6).
 *  2. Derive a Course Outcome's "ceiling" level from its statement — the
 *     highest Bloom's level any verb in the statement implies. Questions on
 *     that CO may be set at or below this ceiling, never above it.
 *
 * This is deliberately rule-based (a fixed verb table), not AI-inferred, so the
 * ceiling is deterministic and auditable. Where a CO statement is ambiguous or
 * has no recognisable verb, derivation returns null and the UI asks the faculty
 * to set the level explicitly.
 */

export const RBTL_LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'];

// Numeric rank for easy comparison (L1=1 .. L6=6).
export const rbtlRank = (lvl) => RBTL_LEVELS.indexOf(lvl) + 1; // 0 if invalid

/**
 * Standard action-verb sets per Bloom's level. Verbs are stored as lemmas;
 * matching is done on word stems so "analyses", "analyzing", "analyzed" all hit
 * "analyze". Lists are intentionally broad but conservative — only verbs whose
 * level is widely agreed upon. "Understand" is intentionally excluded because it
 * is not a measurable Bloom's verb (OBE guidance discourages it); statements
 * using only "understand" will return null and prompt manual selection.
 */
export const BLOOM_VERBS = {
  L1: ['define', 'list', 'state', 'name', 'recall', 'recognize', 'identify', 'label',
       'match', 'select', 'memorize', 'repeat', 'reproduce', 'recite', 'record', 'quote',
       'cite', 'enumerate', 'tabulate', 'mention'],
  L2: ['explain', 'describe', 'summarize', 'interpret', 'classify', 'discuss', 'illustrate',
       'paraphrase', 'restate', 'translate', 'distinguish', 'estimate', 'predict', 'infer',
       'generalize', 'exemplify', 'convert', 'outline', 'report', 'review', 'express'],
  L3: ['apply', 'solve', 'demonstrate', 'compute', 'calculate', 'use', 'implement', 'execute',
       'operate', 'employ', 'construct', 'sketch', 'draw', 'show', 'complete', 'modify',
       'practice', 'schedule', 'dramatize', 'manipulate', 'prepare'],
  L4: ['analyze', 'compare', 'contrast', 'differentiate', 'distinguish', 'examine',
       'categorize', 'investigate', 'deconstruct', 'attribute', 'organize', 'correlate',
       'inspect', 'dissect', 'separate', 'subdivide', 'breakdown', 'relate'],
  L5: ['evaluate', 'justify', 'critique', 'assess', 'judge', 'defend', 'argue', 'appraise',
       'recommend', 'rate', 'prioritize', 'validate', 'verify', 'measure', 'conclude',
       'support', 'weigh', 'rank', 'test', 'monitor'],
  L6: ['create', 'design', 'develop', 'formulate', 'compose', 'construct', 'devise', 'invent',
       'propose', 'plan', 'produce', 'generate', 'build', 'synthesize', 'integrate',
       'reorganize', 'derive', 'hypothesize', 'originate', 'assemble', 'theorize'],
};

// Build a flat verb -> level lookup. If a verb appears in multiple levels
// (e.g. "construct" in L3 and L6), the HIGHER level wins, since the ceiling is
// about the most demanding cognitive act the statement could require.
const VERB_TO_LEVEL = (() => {
  const map = {};
  for (const lvl of RBTL_LEVELS) {
    for (const verb of (BLOOM_VERBS[lvl] || [])) {
      if (!map[verb] || rbtlRank(lvl) > rbtlRank(map[verb])) map[verb] = lvl;
    }
  }
  return map;
})();

/**
 * Light stemmer: lowercases and strips common verb suffixes so inflected forms
 * match the base verb in the table. Not linguistically perfect, but sufficient
 * for matching exam-statement verbs without an NLP dependency.
 */
function stem(word) {
  let w = String(word).toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 4) return w;
  if (w.endsWith('ing')) {
    let base = w.slice(0, -3);
    // "designing"->"design"; handle doubled consonant "planning"->"plan"
    if (base.length >= 3 && base[base.length - 1] === base[base.length - 2]) base = base.slice(0, -1);
    return base;
  }
  if (w.endsWith('es')) return w.slice(0, -2); // "analyses"->"analys" (table uses "analyze"; see normaliser below)
  if (w.endsWith('ed')) {
    const base = w.slice(0, -2);
    return base;
  }
  if (w.endsWith('s')) return w.slice(0, -1);
  return w;
}

// Some verbs have spelling variants (analyse/analyze). Normalise to the table form.
const VARIANTS = { analyse: 'analyze', analyses: 'analyze', analysing: 'analyze',
  summarise: 'summarize', categorise: 'categorize', organise: 'organize',
  prioritise: 'prioritize', synthesise: 'synthesize', recognise: 'recognize',
  memorise: 'memorize', generalise: 'generalize' };

function normalize(word) {
  const raw = String(word).toLowerCase().replace(/[^a-z]/g, '');
  if (VARIANTS[raw]) return VARIANTS[raw];
  const s = stem(raw);
  if (VARIANTS[s]) return VARIANTS[s];
  // Try to map stemmed British "analys" -> "analyze"
  if (s === 'analys' || s === 'analyz') return 'analyze';
  return s;
}

/**
 * Return the Bloom's level for a single verb, or null if unknown.
 */
export function verbLevel(word) {
  const n = normalize(word);
  if (VERB_TO_LEVEL[n]) return VERB_TO_LEVEL[n];
  // Also try the raw (some table verbs are short, <=4 chars, and skip stemming)
  const raw = String(word).toLowerCase().replace(/[^a-z]/g, '');
  return VERB_TO_LEVEL[raw] || null;
}

/**
 * Derive a CO's ceiling level from its statement.
 * Scans every word, collects recognised Bloom's verbs, and returns the HIGHEST
 * level found (with the list of matched verbs for transparency).
 *
 * Returns { level: 'L1'..'L6'|null, matchedVerbs: [{verb, level}], ambiguous: bool }
 *  - level null  => no recognisable Bloom's verb; caller should ask faculty to set it.
 *  - ambiguous   => verbs from multiple levels were found (faculty may want to confirm).
 */
export function deriveCoCeiling(statement) {
  if (!statement || typeof statement !== 'string') {
    return { level: null, matchedVerbs: [], ambiguous: false };
  }
  const words = statement.split(/\s+/);
  const matched = [];
  const seen = new Set();
  for (const word of words) {
    const lvl = verbLevel(word);
    if (lvl) {
      const key = `${normalize(word)}:${lvl}`;
      if (!seen.has(key)) {
        seen.add(key);
        matched.push({ verb: normalize(word), level: lvl });
      }
    }
  }
  if (!matched.length) return { level: null, matchedVerbs: [], ambiguous: false };

  let top = matched[0].level;
  for (const m of matched) if (rbtlRank(m.level) > rbtlRank(top)) top = m.level;
  const distinctLevels = new Set(matched.map((m) => m.level));
  return { level: top, matchedVerbs: matched, ambiguous: distinctLevels.size > 1 };
}

/**
 * Given a CO's ceiling level, return the list of RBTL levels allowed for
 * questions on that CO (everything at or below the ceiling).
 */
export function allowedRbtlForCeiling(ceiling) {
  const rank = rbtlRank(ceiling);
  if (rank < 1) return [...RBTL_LEVELS]; // unknown ceiling -> allow all (faculty must set)
  return RBTL_LEVELS.slice(0, rank);
}

/**
 * Check whether a question RBTL is permitted under a CO ceiling.
 * If ceiling is null/unknown, returns true (no constraint to enforce yet).
 */
export function isRbtlWithinCeiling(questionRbtl, ceiling) {
  if (!ceiling || rbtlRank(ceiling) < 1) return true;
  return rbtlRank(questionRbtl) > 0 && rbtlRank(questionRbtl) <= rbtlRank(ceiling);
}

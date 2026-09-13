// Client-side Bloom's detection. CO-ceiling derivation mirrors the server's
// utils/bloom.js (word-list based, deterministic). QUESTION-level detection
// (detectRbtl) additionally uses POS tagging (compromise) so nouns like
// "diagram" aren't mistaken for verbs. The server remains authoritative for the
// final ceiling check on save; this gives faculty instant feedback as they type.
import nlp from 'compromise';

export const RBTL_LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'];
export const rbtlRank = (l) => RBTL_LEVELS.indexOf(l) + 1;

export const BLOOM_VERBS = {
  L1: ['define','list','state','name','recall','recognize','identify','label','match','select','memorize','repeat','reproduce','recite','record','quote','cite','enumerate','tabulate','mention'],
  L2: ['explain','describe','summarize','interpret','classify','discuss','illustrate','paraphrase','restate','translate','distinguish','estimate','predict','infer','generalize','exemplify','convert','outline','report','review','express'],
  L3: ['apply','solve','demonstrate','compute','calculate','use','implement','execute','operate','employ','construct','sketch','draw','show','complete','modify','practice','schedule','dramatize','manipulate','prepare'],
  L4: ['analyze','compare','contrast','differentiate','distinguish','examine','categorize','investigate','deconstruct','attribute','organize','correlate','inspect','dissect','separate','subdivide','breakdown','relate'],
  L5: ['evaluate','justify','critique','assess','judge','defend','argue','appraise','recommend','rate','prioritize','validate','verify','measure','conclude','support','weigh','rank','test','monitor'],
  L6: ['create','design','develop','formulate','compose','construct','devise','invent','propose','plan','produce','generate','build','synthesize','integrate','reorganize','derive','hypothesize','originate','assemble','theorize'],
};

const VERB_TO_LEVEL = (() => {
  const m = {};
  for (const lvl of RBTL_LEVELS) for (const v of BLOOM_VERBS[lvl]) {
    if (!m[v] || rbtlRank(lvl) > rbtlRank(m[v])) m[v] = lvl;
  }
  return m;
})();

const VARIANTS = { analyse:'analyze', analyses:'analyze', analysing:'analyze', summarise:'summarize',
  categorise:'categorize', organise:'organize', prioritise:'prioritize', synthesise:'synthesize',
  recognise:'recognize', memorise:'memorize', generalise:'generalize' };

function stem(w) {
  w = w.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 4) return w;
  if (w.endsWith('ing')) { let b = w.slice(0,-3); if (b.length>=3 && b[b.length-1]===b[b.length-2]) b=b.slice(0,-1); return b; }
  if (w.endsWith('es')) return w.slice(0,-2);
  if (w.endsWith('ed')) return w.slice(0,-2);
  if (w.endsWith('s')) return w.slice(0,-1);
  return w;
}
function normalize(word) {
  const raw = word.toLowerCase().replace(/[^a-z]/g, '');
  if (VARIANTS[raw]) return VARIANTS[raw];
  const s = stem(raw);
  if (VARIANTS[s]) return VARIANTS[s];
  if (s === 'analys' || s === 'analyz') return 'analyze';
  return s;
}
function verbLevel(word) {
  const n = normalize(word);
  if (VERB_TO_LEVEL[n]) return VERB_TO_LEVEL[n];
  const raw = word.toLowerCase().replace(/[^a-z]/g, '');
  return VERB_TO_LEVEL[raw] || null;
}

// Returns { level, matchedVerbs:[{verb,level}], ambiguous } — level null if none found.
export function deriveCoCeiling(statement) {
  if (!statement) return { level: null, matchedVerbs: [], ambiguous: false };
  const matched = [];
  const seen = new Set();
  for (const word of statement.split(/\s+/)) {
    const lvl = verbLevel(word);
    if (lvl) { const k = `${normalize(word)}:${lvl}`; if (!seen.has(k)) { seen.add(k); matched.push({ verb: normalize(word), level: lvl }); } }
  }
  if (!matched.length) return { level: null, matchedVerbs: [], ambiguous: false };
  let top = matched[0].level;
  for (const m of matched) if (rbtlRank(m.level) > rbtlRank(top)) top = m.level;
  return { level: top, matchedVerbs: matched, ambiguous: new Set(matched.map(m=>m.level)).size > 1 };
}

// Detect the Bloom's (RBTL) level implied by a QUESTION's wording, using real
// part-of-speech tagging (compromise) rather than word-list guessing.
//
// Why POS tagging: the naive approach — scan for any word in the Bloom's verb
// table — misfires because many Bloom's verbs are also common nouns in exam
// questions ("draw the DIAGRAM", "keep a RECORD", "the TEST set"). A POS tagger
// identifies "diagram" as a noun and "draw" as a verb from grammar, so only
// genuine verbs are considered.
//
// The level of a question is the highest Bloom's level among its COMMAND verbs.
// A verb inside a purpose phrase ("...to relate...", "...to solve...") is the
// reason for the task, not the task itself, so it is excluded.
//
// Note: this is POS-tagging based, not full dependency parsing. It runs entirely
// client-side and live. The Bloom's-level lookup below is a fixed taxonomy table
// (legitimate domain knowledge); POS tagging only decides which words are verbs.
export function detectRbtl(questionText) {
  if (!questionText || typeof questionText !== 'string') {
    return { level: null, matchedVerbs: [], ambiguous: false };
  }

  const doc = nlp(questionText);

  // Verbs that sit in a "to <verb>" purpose construction — exclude these.
  const purposeVerbs = new Set(
    doc.match('to #Verb').verbs().toInfinitive().out('array').map((v) => normalize(v))
  );

  // All grammatically-tagged verbs, reduced to their infinitive (base) form.
  const verbForms = doc.verbs().toInfinitive().out('array');

  const commandMatched = []; // command verbs that map to a Bloom's level
  const allMatched = [];     // every mapped verb (for the hint UI / transparency)
  const seen = new Set();
  for (const v of verbForms) {
    const nv = normalize(v);
    const lvl = VERB_TO_LEVEL[nv] || VERB_TO_LEVEL[v.toLowerCase()] || null;
    if (!lvl) continue;
    const key = `${nv}:${lvl}`;
    if (!seen.has(key)) { seen.add(key); allMatched.push({ verb: nv, level: lvl }); }
    if (!purposeVerbs.has(nv)) commandMatched.push({ verb: nv, level: lvl });
  }

  // Fallback: if the tagger found no mapped verbs at all, try a bare word scan so
  // a terse question ("Find-S consistent hypotheses") still gets a chance.
  if (!allMatched.length) {
    for (const word of questionText.split(/\s+/)) {
      const lvl = verbLevel(word);
      if (lvl) { const nv = normalize(word); const k = `${nv}:${lvl}`; if (!seen.has(k)) { seen.add(k); allMatched.push({ verb: nv, level: lvl }); commandMatched.push({ verb: nv, level: lvl }); } }
    }
  }
  if (!allMatched.length) return { level: null, matchedVerbs: [], ambiguous: false };

  // Level = highest among command verbs (or, if every mapped verb was a purpose
  // verb, fall back to the highest mapped verb so we never under-report).
  const pool = commandMatched.length ? commandMatched : allMatched;
  let best = pool[0].level;
  for (const m of pool) if (rbtlRank(m.level) > rbtlRank(best)) best = m.level;

  return {
    level: best,
    matchedVerbs: allMatched,
    ambiguous: new Set(allMatched.map((m) => m.level)).size > 1,
  };
}

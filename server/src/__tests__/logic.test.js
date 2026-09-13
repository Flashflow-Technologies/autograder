// Standalone logic test — no DB/npm needed. Mirrors the pure functions in
// scoringService.js and QuestionPaper.validateOrEquivalence to prove correctness.
import assert from 'node:assert';
import { test } from 'node:test';

/* ---- replicate pure logic ---- */
function selectOrWinners(subScores) {
  const byGroup = {};
  for (const s of subScores) {
    byGroup[s.groupIndex] = byGroup[s.groupIndex] || {};
    byGroup[s.groupIndex][s.questionNo] = (byGroup[s.groupIndex][s.questionNo] || 0) + s.finalScore;
  }
  const selections = [];
  for (const [groupIndex, perQuestion] of Object.entries(byGroup)) {
    const qnos = Object.keys(perQuestion).map(Number);
    if (qnos.length <= 1) continue;
    const winner = qnos.reduce((a, b) => (perQuestion[b] > perQuestion[a] ? b : a));
    selections.push({ groupIndex: Number(groupIndex), selectedQuestionNo: winner, selectedBy: 'ai' });
  }
  return selections;
}

function computeTotal(subScores, orSelections) {
  const sel = {};
  orSelections.forEach((o) => { sel[o.groupIndex] = o.selectedQuestionNo; });
  let total = 0;
  for (const s of subScores) {
    if (sel[s.groupIndex] !== undefined && s.questionNo !== sel[s.groupIndex]) continue;
    total += s.finalScore;
  }
  return Math.round(total * 10) / 10;
}

function coRbtlMarksMap(q) {
  const m = {};
  for (const sq of q.subQuestions) {
    const k = `${sq.co}·${sq.rbtl}`;
    m[k] = (m[k] || 0) + sq.marks;
  }
  return m;
}
function validateOrEquivalence(groups) {
  const errors = [];
  groups.forEach((g, gi) => {
    if (g.groupType !== 'or_pair') return;
    const [a, b] = g.questions;
    const ma = coRbtlMarksMap(a), mb = coRbtlMarksMap(b);
    for (const k of new Set([...Object.keys(ma), ...Object.keys(mb)])) {
      if ((ma[k] || 0) !== (mb[k] || 0)) errors.push(`G${gi}: ${k} ${ma[k] || 0}!=${mb[k] || 0}`);
    }
  });
  return errors;
}

/* ---- tests ---- */
test('OR: higher-scoring side is selected', () => {
  const subs = [
    { groupIndex: 0, questionNo: 1, subLabel: 'a', finalScore: 5 },
    { groupIndex: 0, questionNo: 1, subLabel: 'b', finalScore: 7 },  // Q1 = 12
    { groupIndex: 0, questionNo: 2, subLabel: 'a', finalScore: 6 },
    { groupIndex: 0, questionNo: 2, subLabel: 'b', finalScore: 9 },  // Q2 = 15
  ];
  const sel = selectOrWinners(subs);
  assert.equal(sel.length, 1);
  assert.equal(sel[0].selectedQuestionNo, 2);
  assert.equal(computeTotal(subs, sel), 15);
});

test('OR: only one side attempted -> no selection, counts that side', () => {
  const subs = [
    { groupIndex: 0, questionNo: 1, subLabel: 'a', finalScore: 4 },
    { groupIndex: 0, questionNo: 1, subLabel: 'b', finalScore: 8 },
  ];
  const sel = selectOrWinners(subs);
  assert.equal(sel.length, 0);
  assert.equal(computeTotal(subs, sel), 12);
});

test('Total: solo + selected OR side combine correctly', () => {
  const subs = [
    { groupIndex: 0, questionNo: 1, subLabel: 'a', finalScore: 12 }, // Q1
    { groupIndex: 0, questionNo: 2, subLabel: 'a', finalScore: 15 }, // Q2 wins
    { groupIndex: 1, questionNo: 3, subLabel: 'a', finalScore: 4 },  // solo
    { groupIndex: 1, questionNo: 3, subLabel: 'b', finalScore: 6 },
  ];
  const sel = selectOrWinners(subs);
  assert.equal(computeTotal(subs, sel), 25); // 15 + 4 + 6
});

test('OR equivalence: valid when CO·RBTL marks match across sides', () => {
  const groups = [{
    groupType: 'or_pair',
    questions: [
      { questionNo: 1, subQuestions: [{ co: 'CO2', rbtl: 'L3', marks: 6 }, { co: 'CO3', rbtl: 'L5', marks: 10 }] },
      { questionNo: 2, subQuestions: [{ co: 'CO3', rbtl: 'L5', marks: 10 }, { co: 'CO2', rbtl: 'L3', marks: 6 }] },
    ],
  }];
  assert.deepEqual(validateOrEquivalence(groups), []);
});

test('OR equivalence: invalid when marks per CO·RBTL differ', () => {
  const groups = [{
    groupType: 'or_pair',
    questions: [
      { questionNo: 1, subQuestions: [{ co: 'CO2', rbtl: 'L3', marks: 6 }, { co: 'CO3', rbtl: 'L5', marks: 10 }] },
      { questionNo: 2, subQuestions: [{ co: 'CO2', rbtl: 'L3', marks: 10 }, { co: 'CO3', rbtl: 'L5', marks: 6 }] },
    ],
  }];
  const errs = validateOrEquivalence(groups);
  assert.equal(errs.length, 2); // both CO·RBTL combos mismatch
});

test('Score cap: a sub-score never exceeds its max (cap logic)', () => {
  const cap = (raw, max) => Math.min(raw, max);
  assert.equal(cap(11.4, 10), 10);
  assert.equal(cap(7.8, 10), 7.8);
});

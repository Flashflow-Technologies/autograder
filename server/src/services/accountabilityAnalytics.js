import { Score } from '../models/index.js';
import { isProgrammingSub } from '../utils/subScore.js';
import User from '../models/User.js';

/**
 * Accountability analytics (no heavy ML — descriptive statistics over data
 * EvalAI already collects):
 *   #9 bias monitoring — compare score distributions across cohorts and flag
 *      statistically notable disparities for HUMAN review (never auto-acts).
 *   #10 AI-vs-human agreement — how often faculty accept vs change AI drafts,
 *      by question type and Bloom level.
 *
 * Honest scope: this surfaces disparities for humans to investigate. A disparity
 * is NOT proof of bias (cohorts differ for many legitimate reasons) — the tool
 * flags "worth a look", it does not conclude unfairness. That framing is built
 * into the output and must be preserved in the UI.
 */

function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
function stdev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

/**
 * #9 Bias monitoring: group published scores by cohort and compare mean
 * percentage scores. Flags groups whose mean deviates notably from the overall
 * mean (a simple, transparent heuristic — not a significance test masquerading
 * as proof).
 */
export async function biasMonitor({ examId } = {}) {
  const filter = { published: true };
  if (examId) filter.examId = examId;

  const scores = await Score.find(filter).populate('studentId', 'cohort department').lean();
  if (!scores.length) return { groups: [], overall: null, note: 'No published scores yet.' };

  // percentage score per student
  const rows = scores.map((s) => {
    const max = (s.subScores || []).reduce((a, x) => a + (x.maxMarks || 0), 0) || 1;
    return { pct: (s.totalScore / max) * 100, cohort: s.studentId?.cohort || 'Unspecified', department: s.studentId?.department || 'Unspecified' };
  });

  const overallMean = mean(rows.map((r) => r.pct));
  const overallSd = stdev(rows.map((r) => r.pct));

  // group by cohort
  const byCohort = {};
  for (const r of rows) {
    (byCohort[r.cohort] = byCohort[r.cohort] || []).push(r.pct);
  }

  const groups = Object.entries(byCohort).map(([cohort, pcts]) => {
    const gMean = mean(pcts);
    const delta = gMean - overallMean;
    // Flag if a group's mean is more than ~0.5 SD from overall AND the group is
    // not tiny. This is a "worth investigating" heuristic, deliberately not a
    // hard statistical claim.
    const flagged = overallSd > 0 && Math.abs(delta) > 0.5 * overallSd && pcts.length >= 5;
    return {
      cohort,
      count: pcts.length,
      meanPct: Math.round(gMean * 10) / 10,
      deltaFromOverall: Math.round(delta * 10) / 10,
      flagged,
    };
  }).sort((a, b) => b.count - a.count);

  return {
    overall: { meanPct: Math.round(overallMean * 10) / 10, stdev: Math.round(overallSd * 10) / 10, students: rows.length },
    groups,
    note: 'A flag means a cohort\u2019s average differs notably from the overall average and is worth a human look. It is NOT proof of bias \u2014 cohorts can differ for many legitimate reasons.',
  };
}

/**
 * #10 AI-vs-human agreement: across reviewed subscores, how often did faculty
 * accept the AI draft unchanged vs. adjust it, broken down by Bloom level (RBTL).
 * Surfaces where the AI is least trusted/weakest.
 */
export async function agreementReport({ examId } = {}) {
  const filter = {};
  if (examId) filter.examId = examId;
  const scores = await Score.find(filter).lean();

  // overall + by-RBTL tallies
  const tally = { total: 0, accepted: 0, adjusted: 0, flagged: 0, byRbtl: {} };
  let adjMagnitudeSum = 0; let adjCount = 0;

  for (const s of scores) {
    for (const sub of s.subScores || []) {
      // Skip programming sub-scores (agreement is about AI *descriptive* scoring).
      // Uses isProgrammingSub because Mongoose auto-initialises `programming` to
      // {} (truthy) even for descriptive answers.
      if (isProgrammingSub(sub)) continue;
      const status = sub.reviewStatus;
      if (!['approved', 'adjusted', 'auto'].includes(status)) continue;
      tally.total += 1;
      const rbtl = sub.rbtl || 'NA';
      const r = (tally.byRbtl[rbtl] = tally.byRbtl[rbtl] || { total: 0, accepted: 0, adjusted: 0 });
      r.total += 1;
      if (status === 'adjusted') {
        tally.adjusted += 1; r.adjusted += 1;
        if (sub.aiScore != null && sub.finalScore != null) {
          adjMagnitudeSum += Math.abs(sub.finalScore - sub.aiScore); adjCount += 1;
        }
      } else {
        // 'approved' or 'auto' = AI draft accepted
        tally.accepted += 1; r.accepted += 1;
      }
    }
  }

  const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
  const byRbtl = Object.entries(tally.byRbtl).sort(([a], [b]) => a.localeCompare(b)).map(([rbtl, r]) => ({
    rbtl, total: r.total, acceptedPct: pct(r.accepted, r.total), adjustedPct: pct(r.adjusted, r.total),
  }));

  return {
    total: tally.total,
    acceptedPct: pct(tally.accepted, tally.total),
    adjustedPct: pct(tally.adjusted, tally.total),
    avgAdjustMagnitude: adjCount ? Math.round((adjMagnitudeSum / adjCount) * 10) / 10 : null,
    byRbtl,
    note: 'High adjustment rates (especially at higher Bloom levels) indicate where the AI draft is least reliable and human oversight matters most.',
  };
}

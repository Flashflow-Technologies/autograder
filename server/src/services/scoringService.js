import { Scheme, Submission, Score } from '../models/index.js';
import QuestionPaper from '../models/QuestionPaper.js';
import Exam from '../models/Exam.js';
import { scoreAnswer } from './aiClient.js';
import { runTestCases } from './codeRunner.js';
import { estimateComplexity, styleCheck, composeProgrammingScore } from './codeQuality.js';
import { NotFound } from '../utils/errors.js';
import logger from '../utils/logger.js';

// RBTL levels that always require human review regardless of confidence
const MANDATORY_REVIEW_RBTL = new Set(['L5', 'L6']);
const CONFIDENCE_REVIEW_THRESHOLD = 0.5;

// Borderline review: an answer whose score lands near a grade boundary is routed
// to a human even when confidence is high, because a small scoring error there
// flips the outcome (pass<->fail). The primary per-question boundary is the pass
// mark (a fraction of max). Defaults below; overridable per exam via
// exam.reviewConfig. The actual check is a closure in scoreSubmission that reads
// the resolved (per-exam or default) values.
const PASS_FRACTION = 0.5;        // pass mark = 50% of a question's max marks
const BORDERLINE_MARGIN = 0.1;    // within +/-10% of max marks of the pass line

/**
 * Score a full submission: every answered sub-question (including both sides
 * of attempted OR pairs), then select the higher-scoring OR alternative,
 * enforce the per-sub-question score cap, and compute the total.
 */
export async function scoreSubmission(submissionId) {
  const submission = await Submission.findById(submissionId);
  if (!submission) throw NotFound('Submission not found');

  // Scheme may be absent for programming-only exams (programming questions
  // don't need model answers). Descriptive questions still require it.
  const scheme = await Scheme.findOne({ examId: submission.examId });

  // Load the paper too, so we can find programming sub-questions (language,
  // test cases) which live on the paper, not the marking scheme.
  const paper = await QuestionPaper.findOne({ examId: submission.examId });
  const paperSub = (gi, qNo, label) => {
    if (!paper) return null;
    const g = paper.groups?.[gi];
    const q = g?.questions?.find((qq) => qq.questionNo === qNo);
    return q?.subQuestions?.find((s) => s.label === label) || null;
  };

  logger.info('Scoring submission', { submissionId, studentId: submission.studentId });

  // Per-exam review tuning (falls back to service defaults when unset).
  const exam = await Exam.findById(submission.examId).select('reviewConfig');
  const rc = exam?.reviewConfig || {};
  const confidenceThreshold = rc.confidenceThreshold != null ? rc.confidenceThreshold : CONFIDENCE_REVIEW_THRESHOLD;
  const passFraction = rc.passFraction != null ? rc.passFraction : PASS_FRACTION;
  const borderlineMargin = rc.borderlineMargin != null ? rc.borderlineMargin : BORDERLINE_MARGIN;
  const borderline = (scored, max) => {
    if (!max || max <= 0) return false;
    return Math.abs(scored - passFraction * max) <= borderlineMargin * max;
  };

  const subScores = [];

  for (const ans of submission.answers) {
    const psub = paperSub(ans.groupIndex, ans.questionNo, ans.subLabel);
    const isProgramming = psub && psub.questionType === 'programming';

    const entry = scheme?.entries?.find(
      (e) => e.groupIndex === ans.groupIndex && e.questionNo === ans.questionNo && e.subLabel === ans.subLabel
    );

    // Programming questions can be scored from the PAPER's metadata even with no
    // scheme entry (they need co/rbtl/maxMarks, all present on the paper). Only
    // descriptive answers truly require a scheme entry.
    if (!entry && !isProgramming) {
      logger.warn('No scheme entry for answer — skipping', {
        groupIndex: ans.groupIndex, questionNo: ans.questionNo, subLabel: ans.subLabel,
      });
      continue;
    }

    // For programming without a scheme entry, synthesise the bits we need.
    const effectiveEntry = entry || { co: psub.co, rbtl: psub.rbtl, maxMarks: psub.marks };

    // --- Programming question: execute against test cases + static quality ---
    if (isProgramming) {
      const entryRef = effectiveEntry;
      const source = ans.rawText || '';
      let progResult = { compiled: false, results: [], passedWeight: 0, totalWeight: 0 };
      let aiUnavailable = false;
      try {
        progResult = await runTestCases({
          source, language: psub.language, testCases: psub.testCases || [],
          timeLimitSec: psub.timeLimitSec, memoryLimitMb: psub.memoryLimitMb,
        });
      } catch (e) {
        logger.error('Code execution failed — flagging for manual review', { error: e.message });
        aiUnavailable = true;
      }

      const complexity = estimateComplexity(source);
      const { violations } = styleCheck(source);
      const { score: rawScore, breakdown } = composeProgrammingScore({
        maxMarks: entryRef.maxMarks, rubric: psub.rubric,
        passedWeight: progResult.passedWeight, totalWeight: progResult.totalWeight,
        styleViolations: violations, complexity, complexityThreshold: psub.complexityThreshold,
      });

      const finalScore = Math.min(Math.round(rawScore), entryRef.maxMarks);
      // Programming answers always get a human glance (review backstop), and
      // certainly if execution was unavailable.
      const needsReview = true;

      subScores.push({
        groupIndex: ans.groupIndex,
        questionNo: ans.questionNo,
        subLabel: ans.subLabel,
        co: entryRef.co,
        additionalCos: entryRef.additionalCos || [],
        rbtl: entryRef.rbtl,
        maxMarks: entryRef.maxMarks,
        aiScore: aiUnavailable ? 0 : Math.round(rawScore * 100) / 100,
        finalScore: aiUnavailable ? 0 : finalScore,
        confidence: aiUnavailable ? 0 : breakdown.correctnessFrac,
        programming: {
          language: psub.language,
          compiled: progResult.compiled,
          testResults: progResult.results,
          passedWeight: progResult.passedWeight,
          totalWeight: progResult.totalWeight,
          ...breakdown,
        },
        aiFeedback: aiUnavailable
          ? 'Automated execution was unavailable — please grade manually.'
          : `Passed ${breakdown.correctnessFrac * 100}% of test weight; complexity ${complexity}; ${violations} style issue(s).`,
        reviewStatus: 'pending',
        reviewReason: progResult.executionUnavailable ? 'ai_unavailable' : 'programming',
      });
      continue;
    }

    const answerText = ans.inputMode === 'scanned' ? ans.ocrText : ans.rawText;
    const result = await scoreAnswer({ answerText, schemeEntry: { ...entry.toObject(), questionNo: ans.questionNo } });

    // Official mark per question is a whole number (standard rounding), capped at max.
    const finalScore = Math.min(Math.round(result.score), entry.maxMarks);

    // Determine review need AND the reason (for the review queue UI).
    let reviewReason = '';
    if (result.aiUnavailable) reviewReason = 'ai_unavailable';
    else if (MANDATORY_REVIEW_RBTL.has(entry.rbtl)) reviewReason = 'high_rbtl';
    else if (result.confidence < confidenceThreshold) reviewReason = 'low_confidence';
    else if (borderline(finalScore, entry.maxMarks)) reviewReason = 'borderline';
    const needsReview = reviewReason !== '';

    subScores.push({
      groupIndex: ans.groupIndex,
      questionNo: ans.questionNo,
      subLabel: ans.subLabel,
      co: entry.co,
      additionalCos: entry.additionalCos || [],
      rbtl: entry.rbtl,
      maxMarks: entry.maxMarks,
      components: result.components,
      aiScore: result.score,
      finalScore,
      confidence: result.confidence,
      foundKeywords: result.foundKeywords,
      missingKeywords: result.missingKeywords,
      aiFeedback: result.feedback,
      spans: result.spans || [],
      reviewStatus: needsReview ? 'pending' : 'auto',
      reviewReason,
    });
  }

  const orSelections = selectOrWinners(subScores);
  const totalScore = computeTotal(subScores, orSelections);

  // #6 version stamping: record what produced this score for reproducibility.
  const provenance = {
    aiModel: 'all-MiniLM-L6-v2',
    aiServiceVersion: process.env.AI_SERVICE_VERSION || '1.0.0',
    appVersion: process.env.APP_VERSION || '1.0.0',
    schemeVersion: scheme?.updatedAt ? new Date(scheme.updatedAt).getTime() : null,
    scoredAt: new Date(),
  };

  const score = await Score.findOneAndUpdate(
    { examId: submission.examId, studentId: submission.studentId },
    {
      submissionId: submission._id,
      examId: submission.examId,
      studentId: submission.studentId,
      subScores,
      orSelections,
      totalScore,
      scoringProvenance: provenance,
      published: false,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  submission.status = 'scored';
  await submission.save();

  logger.info('Submission scored', { submissionId, totalScore, subScoreCount: subScores.length });
  return score;
}

/**
 * For each OR group where both sides were attempted, pick the higher-scoring
 * side. Ties are left for mandatory faculty selection (selectedBy stays 'ai'
 * but the tie is detectable since both sides remain in subScores).
 */
function selectOrWinners(subScores) {
  const byGroup = {};
  for (const s of subScores) {
    byGroup[s.groupIndex] = byGroup[s.groupIndex] || {};
    byGroup[s.groupIndex][s.questionNo] = byGroup[s.groupIndex][s.questionNo] || 0;
    byGroup[s.groupIndex][s.questionNo] += s.finalScore;
  }

  const selections = [];
  for (const [groupIndex, perQuestion] of Object.entries(byGroup)) {
    const questionNos = Object.keys(perQuestion).map(Number);
    if (questionNos.length <= 1) continue; // solo group or only one side attempted
    // both sides attempted -> pick higher
    const winner = questionNos.reduce((a, b) => (perQuestion[b] > perQuestion[a] ? b : a));
    selections.push({ groupIndex: Number(groupIndex), selectedQuestionNo: winner, selectedBy: 'ai' });
  }
  return selections;
}

/** Total = sum of selected-side scores for OR groups + all solo scores. */
function computeTotal(subScores, orSelections) {
  const selectedByGroup = {};
  orSelections.forEach((sel) => { selectedByGroup[sel.groupIndex] = sel.selectedQuestionNo; });

  let total = 0;
  for (const s of subScores) {
    const selected = selectedByGroup[s.groupIndex];
    // If this group has an OR selection, only count the winning side
    if (selected !== undefined && s.questionNo !== selected) continue;
    total += s.finalScore;
  }
  return Math.round(total * 10) / 10;
}

export { selectOrWinners, computeTotal };

import { asyncHandler, NotFound, BadRequest } from '../utils/errors.js';
import { Score, Submission, Appeal, Scheme, AuditLog } from '../models/index.js';
import { studentTransparency } from '../services/transparencyService.js';
import User from '../models/User.js';
import Exam from '../models/Exam.js';
import QuestionPaper from '../models/QuestionPaper.js';
import { scoreSubmission } from '../services/scoringService.js';
import { recordAudit } from '../services/auditService.js';
import { enqueueEmail } from '../services/jobDispatch.js';
import { resultPublishedEmail, appealResolvedEmail } from '../services/notificationService.js';
import { openScan } from '../services/scanStore.js';
import { assertCourseAccess, visibleCourses } from '../services/courseAccess.js';
import Course from '../models/Course.js';
import { isProgrammingSub } from '../utils/subScore.js';
import logger from '../utils/logger.js';

/* ===== Scoring trigger ===== */
export const triggerScoring = asyncHandler(async (req, res) => {
  const submission = await Submission.findById(req.params.submissionId);
  if (!submission) throw NotFound('Submission not found');
  const score = await scoreSubmission(submission._id);
  res.json({ success: true, data: score });
});

/* ===== Review queue (faculty) ===== */
export const getReviewQueue = asyncHandler(async (req, res) => {
  const { examId } = req.params;
  const scores = await Score.find({ examId }).populate('studentId', 'name rollNo');

  const queue = { mandatory: [], spotCheck: [], auto: [] };
  for (const score of scores) {
    for (const s of score.subScores) {
      const item = {
        scoreId: score._id, studentId: score.studentId, questionNo: s.questionNo,
        subLabel: s.subLabel, co: s.co, rbtl: s.rbtl, aiScore: s.aiScore,
        finalScore: s.finalScore, confidence: s.confidence, reviewStatus: s.reviewStatus,
        reviewReason: s.reviewReason || '', components: s.components,
      };
      if (s.reviewStatus === 'pending') queue.mandatory.push(item);
      else if (s.confidence < 0.75) queue.spotCheck.push(item);
      else queue.auto.push(item);
    }
  }
  res.json({ success: true, data: queue });
});

/* ===== CSV helpers ===== */
// Escape a CSV field (wrap in quotes if it contains comma/quote/newline)
function csvEsc(v) {
  const str = String(v ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}
function sendCsv(res, filename, lines) {
  const csv = '\uFEFF' + lines.join('\r\n'); // BOM so Excel reads UTF-8 correctly
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

/* ===== Audit trail CSV export ===== */
// Append-only record of every faculty action: score accept/adjust, OR
// selection, appeal resolution. Optionally scoped to one exam via ?examId=.
export const exportAuditCsv = asyncHandler(async (req, res) => {
  const { examId } = req.query;
  if (examId) { await assertCourseAccess(req.user, (await Exam.findById(examId).select('courseId'))?.courseId, 'view'); }
  else if (req.user.role !== 'admin') { throw BadRequest('Specify an examId; only admins can export across all courses.'); }

  let filter = {};
  if (examId) {
    // Audits target a score; resolve which score ids belong to this exam
    const scoreIds = await Score.find({ examId }).distinct('_id');
    filter = { targetType: 'score', targetId: { $in: scoreIds } };
  }

  const entries = await AuditLog.find(filter).populate('actorId', 'name email').sort({ timestamp: 1 });

  const header = ['Timestamp', 'Actor', 'Role', 'Action', 'Target Type', 'Target ID', 'Before', 'After', 'Reason'];
  const lines = [header.map(csvEsc).join(',')];
  for (const e of entries) {
    lines.push([
      csvEsc(e.timestamp ? new Date(e.timestamp).toISOString() : ''),
      csvEsc(e.actorId?.name || e.actorId || ''),
      csvEsc(e.actorRole || ''),
      csvEsc(e.action || ''),
      csvEsc(e.targetType || ''),
      csvEsc(e.targetId || ''),
      csvEsc(e.before != null ? JSON.stringify(e.before) : ''),
      csvEsc(e.after != null ? JSON.stringify(e.after) : ''),
      csvEsc(e.reason || ''),
    ].join(','));
  }

  logger.info('Audit trail exported', { examId: examId || 'all', rows: entries.length, by: req.user.id });
  sendCsv(res, `audit_trail${examId ? '_exam' : ''}.csv`, lines);
});

/* ===== Consolidated CSV report (faculty) ===== */
// CSV opens directly in Excel and needs no extra dependency.
export const exportScoresCsv = asyncHandler(async (req, res) => {
  const { examId } = req.params;
  const exam = await Exam.findById(examId);
  if (!exam) throw NotFound('Exam not found');

  const scores = await Score.find({ examId }).populate('studentId', 'name rollNo');

  // Determine the full set of COs present across the exam, sorted (CO1..CO5)
  const coSet = new Set();
  scores.forEach((sc) => sc.subScores.forEach((s) => { if (s.co) coSet.add(s.co); }));
  const coCols = [...coSet].sort((a, b) => a.localeCompare(b));

  // Per-student CO totals, counting only the selected OR side
  const rows = scores.map((sc) => {
    const selectedByGroup = {};
    sc.orSelections.forEach((o) => { selectedByGroup[o.groupIndex] = o.selectedQuestionNo; });
    const coTotals = {};
    for (const s of sc.subScores) {
      const sel = selectedByGroup[s.groupIndex];
      if (sel !== undefined && s.questionNo !== sel) continue;
      coTotals[s.co] = (coTotals[s.co] || 0) + s.finalScore;
    }
    return {
      rollNo: sc.studentId?.rollNo || '',
      name: sc.studentId?.name || '',
      co: coTotals,
      total: Math.ceil(sc.totalScore),
    };
  }).sort((a, b) => a.rollNo.localeCompare(b.rollNo));

  // Escape a CSV field (wrap in quotes if it contains comma/quote/newline)
  const esc = (v) => {
    const str = String(v ?? '');
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const header = ['Roll No', 'Name', ...coCols, 'Total Marks'];
  const lines = [header.map(esc).join(',')];
  for (const r of rows) {
    const coVals = coCols.map((co) => (r.co[co] != null ? Math.round(r.co[co] * 10) / 10 : 0));
    lines.push([esc(r.rollNo), esc(r.name), ...coVals, r.total].join(','));
  }
  const csv = '\uFEFF' + lines.join('\r\n'); // BOM so Excel reads UTF-8 correctly

  const safeName = `${exam.subjectCode || 'exam'}_${exam.examType || ''}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  logger.info('Scores CSV exported', { examId, rows: rows.length, by: req.user.id });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}_scores.csv"`);
  res.send(csv);
});

/* ===== Per-student review: list of students for an exam ===== */
export const getReviewStudents = asyncHandler(async (req, res) => {
  const { examId } = req.params;
  const scores = await Score.find({ examId }).populate('studentId', 'name rollNo').sort({ 'studentId.rollNo': 1 });
  const students = scores.map((sc) => {
    const pending = sc.subScores.filter((s) => s.reviewStatus === 'pending').length;

    // CO-wise marks: sum finalScore per CO, counting only the selected OR side
    const selectedByGroup = {};
    sc.orSelections.forEach((o) => { selectedByGroup[o.groupIndex] = o.selectedQuestionNo; });
    const coTotals = {}; // coId -> { scored, max }
    for (const s of sc.subScores) {
      const sel = selectedByGroup[s.groupIndex];
      if (sel !== undefined && s.questionNo !== sel) continue; // skip discarded OR side
      coTotals[s.co] = coTotals[s.co] || { scored: 0, max: 0 };
      coTotals[s.co].scored += s.finalScore;
      coTotals[s.co].max += s.maxMarks;
    }
    const coWise = Object.entries(coTotals)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([co, v]) => ({ co, scored: Math.round(v.scored * 10) / 10, max: v.max }));

    return {
      scoreId: sc._id,
      studentId: sc.studentId?._id,
      name: sc.studentId?.name,
      rollNo: sc.studentId?.rollNo,
      coWise,
      totalScore: sc.totalScore,
      totalScoreCeiled: Math.ceil(sc.totalScore), // ceil decimals for display
      reviewState: sc.reviewState,
      pendingCount: pending,
      published: sc.published,
    };
  });

  // Submissions that have been received but not yet scored (the background
  // worker — including Judge0 code execution — hasn't finished). These have a
  // submission record but no Score document yet, so they wouldn't otherwise
  // appear. We surface them so faculty see evaluation is in progress.
  const scoredSubmissionIds = scores.map((sc) => String(sc.submissionId));
  const submittedDocs = await Submission.find({ examId, status: 'submitted' })
    .populate('studentId', 'name rollNo').sort({ 'studentId.rollNo': 1 });
  const evaluating = submittedDocs
    .filter((sub) => !scoredSubmissionIds.includes(String(sub._id)))
    .map((sub) => ({
      submissionId: sub._id,
      name: sub.studentId?.name,
      rollNo: sub.studentId?.rollNo,
      submittedAt: sub.submittedAt,
    }));

  res.json({
    success: true,
    data: {
      students,
      evaluating,
      counts: {
        scored: students.length,
        evaluating: evaluating.length,
        total: students.length + evaluating.length,
      },
    },
  });
});

/* ===== Per-student review: full detail with answers + scores + feedback ===== */
/* ===== Serve a stored answer scan image (faculty review) ===== */
export const serveScan = asyncHandler(async (req, res) => {
  const { fileId } = req.params;
  let scan;
  try {
    scan = await openScan(fileId);
  } catch (err) {
    throw NotFound('Scan image not found');
  }
  // Enforce course access via the scan's stored examId (answer scans are sensitive).
  const examId = scan.file?.metadata?.examId;
  if (examId && req.user.role !== 'admin') {
    const exam = await Exam.findById(examId).select('courseId');
    await assertCourseAccess(req.user, exam?.courseId, 'view');
  }
  res.setHeader('Content-Type', scan.file.contentType || 'image/png');
  res.setHeader('Cache-Control', 'private, max-age=300');
  scan.stream.on('error', () => { if (!res.headersSent) res.status(500).end(); });
  scan.stream.pipe(res);
});

export const getStudentReview = asyncHandler(async (req, res) => {
  const { scoreId } = req.params;
  const score = await Score.findById(scoreId).populate('studentId', 'name rollNo');
  if (!score) throw NotFound('Score not found');

  const submission = await Submission.findById(score.submissionId);
  const paper = await QuestionPaper.findOne({ examId: score.examId });

  // Index question text by groupIndex/questionNo/subLabel for quick lookup
  const questionText = {};
  if (paper) {
    paper.groups.forEach((g, gi) => g.questions.forEach((q) => q.subQuestions.forEach((sq) => {
      questionText[`${gi}-${q.questionNo}-${sq.label}`] = sq.text;
    })));
  }
  // Index the student's answer text the same way
  const answerText = {};
  const scanInfo = {}; // key -> { inputMode, scanFileId }
  if (submission) {
    submission.answers.forEach((a) => {
      const key = `${a.groupIndex}-${a.questionNo}-${a.subLabel}`;
      answerText[key] = a.inputMode === 'scanned' ? a.ocrText : a.rawText;
      if (a.inputMode === 'scanned' && a.scanFileId) {
        scanInfo[key] = { inputMode: 'scanned', scanFileId: String(a.scanFileId) };
      }
    });
  }

  const selectedByGroup = {};
  score.orSelections.forEach((o) => { selectedByGroup[o.groupIndex] = o.selectedQuestionNo; });

  const items = score.subScores.map((s) => {
    const key = `${s.groupIndex}-${s.questionNo}-${s.subLabel}`;
    const isOrGroup = score.orSelections.some((o) => o.groupIndex === s.groupIndex);
    return {
      groupIndex: s.groupIndex,
      questionNo: s.questionNo,
      subLabel: s.subLabel,
      co: s.co, rbtl: s.rbtl, maxMarks: s.maxMarks,
      questionText: questionText[key] || '',
      answerText: answerText[key] || '(no answer submitted)',
      inputMode: scanInfo[key]?.inputMode || 'typed',
      scanFileId: scanInfo[key]?.scanFileId || null,
      components: s.components,
      aiScore: s.aiScore,
      finalScore: s.finalScore,
      confidence: s.confidence,
      foundKeywords: s.foundKeywords,
      missingKeywords: s.missingKeywords,
      aiFeedback: s.aiFeedback,
      programming: s.programming || null,
      reviewStatus: s.reviewStatus,
      reviewedByName: s.reviewedByName || null,
      reviewedAt: s.reviewedAt || null,
      isOrGroup,
      isSelectedOrSide: isOrGroup ? selectedByGroup[s.groupIndex] === s.questionNo : true,
    };
  });

  res.json({
    success: true,
    data: {
      scoreId: score._id,
      student: { name: score.studentId?.name, rollNo: score.studentId?.rollNo },
      totalScore: score.totalScore,
      totalScoreCeiled: Math.ceil(score.totalScore),
      reviewState: score.reviewState,
      published: score.published,
      publishedByName: score.publishedByName || null,
      publishedAt: score.publishedAt || null,
      orSelections: score.orSelections,
      scoringProvenance: score.scoringProvenance || null, // #6 version stamping
      items,
    },
  });
});

/* ===== Save per-student review state (save-and-continue) ===== */
export const setReviewState = asyncHandler(async (req, res) => {
  const { scoreId } = req.params;
  const { reviewState } = req.body;
  if (!['not_started', 'in_progress', 'completed'].includes(reviewState)) throw BadRequest('Invalid reviewState');
  const score = await Score.findById(scoreId);
  if (!score) throw NotFound('Score not found');
  score.reviewState = reviewState;
  await score.save();
  logger.info('Review state saved', { scoreId, reviewState, by: req.user.id });
  res.json({ success: true, data: { reviewState: score.reviewState } });
});

/* ===== Faculty actions on a sub-score ===== */
export const reviewSubScore = asyncHandler(async (req, res) => {
  const { scoreId } = req.params;
  const { questionNo, subLabel, action, newScore, reason } = req.body;
  const score = await Score.findById(scoreId);
  if (!score) throw NotFound('Score not found');

  const sub = score.subScores.find((s) => s.questionNo === questionNo && s.subLabel === subLabel);
  if (!sub) throw NotFound('Sub-score not found');

  const before = { finalScore: sub.finalScore, reviewStatus: sub.reviewStatus };

  if (action === 'accept') {
    sub.reviewStatus = 'approved';
  } else if (action === 'adjust') {
    if (newScore == null || newScore < 0 || newScore > sub.maxMarks) throw BadRequest(`Score must be 0..${sub.maxMarks}`);
    if (!reason) throw BadRequest('Reason is required for adjustment');
    // Official marks are whole numbers (standard rounding), capped at max.
    sub.finalScore = Math.min(Math.round(newScore), sub.maxMarks);
    sub.reviewStatus = 'adjusted';
    sub.adjustReason = reason; // kept for student-facing score-change provenance (#8)
  } else if (action === 'flag') {
    sub.reviewStatus = 'flagged';
  } else {
    throw BadRequest('Unknown action');
  }

  // Record who reviewed this sub-score and when
  sub.reviewedByName = req.user.name;
  sub.reviewedById = req.user.id;
  sub.reviewedAt = new Date();

  // Recompute total from selected OR sides
  score.totalScore = recomputeTotal(score);
  await score.save();

  await recordAudit({
    actor: req.user, action: `score_${action}`, targetType: 'score', targetId: score._id,
    before, after: { finalScore: sub.finalScore, reviewStatus: sub.reviewStatus }, reason,
  });

  res.json({ success: true, data: score });
});

/* ===== Faculty OR selection override ===== */
export const selectOrAlternative = asyncHandler(async (req, res) => {
  const { scoreId } = req.params;
  const { groupIndex, selectedQuestionNo, reason } = req.body;
  if (!reason) throw BadRequest('Reason is required for OR selection');
  const score = await Score.findById(scoreId);
  if (!score) throw NotFound('Score not found');

  const existing = score.orSelections.find((o) => o.groupIndex === groupIndex);
  const before = existing ? { ...existing.toObject() } : null;
  if (existing) {
    existing.selectedQuestionNo = selectedQuestionNo;
    existing.selectedBy = 'faculty';
  } else {
    score.orSelections.push({ groupIndex, selectedQuestionNo, selectedBy: 'faculty' });
  }
  score.totalScore = recomputeTotal(score);
  await score.save();

  await recordAudit({
    actor: req.user, action: 'or_select', targetType: 'score', targetId: score._id,
    before, after: { groupIndex, selectedQuestionNo, selectedBy: 'faculty' }, reason,
  });
  res.json({ success: true, data: score });
});

/* ===== Publish results ===== */
export const publishResults = asyncHandler(async (req, res) => {
  const { examId } = req.params;
  const pending = await Score.countDocuments({ examId, 'subScores.reviewStatus': 'pending' });
  if (pending > 0) throw BadRequest(`Cannot publish: ${pending} score(s) still have pending mandatory review`);

  const result = await Score.updateMany(
    { examId },
    { published: true, publishedByName: req.user.name, publishedById: req.user.id, publishedAt: new Date() }
  );
  logger.info('Results published', { examId, count: result.modifiedCount, by: req.user.name });

  // Notify each student whose result was published (non-blocking, queued)
  try {
    const exam = await Exam.findById(examId);
    const scores = await Score.find({ examId, published: true }).populate('studentId', 'name email');
    for (const s of scores) {
      if (s.studentId?.email) {
        await enqueueEmail({
          to: s.studentId.email,
          ...resultPublishedEmail({ studentName: s.studentId.name, examTitle: exam.title, examType: exam.examType }),
        });
      }
    }
  } catch (err) {
    logger.error('Failed to queue result notifications', { examId, error: err.message });
  }

  res.json({ success: true, data: { published: result.modifiedCount } });
});

/* ===== Student result ===== */
export const getMyResult = asyncHandler(async (req, res) => {
  const score = await Score.findOne({ examId: req.params.examId, studentId: req.user.id, published: true });
  if (!score) throw NotFound('Result not published yet');

  // Build student-safe view: only selected OR sides, no model answers
  const selectedByGroup = {};
  score.orSelections.forEach((o) => { selectedByGroup[o.groupIndex] = o.selectedQuestionNo; });
  const visible = score.subScores.filter((s) => {
    const sel = selectedByGroup[s.groupIndex];
    return sel === undefined || s.questionNo === sel;
  }).map((s) => ({
    questionNo: s.questionNo, subLabel: s.subLabel, co: s.co, rbtl: s.rbtl,
    maxMarks: s.maxMarks, finalScore: s.finalScore, components: s.components,
    foundKeywords: s.foundKeywords, missingKeywords: s.missingKeywords,
    aiFeedback: s.aiFeedback, adjusted: s.reviewStatus === 'adjusted',
    spans: isProgrammingSub(s) ? null : (s.spans || []),  // #4 highlighted answer spans
    // Transparency view (#1 breakdown, #2 concept coverage, #3 NL feedback,
    // #5 confidence). Programming questions have no NLP components, so skip.
    transparency: isProgrammingSub(s) ? null : studentTransparency(s),
    // Score-change provenance (#8): if a human changed the AI's draft, show it.
    provenance: (s.reviewStatus === 'adjusted' || s.reviewStatus === 'approved') && s.aiScore != null && s.aiScore !== s.finalScore
      ? { aiDraft: s.aiScore, finalScore: s.finalScore, changedBy: s.reviewedByName || 'Faculty', reason: s.adjustReason || s.aiFeedback || null }
      : null,
  }));

  res.json({
    success: true,
    data: {
      totalScore: score.totalScore,
      subScores: visible,
      publishedByName: score.publishedByName || null,
      publishedAt: score.publishedAt || null,
    },
  });
});

/* ===== Appeals ===== */
export const createAppeal = asyncHandler(async (req, res) => {
  const score = await Score.findOne({ examId: req.body.examId, studentId: req.user.id, published: true });
  if (!score) throw NotFound('No published result to appeal');
  const appeal = await Appeal.create({
    scoreId: score._id, studentId: req.user.id, examId: req.body.examId,
    questionNo: req.body.questionNo, subLabel: req.body.subLabel,
    grounds: req.body.grounds, explanation: req.body.explanation,
  });
  logger.info('Appeal submitted', { appealId: appeal._id, studentId: req.user.id });
  res.status(201).json({ success: true, data: { reference: appeal._id, status: appeal.status } });
});

/** List appeals for faculty. Optional ?examId= and ?status= filters. */
export const listAppeals = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.examId) filter.examId = req.query.examId;
  if (req.query.status) filter.status = req.query.status;
  // Non-admins only see appeals for exams of courses they can access.
  if (req.user.role !== 'admin') {
    const all = await Course.find().select('offerings');
    const visIds = visibleCourses(all, req.user).map((c) => c._id);
    const examIds = await Exam.find({ courseId: { $in: visIds } }).distinct('_id');
    filter.examId = req.query.examId
      ? (examIds.some((id) => String(id) === String(req.query.examId)) ? req.query.examId : '__none__')
      : { $in: examIds };
  }
  const appeals = await Appeal.find(filter)
    .populate('studentId', 'name rollNo email')
    .populate('examId', 'title subjectCode examType')
    .sort({ createdAt: -1 });

  const data = appeals.map((a) => ({
    id: a._id,
    scoreId: a.scoreId,
    exam: a.examId ? { id: a.examId._id, title: a.examId.title, subjectCode: a.examId.subjectCode, examType: a.examId.examType } : null,
    student: a.studentId ? { name: a.studentId.name, rollNo: a.studentId.rollNo, email: a.studentId.email } : null,
    questionNo: a.questionNo,
    subLabel: a.subLabel,
    grounds: a.grounds,
    explanation: a.explanation,
    status: a.status,
    outcome: a.outcome,
    revisedScore: a.revisedScore,
    createdAt: a.createdAt,
  }));
  res.json({ success: true, data });
});

export const resolveAppeal = asyncHandler(async (req, res) => {
  const appeal = await Appeal.findById(req.params.id);
  if (!appeal) throw NotFound('Appeal not found');
  // Only admin or faculty mapped to the appeal's course may resolve it.
  const ex = await Exam.findById(appeal.examId).select('courseId');
  await assertCourseAccess(req.user, ex?.courseId, 'write');
  const { outcome, revisedScore, reason } = req.body;
  appeal.status = 'resolved';
  appeal.outcome = outcome;
  appeal.resolvedBy = req.user.id;

  if (outcome === 'revised') {
    const score = await Score.findById(appeal.scoreId);
    const sub = score.subScores.find((s) => s.questionNo === appeal.questionNo && s.subLabel === appeal.subLabel);
    if (sub) {
      const before = { finalScore: sub.finalScore };
      sub.finalScore = Math.min(Math.round(revisedScore), sub.maxMarks);
      sub.reviewStatus = 'adjusted';
      score.totalScore = recomputeTotal(score);
      await score.save();
      appeal.revisedScore = sub.finalScore;
      await recordAudit({
        actor: req.user, action: 'appeal_resolve', targetType: 'score', targetId: score._id,
        before, after: { finalScore: sub.finalScore }, reason,
      });
    }
  }
  await appeal.save();
  logger.info('Appeal resolved', { appealId: appeal._id, outcome });

  // Notify the student of the appeal outcome (non-blocking, queued)
  try {
    const [student, exam] = await Promise.all([
      User.findById(appeal.studentId, 'name email'),
      Exam.findById(appeal.examId, 'title'),
    ]);
    if (student?.email) {
      await enqueueEmail({
        to: student.email,
        ...appealResolvedEmail({ studentName: student.name, examTitle: exam?.title || 'your exam', outcome, revisedScore: appeal.revisedScore }),
      });
    }
  } catch (err) {
    logger.error('Failed to queue appeal notification', { appealId: appeal._id, error: err.message });
  }

  res.json({ success: true, data: appeal });
});

/* helper: total from selected OR sides + solos */
function recomputeTotal(score) {
  const selectedByGroup = {};
  score.orSelections.forEach((o) => { selectedByGroup[o.groupIndex] = o.selectedQuestionNo; });
  let total = 0;
  for (const s of score.subScores) {
    const sel = selectedByGroup[s.groupIndex];
    if (sel !== undefined && s.questionNo !== sel) continue;
    total += s.finalScore;
  }
  return Math.round(total * 10) / 10;
}

/* ===== Re-access requests (faculty) ===== */

/** List re-access requests for an exam (pending first). */
export const listReAccessRequests = asyncHandler(async (req, res) => {
  const { examId } = req.params;
  const subs = await Submission.find({
    examId,
    'reAccess.status': { $in: ['requested', 'approved', 'rejected'] },
  }).populate('studentId', 'name rollNo email').sort({ 'reAccess.requestedAt': -1 });

  const data = subs.map((s) => ({
    submissionId: s._id,
    student: s.studentId ? { name: s.studentId.name, rollNo: s.studentId.rollNo, email: s.studentId.email } : null,
    submissionStatus: s.status,
    reAccess: {
      status: s.reAccess?.status,
      reason: s.reAccess?.reason,
      requestedAt: s.reAccess?.requestedAt,
      decidedAt: s.reAccess?.decidedAt,
      decidedByName: s.reAccess?.decidedByName,
      decisionNote: s.reAccess?.decisionNote,
      used: s.reAccess?.used,
    },
  }));
  res.json({ success: true, data });
});

/** Approve or reject a re-access request. */
export const decideReAccess = asyncHandler(async (req, res) => {
  const { submissionId } = req.params;
  const { decision, note } = req.body || {};
  if (!['approve', 'reject'].includes(decision)) throw BadRequest('decision must be "approve" or "reject"');

  const submission = await Submission.findById(submissionId);
  if (!submission) throw NotFound('Submission not found');
  if (submission.reAccess?.status !== 'requested') throw BadRequest('No pending re-access request for this submission.');

  // Note: approval lets the student back in only while the exam window is still
  // open. The student paper-fetch (time-gated) enforces the window; if it has
  // closed by the time they try, they still cannot enter.
  submission.reAccess.status = decision === 'approve' ? 'approved' : 'rejected';
  submission.reAccess.decidedAt = new Date();
  submission.reAccess.decidedByName = req.user.name;
  submission.reAccess.decisionNote = note || '';
  await submission.save();

  await recordAudit({
    actor: req.user, action: `reaccess_${decision}`, targetType: 'submission', targetId: submission._id,
    before: null, after: { status: submission.reAccess.status }, reason: note || '',
  });
  logger.info('Re-access decided', { submissionId, decision, by: req.user.id });
  res.json({ success: true, data: { status: submission.reAccess.status } });
});

/* ===== Research data export: per-answer AI vs human scores as CSV =====
   Emits exactly the schema analysis/run_analysis.py expects (one row per scored
   sub-answer). Optional ?examId= to scope; descriptive answers only unless
   ?includeProgramming=true. Admin/faculty only. */
export const exportResearchCsv = asyncHandler(async (req, res) => {
  const { examId, includeProgramming } = req.query;
  if (examId) { await assertCourseAccess(req.user, (await Exam.findById(examId).select('courseId'))?.courseId, 'view'); }
  else if (req.user.role !== 'admin') { throw BadRequest('Specify an examId; only admins can export across all courses.'); }
  const filter = { published: true };
  if (examId) filter.examId = examId;
  const scores = await Score.find(filter).lean();

  const header = ['ai_score', 'final_score', 'max_marks', 'rbtl', 'co', 'cohort',
    'review_status', 'confidence', 'comp_cosine', 'comp_keywords', 'comp_style', 'comp_grammar'];
  const lines = [header.join(',')];

  const studentIds = [...new Set(scores.map((s) => String(s.studentId)))];
  const users = await User.find({ _id: { $in: studentIds } }).select('cohort').lean();
  const cohortById = Object.fromEntries(users.map((u) => [String(u._id), u.cohort || 'NA']));

  for (const s of scores) {
    const cohort = cohortById[String(s.studentId)] || 'NA';
    for (const sub of s.subScores || []) {
      if (isProgrammingSub(sub) && includeProgramming !== 'true') continue;
      const c = sub.components || {};
      lines.push([
        sub.aiScore ?? '', sub.finalScore ?? '', sub.maxMarks ?? '',
        sub.rbtl || '', sub.co || '', cohort, sub.reviewStatus || '',
        sub.confidence ?? '', c.cosine ?? '', c.keywords ?? '', c.style ?? '', c.grammar ?? '',
      ].map(csvEsc).join(','));
    }
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="evalai_research_export.csv"');
  res.send(lines.join('\n'));
});

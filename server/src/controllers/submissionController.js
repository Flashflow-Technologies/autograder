import { asyncHandler, NotFound, Forbidden, BadRequest } from '../utils/errors.js';
import QuestionPaper from '../models/QuestionPaper.js';
import { Submission } from '../models/index.js';
import { enqueueScoring } from '../services/jobDispatch.js';
import { ocrImage } from '../services/aiClient.js';
import { storeScan } from '../services/scanStore.js';
import { openQuestionImage } from '../services/questionImageStore.js';
import logger from '../utils/logger.js';

/**
 * Student view of the question paper — strips nothing scheme-related (the
 * scheme is a separate collection), but is only reachable through the
 * time-gate so it cannot be fetched before the exam opens.
 */
export const getExamPaperForStudent = asyncHandler(async (req, res) => {
  const paper = await QuestionPaper.findOne({ examId: req.exam._id });
  if (!paper) throw NotFound('Question paper not available');

  // Ensure a submission record exists (marks start time)
  let submission = await Submission.findOne({ examId: req.exam._id, studentId: req.user.id });
  if (!submission) {
    submission = await Submission.create({
      examId: req.exam._id, studentId: req.user.id, startedAt: new Date(), status: 'in_progress', answers: [],
    });
    logger.info('Submission started', { examId: req.exam._id, studentId: req.user.id });
  } else if (submission.status === 'submitted' || submission.status === 'scored') {
    // Already submitted. Only allow re-entry if faculty approved re-access AND it
    // hasn't been consumed yet. Once used, the grant is cleared, so reopening
    // again requires a fresh request + approval. (timeGate already confirmed the
    // exam window is still open.)
    if (submission.reAccess?.status === 'approved' && !submission.reAccess?.used) {
      submission.status = 'in_progress';
      submission.reAccess.used = true;
      submission.reAccess.status = 'none'; // consume the grant — single use
      await submission.save();
      logger.info('Student re-entered exam via approved re-access', { examId: req.exam._id, studentId: req.user.id });
    } else {
      throw Forbidden('You have already submitted this exam. Submit a re-access request if you need to reopen it.');
    }
  }

  const now = new Date();
  const remainingMs = req.exam.endTime.getTime() - now.getTime();

  // Return any previously-saved answers so the student resumes where they left
  // off (important for re-access after submission).
  const savedAnswers = (submission.answers || []).map((a) => ({
    groupIndex: a.groupIndex, questionNo: a.questionNo, subLabel: a.subLabel,
    inputMode: a.inputMode, rawText: a.rawText, ocrText: a.ocrText,
    scanFileId: a.scanFileId ? String(a.scanFileId) : undefined,
  }));

  // Build a student-safe copy of the paper: for programming questions, strip
  // testCases (they contain expected outputs and hidden tests) and rubric/limits
  // internals. Keep only what the student needs to answer.
  const safePaper = paper.toObject();
  for (const g of safePaper.groups || []) {
    for (const q of g.questions || []) {
      for (const s of q.subQuestions || []) {
        if (s.questionType === 'programming') {
          delete s.testCases;
          delete s.rubric;
          delete s.complexityThreshold;
          // language, starterCode, timeLimitSec, memoryLimitMb are fine to show.
        }
      }
    }
  }

  res.json({
    success: true,
    data: {
      exam: {
        title: req.exam.title, subjectCode: req.exam.subjectCode, examType: req.exam.examType,
        maxMarks: req.exam.maxMarks, endTime: req.exam.endTime,
      },
      paper: safePaper,
      savedAnswers,
      remainingSeconds: Math.max(0, Math.floor(remainingMs / 1000)),
      submissionId: submission._id,
    },
  });
});

/**
 * Serve a question image to a student. Reached only through the time-gate
 * (route middleware), so images are unavailable before/after the exam window.
 * We verify the requested image id actually belongs to this exam's paper so a
 * student cannot fetch arbitrary stored images.
 */
export const serveQuestionImageStudent = asyncHandler(async (req, res) => {
  const { fileId } = req.params;
  const paper = await QuestionPaper.findOne({ examId: req.exam._id });
  if (!paper) throw NotFound('Question paper not available');
  const belongs = (paper.groups || []).some((g) =>
    (g.questions || []).some((q) =>
      (q.subQuestions || []).some((s) => s.imageFileId && String(s.imageFileId) === String(fileId))
    )
  );
  if (!belongs) throw NotFound('Image not part of this exam');

  let result;
  try { result = await openQuestionImage(fileId); }
  catch { throw NotFound('Image not found'); }
  res.setHeader('Content-Type', result.file.contentType || 'image/png');
  res.setHeader('Cache-Control', 'private, max-age=300');
  result.stream.on('error', () => res.status(404).end()).pipe(res);
});

/** Auto-save answers during the exam (time-gated). */
export const saveAnswers = asyncHandler(async (req, res) => {
  const submission = await Submission.findOne({ examId: req.exam._id, studentId: req.user.id });
  if (!submission) throw NotFound('No active submission — start the exam first');
  if (submission.status !== 'in_progress') throw Forbidden('Submission already finalised');

  submission.answers = req.body.answers;
  await submission.save();
  res.json({ success: true, data: { saved: submission.answers.length, at: new Date() } });
});

/** Final submit (time-gated). Enqueues scoring. */
export const submitExam = asyncHandler(async (req, res) => {
  const submission = await Submission.findOne({ examId: req.exam._id, studentId: req.user.id });
  if (!submission) throw NotFound('No active submission');
  if (submission.status !== 'in_progress') throw Forbidden('Already submitted');

  if (Array.isArray(req.body.answers)) submission.answers = req.body.answers;
  submission.status = 'submitted';
  submission.submittedAt = new Date();
  submission.submitMode = req.body.submitMode === 'auto_timeout' ? 'auto_timeout' : 'manual';
  await submission.save();
  logger.info('Exam submitted', { submissionId: submission._id, mode: submission.submitMode });

  // Enqueue scoring (BullMQ worker, or inline fallback). Never fails the submit.
  await enqueueScoring(submission._id);

  res.json({ success: true, data: { submittedAt: submission.submittedAt, status: 'submitted' } });
});

/**
 * OCR a scanned/photographed handwritten answer. Stores the original image in
 * GridFS (so faculty can later verify the OCR against the real handwriting) and
 * returns the extracted text plus the stored scanFileId. The student's UI
 * pre-fills the answer textbox with the text and attaches the scanFileId +
 * inputMode:'scanned' to that answer, which travels through the normal save/submit.
 */
export const ocrAnswer = asyncHandler(async (req, res) => {
  if (!req.file) throw BadRequest('No image uploaded. Attach a file under the "image" field.');

  const { buffer, originalname, mimetype, size } = req.file;
  if (!/^image\//.test(mimetype)) throw BadRequest('Uploaded file must be an image (jpg, png, etc.)');
  if (!buffer || size === 0) throw BadRequest('Uploaded image is empty.');

  // Store the original image first so it is preserved even if OCR yields nothing.
  let scanFileId;
  try {
    scanFileId = await storeScan(buffer, originalname || 'scan.png', mimetype, {
      studentId: String(req.user.id),
      examId: String(req.exam._id),
      uploadedAt: new Date(),
    });
  } catch (err) {
    logger.error('Scan storage failed', { studentId: req.user.id, error: err.message });
    throw BadRequest('Could not store the uploaded image. Please try again.');
  }

  const text = await ocrImage(buffer, originalname || 'scan.png');
  logger.info('OCR answer extracted', { studentId: req.user.id, chars: text.length, scanFileId, file: originalname });

  // ocrImage returns '' on failure (AI service down / unreadable). The image is
  // still stored, so faculty can read it manually — we just warn the student.
  res.json({
    success: true,
    data: {
      text,
      scanFileId,
      warning: text.trim() ? undefined
        : 'Could not extract text automatically. Your scan was saved and faculty will see it — you can also type the answer.',
    },
  });
});

/* ===== Re-access workflow ===== */

/** Student requests to reopen an already-submitted exam. */
export const requestReAccess = asyncHandler(async (req, res) => {
  const { examId } = req.params;
  const { reason } = req.body || {};
  const submission = await Submission.findOne({ examId, studentId: req.user.id });
  if (!submission) throw NotFound('No submission found for this exam');
  if (submission.status === 'in_progress') throw BadRequest('This exam is already open for you.');
  if (submission.reAccess?.status === 'requested') throw BadRequest('A re-access request is already pending.');
  if (submission.reAccess?.status === 'approved' && !submission.reAccess?.used) {
    throw BadRequest('Re-access was already approved — reopen the exam from your dashboard.');
  }
  submission.reAccess = {
    status: 'requested',
    reason: reason || '',
    requestedAt: new Date(),
    used: false,
  };
  await submission.save();
  logger.info('Re-access requested', { examId, studentId: req.user.id });
  res.json({ success: true, data: { status: 'requested' } });
});

/** Student checks their own submission status (locked? request pending?). */
export const getMySubmissionStatus = asyncHandler(async (req, res) => {
  const { examId } = req.params;
  const submission = await Submission.findOne({ examId, studentId: req.user.id });
  if (!submission) { res.json({ success: true, data: { status: 'not_started' } }); return; }
  const ra = submission.reAccess || {};
  const submitted = submission.status === 'submitted' || submission.status === 'scored';
  // A fresh, unused approval means the student can reopen now.
  const canResume = submitted && ra.status === 'approved' && !ra.used;
  // They may request (again) if submitted and there is no pending/usable grant.
  const canRequest = submitted && ra.status !== 'requested' && !canResume;
  res.json({
    success: true,
    data: {
      status: submission.status,
      reAccess: ra.status || 'none',
      reAccessUsed: !!ra.used,
      canResume,
      canRequest,
      reAccessNote: ra.decisionNote || null,
    },
  });
});


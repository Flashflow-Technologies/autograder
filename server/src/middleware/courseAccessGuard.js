import Exam from '../models/Exam.js';
import { Submission, Score } from '../models/index.js';
import { assertCourseAccess } from '../services/courseAccess.js';
import { asyncHandler, NotFound } from '../utils/errors.js';

/**
 * Course-access enforcement middleware (Build B, defense-in-depth).
 *
 * Each factory resolves the owning course from a route parameter, then calls
 * assertCourseAccess (admin=all, mapped-faculty=write/view, HOD=view-only). It
 * throws Forbidden/NotFound before the handler runs, so every downstream
 * exam/assessment action is protected regardless of entry point.
 *
 * `action` is 'view' or 'write'. Read-only endpoints pass 'view' so HODs can see
 * their department's data; mutating endpoints pass 'write' (faculty-mapped only).
 */

/** Enforce via an exam id in req.params[paramName]. */
export const enforceExam = (paramName = 'examId', action = 'write') => asyncHandler(async (req, res, next) => {
  const exam = await Exam.findById(req.params[paramName]).select('courseId');
  if (!exam) throw NotFound('Exam not found.');
  await assertCourseAccess(req.user, exam.courseId, action);
  req._exam = exam;
  next();
});

/** Enforce via a Score id (score -> exam -> course). */
export const enforceScore = (paramName = 'scoreId', action = 'write') => asyncHandler(async (req, res, next) => {
  const score = await Score.findById(req.params[paramName]).select('examId');
  if (!score) throw NotFound('Score not found.');
  await assertCourseAccess(req.user, (await examCourseId(score.examId)), action);
  next();
});

/** Enforce via a Submission id (submission -> exam -> course). */
export const enforceSubmission = (paramName = 'submissionId', action = 'write') => asyncHandler(async (req, res, next) => {
  const sub = await Submission.findById(req.params[paramName]).select('examId');
  if (!sub) throw NotFound('Submission not found.');
  await assertCourseAccess(req.user, (await examCourseId(sub.examId)), action);
  next();
});

// Helper: resolve an exam's courseId (small extra lookup kept explicit for clarity).
async function examCourseId(examId) {
  const exam = await Exam.findById(examId).select('courseId');
  if (!exam) throw NotFound('Exam not found.');
  return exam.courseId;
}

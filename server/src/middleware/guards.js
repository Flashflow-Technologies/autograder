import { asyncHandler, NotFound, Forbidden, BadRequest } from '../utils/errors.js';
import Exam from '../models/Exam.js';
import logger from '../utils/logger.js';

/**
 * Server-authoritative exam time gate. The client clock is never trusted.
 * Attaches req.exam for downstream handlers. `mode` decides which check runs:
 *  - 'enter'  : student starting the exam (respects grace period)
 *  - 'open'   : saving/submitting answers (whole window)
 */
export const timeGate = (mode = 'open') =>
  asyncHandler(async (req, _res, next) => {
    const examId = req.params.examId || req.body.examId;
    if (!examId) throw BadRequest('examId is required');

    const exam = await Exam.findById(examId);
    if (!exam) throw NotFound('Exam not found');
    if (exam.status === 'draft') throw Forbidden('Exam is not yet published');

    // Cohort targeting: a student may only access an exam that targets their
    // cohort. Empty exam.cohorts = open to all cohorts (backward compatible).
    if (req.user?.role === 'student' && Array.isArray(exam.cohorts) && exam.cohorts.length > 0) {
      if (!req.user.cohort || !exam.cohorts.includes(req.user.cohort)) {
        throw Forbidden('This exam is not assigned to your batch.');
      }
    }

    const now = new Date();
    const allowed = mode === 'enter' ? exam.canEnter(now) : exam.isOpen(now);

    if (!allowed) {
      logger.warn('Time-gate blocked access', {
        examId,
        userId: req.user?.id,
        now: now.toISOString(),
        startTime: exam.startTime.toISOString(),
        endTime: exam.endTime.toISOString(),
        mode,
      });
      const reason = now < exam.startTime ? 'Exam has not started yet'
        : now >= exam.endTime ? 'Exam window has closed'
        : 'Entry grace period has passed';
      throw Forbidden(reason);
    }

    req.exam = exam;
    next();
  });

/** Joi validation middleware factory. Validates req[source] against a schema. */
export const validate = (schema, source = 'body') => (req, _res, next) => {
  const { error, value } = schema.validate(req[source], { abortEarly: false, stripUnknown: true });
  if (error) {
    return next(BadRequest('Request validation failed', error.details.map((d) => d.message)));
  }
  req[source] = value;
  next();
};

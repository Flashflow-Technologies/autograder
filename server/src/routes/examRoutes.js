import { Router } from 'express';
import multer from 'multer';
import * as ctrl from '../controllers/examController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { requireActiveLicense } from '../middleware/license.js';
import { validate } from '../middleware/guards.js';
import { enforceExam } from '../middleware/courseAccessGuard.js';
import { courseSchema, examSchema, examUpdateSchema, questionPaperSchema, schemeSchema } from '../validators/schemas.js';

// Notes upload for draft-question generation: in-memory, 15MB cap (lecture
// notes/PDFs can be larger than a single answer scan), single file.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
});

const router = Router();
router.use(authenticate);

/**
 * @swagger
 * /courses:
 *   post:
 *     tags: [Courses]
 *     summary: Create a course with COs and CO-PO-PSO matrix (admin/faculty)
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { type: object } } }
 *     responses:
 *       201: { description: Course created }
 *       422: { description: Validation failed (e.g. more than 5 COs) }
 *   get:
 *     tags: [Courses]
 *     summary: List all courses
 *     responses:
 *       200: { description: Array of courses }
 */
router.post('/courses', authorize('admin'), validate(courseSchema), ctrl.createCourse);
router.get('/courses', ctrl.listCourses);
router.delete('/courses/:id', authorize('admin'), ctrl.deleteCourse);
router.put('/courses/:id/offerings', authorize('admin'), ctrl.setCourseOfferings);
router.put('/courses/:id/targets', authorize('faculty', 'hod', 'admin'), ctrl.setCourseTargets);

/**
 * @swagger
 * /courses/{id}:
 *   get:
 *     tags: [Courses]
 *     summary: Get a course by id
 *     parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Course }
 *       404: { description: Not found }
 *   put:
 *     tags: [Courses]
 *     summary: Update a course (admin/faculty)
 *     parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Updated }
 */
router.get('/courses/:id', ctrl.getCourse);
router.put('/courses/:id', authorize('admin', 'faculty'), ctrl.updateCourse);

/**
 * @swagger
 * /exams:
 *   post:
 *     tags: [Exams]
 *     summary: Create an exam schedule (faculty). Sets title, code, type, date, time, duration.
 *     responses:
 *       201: { description: Exam draft created }
 *   get:
 *     tags: [Exams]
 *     summary: List exams (filter by courseId, status)
 *     parameters:
 *       - { name: courseId, in: query, schema: { type: string } }
 *       - { name: status, in: query, schema: { type: string } }
 *     responses:
 *       200: { description: Array of exams }
 */
router.post('/exams', authorize('faculty', 'admin'), requireActiveLicense, validate(examSchema), ctrl.createExam);
router.get('/exams', ctrl.listExams);

/**
 * @swagger
 * /exams/{id}:
 *   get:
 *     tags: [Exams]
 *     summary: Get exam with computed endTime
 *     parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Exam }
 */
router.get('/exams/:id', ctrl.getExam);

/**
 * @swagger
 * /exams/{id}:
 *   put:
 *     tags: [Exams]
 *     summary: Update an exam's schedule/metadata (draft or scheduled only)
 *     description: Edit title, type, date, start time, duration, grace period, max marks or venue. Blocked once the exam is active or closed.
 *     parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               gracePeriodMins: { type: number }
 *               startTime: { type: string, format: date-time }
 *               durationMins: { type: number }
 *               maxMarks: { type: number }
 *               venue: { type: string }
 *     responses:
 *       200: { description: Updated exam }
 *       400: { description: Exam is active/closed and cannot be edited }
 *       404: { description: Not found }
 */
router.put('/exams/:id', authorize('faculty', 'admin'), enforceExam('id', 'write'), validate(examUpdateSchema), ctrl.updateExam);
router.delete('/exams/:id', authorize('faculty', 'admin'), enforceExam('id', 'write'), ctrl.deleteExam);

/**
 * @swagger
 * /exams/{id}/publish:
 *   post:
 *     tags: [Exams]
 *     summary: Publish an exam (requires paper + published scheme)
 *     parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Exam scheduled }
 *       400: { description: Missing paper or scheme }
 */
router.post('/exams/:id/publish', authorize('faculty', 'admin'), enforceExam('id', 'write'), ctrl.publishExam);

/**
 * @swagger
 * /exams/{examId}/paper:
 *   put:
 *     tags: [Exams]
 *     summary: Create/update the question paper (enforces OR CO·RBTL·marks equivalence)
 *     parameters: [{ name: examId, in: path, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Paper saved }
 *       422: { description: OR equivalence violated }
 *   get:
 *     tags: [Exams]
 *     summary: Get the question paper (faculty)
 *     parameters: [{ name: examId, in: path, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Paper }
 */
router.put('/exams/:examId/paper', authorize('faculty', 'admin'), enforceExam('examId', 'write'), validate(questionPaperSchema), ctrl.upsertQuestionPaper);
router.get('/exams/:examId/paper', authorize('faculty', 'admin'), enforceExam('examId', 'view'), ctrl.getQuestionPaper);
router.get('/exams/:examId/scheme-layout', authorize('faculty', 'admin'), enforceExam('examId', 'view'), ctrl.getExamScheme);

/**
 * @swagger
 * /exams/{examId}/generate-questions:
 *   post:
 *     tags: [Exams]
 *     summary: Generate DRAFT questions from uploaded notes (PDF/DOCX), clamped to CO ceilings. Returns drafts; saves nothing.
 *     parameters: [{ name: examId, in: path, required: true, schema: { type: string } }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema: { type: object, properties: { file: { type: string, format: binary }, spec: { type: string } } }
 *     responses:
 *       200: { description: Draft questions with any ceiling adjustments }
 */
router.post('/exams/:examId/generate-questions', authorize('faculty', 'admin'), enforceExam('examId', 'write'), upload.single('file'), ctrl.generateDraftQuestions);

/**
 * @swagger
 * /exams/{examId}/draft-answer:
 *   post:
 *     tags: [Exams]
 *     summary: Draft an extractive model answer for one question from stored module notes (faculty edits before saving).
 *     parameters: [{ name: examId, in: path, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Draft answer text }
 */
router.post('/exams/:examId/draft-answer', authorize('faculty', 'admin'), enforceExam('examId', 'write'), ctrl.draftAnswerForQuestion);

// Question images (figures/diagrams attached to a sub-question)
router.post('/exams/:examId/question-image', authorize('faculty', 'admin'), enforceExam('examId', 'write'), upload.single('image'), ctrl.uploadQuestionImage);
router.get('/question-image/:fileId', authorize('faculty', 'admin'), ctrl.serveQuestionImageFaculty);

// Download formatted question paper / scheme of valuation as .docx
router.get('/exams/:examId/download/paper', authorize('faculty', 'admin'), enforceExam('examId', 'view'), ctrl.downloadQuestionPaper);
router.get('/exams/:examId/download/scheme', authorize('faculty', 'admin'), enforceExam('examId', 'view'), ctrl.downloadScheme);

/**
 * @swagger
 * /exams/{examId}/scheme:
 *   put:
 *     tags: [Exams]
 *     summary: Create/update the marking scheme (weights must sum to 100 per entry)
 *     parameters: [{ name: examId, in: path, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Scheme saved }
 *   get:
 *     tags: [Exams]
 *     summary: Get the marking scheme (faculty only — never exposed to students)
 *     parameters: [{ name: examId, in: path, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Scheme }
 */
router.put('/exams/:examId/scheme', authorize('faculty', 'admin'), enforceExam('examId', 'write'), validate(schemeSchema), ctrl.upsertScheme);
router.get('/exams/:examId/scheme', authorize('faculty', 'admin'), enforceExam('examId', 'view'), ctrl.getScheme);

export default router;

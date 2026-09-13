import { Router } from 'express';
import multer from 'multer';
import * as ctrl from '../controllers/submissionController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, timeGate } from '../middleware/guards.js';
import { saveAnswersSchema, submitSchema } from '../validators/schemas.js';

// In-memory storage: the image is OCR'd then discarded; we never persist it.
// 8MB cap covers a high-res phone photo while bounding memory per request.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
});

const router = Router();
router.use(authenticate, authorize('student'));

/**
 * @swagger
 * /submissions/{examId}/paper:
 *   get:
 *     tags: [Submissions]
 *     summary: Get the exam paper to answer (time-gated — respects start + grace)
 *     parameters: [{ name: examId, in: path, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Paper, remaining time, submission id }
 *       403: { description: Outside the exam window, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
router.get('/:examId/paper', timeGate('enter'), ctrl.getExamPaperForStudent);
router.get('/:examId/question-image/:fileId', timeGate('enter'), ctrl.serveQuestionImageStudent);

// Re-access: a student may request to reopen an already-submitted exam. The
// request itself is NOT time-gated (they can ask after the window if needed),
// but actually re-entering the paper IS time-gated by the /paper route.
router.get('/:examId/my-status', ctrl.getMySubmissionStatus);
router.post('/:examId/request-reaccess', ctrl.requestReAccess);

/**
 * @swagger
 * /submissions/{examId}/save:
 *   put:
 *     tags: [Submissions]
 *     summary: Auto-save answers during the exam (time-gated)
 *     parameters: [{ name: examId, in: path, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { type: object, properties: { answers: { type: array } } } } }
 *     responses:
 *       200: { description: Saved }
 *       403: { description: Window closed }
 */
router.put('/:examId/save', timeGate('open'), validate(saveAnswersSchema), ctrl.saveAnswers);

/**
 * @swagger
 * /submissions/{examId}/submit:
 *   post:
 *     tags: [Submissions]
 *     summary: Submit the exam (time-gated). Triggers async NLP scoring.
 *     parameters: [{ name: examId, in: path, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Submitted }
 *       403: { description: Window closed or already submitted }
 */
router.post('/:examId/submit', timeGate('open'), validate(submitSchema), ctrl.submitExam);

/**
 * @swagger
 * /submissions/{examId}/ocr:
 *   post:
 *     tags: [Submissions]
 *     summary: OCR a scanned/photographed handwritten answer; returns extracted text (time-gated)
 *     parameters: [{ name: examId, in: path, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema: { type: object, properties: { image: { type: string, format: binary } } }
 *     responses:
 *       200: { description: Extracted text (may be empty with a warning) }
 *       400: { description: Missing or non-image file }
 *       403: { description: Window closed }
 */
router.post('/:examId/ocr', timeGate('open'), upload.single('image'), ctrl.ocrAnswer);

export default router;

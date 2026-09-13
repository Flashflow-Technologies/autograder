import { Router } from 'express';
import * as ctrl from '../controllers/evaluationController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/guards.js';
import { enforceExam, enforceScore, enforceSubmission } from '../middleware/courseAccessGuard.js';
import { reviewSchema, orSelectSchema, appealSchema, resolveAppealSchema } from '../validators/schemas.js';

const router = Router();
router.use(authenticate);

/**
 * @swagger
 * /scoring/{submissionId}/run:
 *   post:
 *     tags: [Scoring]
 *     summary: Manually trigger NLP scoring for a submission (faculty)
 *     parameters: [{ name: submissionId, in: path, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Score document }
 */
router.post('/scoring/:submissionId/run', authorize('faculty', 'admin'), enforceSubmission('submissionId', 'write'), ctrl.triggerScoring);

/**
 * @swagger
 * /review/{examId}/queue:
 *   get:
 *     tags: [Review]
 *     summary: Get the review queue grouped into mandatory / spot-check / auto
 *     parameters: [{ name: examId, in: path, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Queue }
 */
router.get('/review/:examId/queue', authorize('faculty', 'admin'), enforceExam('examId', 'view'), ctrl.getReviewQueue);

/**
 * @swagger
 * /review/{examId}/students:
 *   get:
 *     tags: [Review]
 *     summary: List students for an exam with review status and total score
 *     parameters: [{ name: examId, in: path, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Array of students with scoreId, totalScore, reviewState, pendingCount }
 */
router.get('/review/:examId/students', authorize('faculty', 'admin'), enforceExam('examId', 'view'), ctrl.getReviewStudents);

/**
 * @swagger
 * /review/{examId}/export:
 *   get:
 *     tags: [Review]
 *     summary: Download a consolidated CSV report (Roll No, Name, per-CO marks, Total)
 *     parameters: [{ name: examId, in: path, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: CSV file (text/csv) }
 */
router.get('/review/:examId/export', authorize('faculty', 'admin'), enforceExam('examId', 'view'), ctrl.exportScoresCsv);
router.get('/research/export', authorize('faculty', 'admin'), ctrl.exportResearchCsv);

/**
 * @swagger
 * /audit/export:
 *   get:
 *     tags: [Review]
 *     summary: Download the audit trail as CSV (optionally scoped to one exam via ?examId=)
 *     parameters:
 *       - { name: examId, in: query, required: false, schema: { type: string } }
 *     responses:
 *       200: { description: CSV file of audit entries }
 */
router.get('/audit/export', authorize('faculty', 'admin'), ctrl.exportAuditCsv);

/**
 * @swagger
 * /review/student/{scoreId}:
 *   get:
 *     tags: [Review]
 *     summary: Full review detail for one student — answers, AI scores, justification
 *     parameters: [{ name: scoreId, in: path, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Student answers with per-question AI score, feedback and keywords }
 *       404: { description: Score not found }
 */
router.get('/review/student/:scoreId', authorize('faculty', 'admin'), enforceScore('scoreId', 'view'), ctrl.getStudentReview);

/**
 * @swagger
 * /review/scan/{fileId}:
 *   get:
 *     tags: [Review]
 *     summary: Stream a stored answer scan image (faculty review)
 *     parameters: [{ name: fileId, in: path, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Image bytes }
 *       404: { description: Not found }
 */
router.get('/review/scan/:fileId', authorize('faculty', 'admin'), ctrl.serveScan);

/**
 * @swagger
 * /review/student/{scoreId}/state:
 *   post:
 *     tags: [Review]
 *     summary: Save per-student review progress (save and continue)
 *     parameters: [{ name: scoreId, in: path, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { reviewState: { type: string, enum: [not_started, in_progress, completed] } } }
 *     responses:
 *       200: { description: Saved }
 */
router.post('/review/student/:scoreId/state', authorize('faculty', 'admin'), enforceScore('scoreId', 'write'), ctrl.setReviewState);

/**
 * @swagger
 * /review/{scoreId}/subscore:
 *   post:
 *     tags: [Review]
 *     summary: Accept, adjust (with reason), or flag a sub-score. Logged to audit trail.
 *     parameters: [{ name: scoreId, in: path, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               questionNo: { type: number }
 *               subLabel: { type: string }
 *               action: { type: string, enum: [accept, adjust, flag] }
 *               newScore: { type: number }
 *               reason: { type: string }
 *     responses:
 *       200: { description: Updated score }
 *       400: { description: Invalid score or missing reason }
 */
router.post('/review/:scoreId/subscore', authorize('faculty', 'admin'), enforceScore('scoreId', 'write'), validate(reviewSchema), ctrl.reviewSubScore);

/**
 * @swagger
 * /review/{scoreId}/or-select:
 *   post:
 *     tags: [Review]
 *     summary: Override the OR alternative selection (reason required, audited)
 *     parameters: [{ name: scoreId, in: path, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Updated score }
 */
router.post('/review/:scoreId/or-select', authorize('faculty', 'admin'), enforceScore('scoreId', 'write'), validate(orSelectSchema), ctrl.selectOrAlternative);

/**
 * @swagger
 * /review/{examId}/publish:
 *   post:
 *     tags: [Review]
 *     summary: Publish all results for an exam (blocked if mandatory reviews pending). Computes attainment.
 *     parameters: [{ name: examId, in: path, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Published count }
 *       400: { description: Pending mandatory reviews remain }
 */
router.post('/review/:examId/publish', authorize('faculty', 'admin'), enforceExam('examId', 'write'), ctrl.publishResults);

// Re-access requests management (faculty)
router.get('/reaccess/:examId', authorize('faculty', 'admin'), enforceExam('examId', 'view'), ctrl.listReAccessRequests);
router.post('/reaccess/decide/:submissionId', authorize('faculty', 'admin'), enforceSubmission('submissionId', 'write'), ctrl.decideReAccess);

/**
 * @swagger
 * /attainment/{examId}:
 *   get:
 *     tags: [Attainment]
 *     summary: Compute and return CO/PO/PSO attainment and CI actions
 *     parameters:
 *       - { name: examId, in: path, required: true, schema: { type: string } }
 *       - { name: thresholdPct, in: query, schema: { type: number } }
 *       - { name: coTargetPct, in: query, schema: { type: number } }
 *     responses:
 *       200: { description: Attainment snapshot }
 */

/**
 * @swagger
 * /results/{examId}/me:
 *   get:
 *     tags: [Results]
 *     summary: Student's own published result (selected OR sides only, no model answers)
 *     parameters: [{ name: examId, in: path, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Result with feedback }
 *       404: { description: Not published yet }
 */
router.get('/results/:examId/me', authorize('student'), ctrl.getMyResult);

/**
 * @swagger
 * /results/appeal:
 *   post:
 *     tags: [Results]
 *     summary: Submit a re-evaluation appeal (student)
 *     responses:
 *       201: { description: Appeal reference }
 */
router.post('/results/appeal', authorize('student'), validate(appealSchema), ctrl.createAppeal);
router.get('/appeals', authorize('faculty', 'admin'), ctrl.listAppeals);

/**
 * @swagger
 * /results/appeal/{id}/resolve:
 *   post:
 *     tags: [Results]
 *     summary: Resolve an appeal (faculty). Revised outcome updates score + attainment.
 *     parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Resolved appeal }
 */
router.post('/results/appeal/:id/resolve', authorize('faculty', 'admin'), validate(resolveAppealSchema), ctrl.resolveAppeal);

export default router;

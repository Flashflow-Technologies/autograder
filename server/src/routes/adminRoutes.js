import { Router } from 'express';
import multer from 'multer';
import * as ctrl from '../controllers/adminController.js';
import * as org from '../controllers/orgController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

const router = Router();
// Scope the admin guard to /admin/* ONLY. Without the path, this router-level
// middleware runs for every /api/* request (since the router is mounted at
// /api), and its next(Forbidden) short-circuits other routers — which was
// wrongly blocking faculty/student routes like /my-assessments with
// "Requires role: admin".
router.use('/admin', authenticate, authorize('admin'));

// Bulk user import (CSV/Excel)
router.get('/admin/users/import/template', ctrl.downloadImportTemplate);
router.post('/admin/users/import/preview', upload.single('file'), ctrl.previewImport);
router.post('/admin/users/import/confirm', ctrl.confirmImport);
router.post('/admin/users/single', ctrl.createSingleUser);
router.put('/admin/users/:id', ctrl.updateUser);
router.post('/admin/users/move-batch', ctrl.moveBatch);

// Departments
router.get('/admin/departments', org.listDepartments);
router.post('/admin/departments', org.createDepartment);
router.patch('/admin/departments/:id', org.updateDepartment);
router.delete('/admin/departments/:id', org.deleteDepartment);
router.get('/admin/departments/:id/members', org.departmentMembers);
router.post('/admin/departments/:id/map', org.mapUsersToDepartment);

// Institute settings + statements
router.get('/admin/institute', org.getInstitute);
router.patch('/admin/institute', org.updateInstitute);
router.post('/admin/institute/seed', org.seedInstitute);
router.post('/admin/departments/:id/seed', org.seedDepartment);
// Upload a reference document (PDF/DOCX) -> detected sections for admin review
router.post('/admin/parse-reference', upload.single('file'), org.parseReferenceDocument);

// Users dashboard
router.get('/admin/users', ctrl.listUsers);
router.get('/admin/mappable-faculty', ctrl.listMappableFaculty);
router.get('/admin/users/facets', ctrl.userFacets);

// Audit-log dashboard
router.get('/admin/audit', ctrl.listAuditLogs);
router.get('/admin/audit/facets', ctrl.auditFacets);
router.get('/admin/audit/verify', ctrl.verifyAudit);          // #7 tamper-evidence check

// Accountability analytics
router.get('/admin/analytics/bias', ctrl.getBiasMonitor);      // #9 bias monitoring
router.get('/admin/analytics/agreement', ctrl.getAgreementReport); // #10 AI-vs-human agreement

export default router;

import { Router } from 'express';
import * as ctrl from '../controllers/licenseController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// Any authenticated user can read licence status (to show expiry banners).
router.get('/license/status', ctrl.getLicenseStatus);
router.get('/license/plans', authorize('admin'), ctrl.getPlans);
// Only admins can install/renew a licence.
router.post('/license/install', authorize('admin'), ctrl.installLicense);
// Admin: check for updates (gated on active licence inside the service).
router.get('/license/updates', authorize('admin'), ctrl.checkUpdates);

export default router;

import { asyncHandler, BadRequest } from '../utils/errors.js';
import { getLicence, applyLicence, isEnforced, PLANS } from '../services/licenseService.js';
import { checkForUpdates, getCurrentVersion } from '../services/updateService.js';
import logger from '../utils/logger.js';

/** Current licence status — readable by any authenticated user (to show banners). */
export const getLicenseStatus = asyncHandler(async (req, res) => {
  const lic = getLicence();
  res.json({
    success: true,
    data: {
      status: lic.status,
      plan: lic.plan,
      planLabel: lic.planLabel,
      institution: lic.institution,
      expiresAt: lic.expiresAt,
      daysLeft: lic.daysLeft,
      enforced: isEnforced(),
      message: lic.message,
      features: lic.features || null,
      limits: lic.limits || null,
    },
  });
});

/** Admin pastes a renewed licence key to activate it. */
export const installLicense = asyncHandler(async (req, res) => {
  const { key } = req.body || {};
  if (!key || typeof key !== 'string') throw BadRequest('A licence key is required.');
  const result = applyLicence(key.trim());
  if (result.status !== 'active') {
    throw BadRequest(result.message || `Licence is ${result.status}.`);
  }
  logger.info('Licence installed via admin', { institution: result.institution, plan: result.plan });
  // NOTE: this activates the licence for the running process. To persist across
  // restarts, the admin should also set LICENSE_KEY in the server environment.
  res.json({
    success: true,
    data: {
      status: result.status, plan: result.plan, planLabel: result.planLabel,
      institution: result.institution, expiresAt: result.expiresAt, daysLeft: result.daysLeft,
    },
    message: 'Licence activated. To keep it across restarts, also set LICENSE_KEY in the server environment.',
  });
});

/** Plan catalogue (for display on the licence screen). */
export const getPlans = asyncHandler(async (req, res) => {
  const plans = Object.entries(PLANS).map(([key, p]) => ({ key, label: p.label, limits: p.limits, features: p.features }));
  res.json({ success: true, data: plans });
});

/** Admin: current version + check the vendor server for an available update.
 *  Lapsed/expired licences are told updates require renewal. */
export const checkUpdates = asyncHandler(async (req, res) => {
  const result = await checkForUpdates();
  res.json({ success: true, data: { ...result, current: result.current || getCurrentVersion() } });
});

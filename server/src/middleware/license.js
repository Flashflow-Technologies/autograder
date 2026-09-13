import { Forbidden } from '../utils/errors.js';
import { isActive, hasFeature, isEnforced } from '../services/licenseService.js';

/**
 * Block an action when the licence isn't active (expired/missing/invalid).
 * Used on privileged, create-type actions — NOT on reads, so an expired licence
 * never locks an institution out of its existing data.
 */
export const requireActiveLicense = (req, res, next) => {
  if (!isEnforced()) return next();
  if (isActive()) return next();
  return next(Forbidden('Your EvalAI licence is inactive or expired. Existing data remains accessible, but new actions are disabled until the licence is renewed.'));
};

/**
 * Gate a capability behind a plan feature flag (e.g. programming questions on
 * tiers that include them). Returns a middleware.
 */
export const requireFeature = (flag, label) => (req, res, next) => {
  if (!isEnforced()) return next();
  if (hasFeature(flag)) return next();
  return next(Forbidden(`Your current plan does not include ${label || flag}. Please upgrade your EvalAI plan.`));
};

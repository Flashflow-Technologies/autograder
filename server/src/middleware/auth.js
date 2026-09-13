import jwt from 'jsonwebtoken';
import { asyncHandler, Unauthorized, Forbidden } from '../utils/errors.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';

export function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
}

/** Verify the bearer token and attach req.user. Throws 401 on any failure. */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw Unauthorized('Missing bearer token');

  const decoded = jwt.verify(token, process.env.JWT_SECRET); // throws -> caught -> 401
  const user = await User.findById(decoded.id);
  if (!user || !user.active) {
    logger.warn('Auth rejected: user not found or inactive', { userId: decoded.id });
    throw Unauthorized('User no longer exists or is inactive');
  }
  req.user = { id: user._id.toString(), role: user.role, name: user.name, cohort: user.cohort };
  next();
});

/** Restrict a route to one or more roles. */
export const authorize = (...roles) => (req, _res, next) => {
  if (!req.user) return next(Unauthorized());
  if (!roles.includes(req.user.role)) {
    logger.warn('Authorization denied', { userId: req.user.id, role: req.user.role, required: roles });
    return next(Forbidden(`Requires role: ${roles.join(' or ')}`));
  }
  next();
};

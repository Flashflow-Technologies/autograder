import { asyncHandler, BadRequest, Unauthorized, Conflict } from '../utils/errors.js';
import { signToken } from '../middleware/auth.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';

export const register = asyncHandler(async (req, res) => {
  const { name, email, password, role, rollNo, employeeId, department, cohort, consentGiven } = req.body;
  const exists = await User.findOne({ email });
  if (exists) throw Conflict('Email already registered');

  // Students use rollNo; faculty/admin use employeeId. Never store empty strings
  // (they would collide on the sparse unique indexes).
  const ident = {};
  if (role === 'student') {
    if (rollNo) ident.rollNo = rollNo;
  } else if (employeeId) {
    ident.employeeId = employeeId;
  }

  const user = new User({ name, email, role, ...ident, department, cohort, consentGiven });
  await user.setPassword(password);
  await user.save();
  logger.info('User registered', { userId: user._id, role });
  res.status(201).json({ success: true, data: user });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user || !(await user.verifyPassword(password))) {
    logger.warn('Failed login attempt', { email });
    throw Unauthorized('Invalid email or password');
  }
  if (!user.active) throw Unauthorized('Account is inactive');
  const token = signToken(user);
  logger.info('User logged in', { userId: user._id, role: user.role });
  res.json({ success: true, data: { token, user } });
});

export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw Unauthorized();
  res.json({ success: true, data: user });
});

/** Change own password. Verifies the current password, sets the new one, and
 *  clears the mustChangePassword flag. Used both for the forced first-login
 *  change and voluntary changes. */
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) throw BadRequest('New password must be at least 8 characters.');
  const user = await User.findById(req.user.id).select('+passwordHash');
  if (!user) throw Unauthorized('Not authenticated.');
  if (!(await user.verifyPassword(currentPassword || ''))) throw BadRequest('Current password is incorrect.');
  if (currentPassword === newPassword) throw BadRequest('New password must be different from the current one.');
  await user.setPassword(newPassword);
  user.mustChangePassword = false;
  await user.save();
  logger.info('Password changed', { userId: user._id });
  res.json({ success: true, data: { changed: true } });
});

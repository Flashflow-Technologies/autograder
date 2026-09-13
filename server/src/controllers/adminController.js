import { asyncHandler, NotFound, BadRequest } from '../utils/errors.js';
import User from '../models/User.js';
import { AuditLog } from '../models/index.js';
import { verifyAuditChain } from '../services/auditService.js';
import { biasMonitor, agreementReport } from '../services/accountabilityAnalytics.js';

/**
 * Admin: list users with filters + pagination.
 * Query params: role, department, cohort, active ('true'/'false'), q (name/email/
 * rollNo/employeeId search), page, limit.
 */
/**
 * All faculty/HOD users across every department, each labelled with their home
 * department, for the course-offering faculty picker. This lets an admin map a
 * faculty member from ANY department into a course offering (e.g. a Maths
 * faculty teaching Mathematics to a CSE batch under the CSE offering).
 */
/**
 * Admin: update an existing user's editable details (name, department, cohort/
 * batch, section, roll/employee id, active status). Does not touch password or
 * role here. Audited. Used by the Users dashboard edit action.
 */
export const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw NotFound('User not found');

  const before = { name: user.name, department: user.department, cohort: user.cohort, section: user.section, rollNo: user.rollNo, employeeId: user.employeeId, active: user.active };

  const editable = ['name', 'department', 'cohort', 'section', 'rollNo', 'employeeId', 'active'];
  const changes = {};
  for (const field of editable) {
    if (req.body[field] !== undefined) {
      const val = typeof req.body[field] === 'string' ? req.body[field].trim() : req.body[field];
      user[field] = val === '' ? undefined : val;
      changes[field] = user[field];
    }
  }

  // If email is being changed, ensure it stays unique.
  if (req.body.email !== undefined && req.body.email.trim() && req.body.email.trim() !== user.email) {
    const clash = await User.findOne({ email: req.body.email.trim(), _id: { $ne: user._id } });
    if (clash) throw BadRequest('Another user already has that email.');
    user.email = req.body.email.trim();
    changes.email = user.email;
  }

  await user.save();
  await recordAudit({
    actor: { id: req.user.id, role: req.user.role }, action: 'update_user',
    targetType: 'user', targetId: user._id, before, after: changes, reason: req.body.reason || 'Admin edit user details',
  });
  res.json({ success: true, data: { _id: user._id, name: user.name, email: user.email, role: user.role, department: user.department, cohort: user.cohort, section: user.section, rollNo: user.rollNo, employeeId: user.employeeId, active: user.active } });
});

/**
 * Admin: bulk-move students from one cohort (batch) to another, optionally
 * filtering by section. For promoting/correcting a whole batch at once.
 * body: { fromCohort, toCohort, section? }
 */
export const moveBatch = asyncHandler(async (req, res) => {
  const { fromCohort, toCohort, section } = req.body;
  if (!fromCohort || !toCohort) throw BadRequest('fromCohort and toCohort are required.');
  const filter = { role: 'student', cohort: fromCohort };
  if (section) filter.section = section;
  const result = await User.updateMany(filter, { $set: { cohort: toCohort } });
  await recordAudit({
    actor: { id: req.user.id, role: req.user.role }, action: 'move_batch',
    targetType: 'cohort', targetId: fromCohort, after: { fromCohort, toCohort, section: section || 'all', moved: result.modifiedCount }, reason: req.body.reason || 'Batch move',
  });
  res.json({ success: true, data: { moved: result.modifiedCount, fromCohort, toCohort, section: section || null } });
});

export const listMappableFaculty = asyncHandler(async (req, res) => {
  const users = await User.find({ role: { $in: ['faculty', 'hod'] }, active: { $ne: false } })
    .populate('departmentId', 'code name')
    .sort({ name: 1 })
    .select('name email role employeeId departmentId')
    .lean();
  const data = users.map((u) => ({
    _id: String(u._id),
    name: u.name,
    email: u.email,
    role: u.role,
    employeeId: u.employeeId,
    departmentId: u.departmentId ? String(u.departmentId._id) : null,
    departmentCode: u.departmentId?.code || null,
    departmentName: u.departmentId?.name || null,
  }));
  res.json({ success: true, data });
});

export const listUsers = asyncHandler(async (req, res) => {
  const { role, department, cohort, active, q } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));

  const filter = {};
  if (role) filter.role = role;
  if (department) filter.department = department;
  if (cohort) filter.cohort = cohort;
  if (active === 'true') filter.active = true;
  if (active === 'false') filter.active = false;
  if (q) {
    const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { rollNo: rx }, { employeeId: rx }];
  }

  const total = await User.countDocuments(filter);
  if (req.query.unassigned === 'true') filter.departmentId = { $exists: false };
  const users = await User.find(filter)
    .sort({ role: 1, name: 1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .select('name email role rollNo employeeId department departmentId cohort active createdAt');

  res.json({
    success: true,
    data: {
      users,
      page, limit, total,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * Admin: distinct filter values + per-role counts, to populate the dashboard's
 * filter dropdowns and summary chips.
 */
export const userFacets = asyncHandler(async (req, res) => {
  const [departments, cohorts, sections, roleCounts, activeCount, inactiveCount] = await Promise.all([
    User.distinct('department', { department: { $nin: [null, ''] } }),
    User.distinct('cohort', { cohort: { $nin: [null, ''] } }),
    User.distinct('section', { section: { $nin: [null, ''] } }),
    User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
    User.countDocuments({ active: true }),
    User.countDocuments({ active: false }),
  ]);
  const byRole = {};
  roleCounts.forEach((r) => { byRole[r._id] = r.count; });
  res.json({
    success: true,
    data: {
      departments: departments.sort(),
      cohorts: cohorts.sort(),
      sections: sections.sort(),
      byRole,
      total: Object.values(byRole).reduce((a, b) => a + b, 0),
      active: activeCount,
      inactive: inactiveCount,
    },
  });
});

/**
 * Admin: list audit-log entries with filters + pagination.
 * Query params: action, actorRole, targetType, actorId, from, to (ISO dates),
 * q (action/targetType search), page, limit.
 */
export const listAuditLogs = asyncHandler(async (req, res) => {
  const { action, actorRole, targetType, actorId, from, to, q } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));

  const filter = {};
  if (action) filter.action = action;
  if (actorRole) filter.actorRole = actorRole;
  if (targetType) filter.targetType = targetType;
  if (actorId) filter.actorId = actorId;
  if (from || to) {
    filter.timestamp = {};
    if (from) filter.timestamp.$gte = new Date(from);
    if (to) filter.timestamp.$lte = new Date(to);
  }
  if (q) {
    const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ action: rx }, { targetType: rx }, { reason: rx }];
  }

  const total = await AuditLog.countDocuments(filter);
  const logs = await AuditLog.find(filter)
    .populate('actorId', 'name email role')
    .sort({ timestamp: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  res.json({
    success: true,
    data: { logs, page, limit, total, pages: Math.ceil(total / limit) },
  });
});

/** Admin: distinct audit actions / target types for the logs filter dropdowns. */
export const auditFacets = asyncHandler(async (req, res) => {
  const [actions, targetTypes, actorRoles] = await Promise.all([
    AuditLog.distinct('action'),
    AuditLog.distinct('targetType', { targetType: { $nin: [null, ''] } }),
    AuditLog.distinct('actorRole', { actorRole: { $nin: [null, ''] } }),
  ]);
  res.json({
    success: true,
    data: { actions: actions.sort(), targetTypes: targetTypes.sort(), actorRoles: actorRoles.sort() },
  });
});

/** #7 Verify the audit log's tamper-evident hash chain. */
export const verifyAudit = asyncHandler(async (req, res) => {
  const result = await verifyAuditChain();
  res.json({ success: true, data: result });
});

/** #9 Bias-monitoring analytics across cohorts (flags for human review). */
export const getBiasMonitor = asyncHandler(async (req, res) => {
  const data = await biasMonitor({ examId: req.query.examId });
  res.json({ success: true, data });
});

/** #10 AI-vs-human agreement report by Bloom level. */
export const getAgreementReport = asyncHandler(async (req, res) => {
  const data = await agreementReport({ examId: req.query.examId });
  res.json({ success: true, data });
});

/* ============ Bulk user import (CSV/Excel) ============ */
import {
  parseBuffer, validateRows, generatePassword,
  buildTemplateBuffer, buildCredentialsBuffer,
} from '../services/userImportService.js';
import { recordAudit } from '../services/auditService.js';

/** Download the import template (xlsx). */
export const downloadImportTemplate = asyncHandler(async (req, res) => {
  const buf = buildTemplateBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="user_import_template.xlsx"');
  res.send(buf);
});

/** Step 1: upload → parse → validate (incl. DB-existence) → return PREVIEW.
 *  Does NOT create anything. */
export const previewImport = asyncHandler(async (req, res) => {
  if (!req.file) throw BadRequest('No file uploaded.');
  const { rows } = parseBuffer(req.file.buffer);
  if (!rows.length) throw BadRequest('No data rows found. Check the file has a header row and at least one record.');

  const validated = validateRows(rows);

  // DB-existence checks: flag emails/identifiers that already exist.
  const emails = validated.map((r) => r.normalized.email).filter(Boolean);
  const rolls = validated.map((r) => r.normalized.rollNo).filter(Boolean);
  const emps = validated.map((r) => r.normalized.employeeId).filter(Boolean);
  const existing = await User.find({
    $or: [{ email: { $in: emails } }, { rollNo: { $in: rolls } }, { employeeId: { $in: emps } }],
  }).select('email rollNo employeeId').lean();
  const exEmail = new Set(existing.map((u) => u.email));
  const exRoll = new Set(existing.map((u) => u.rollNo).filter(Boolean));
  const exEmp = new Set(existing.map((u) => u.employeeId).filter(Boolean));

  for (const r of validated) {
    if (exEmail.has(r.normalized.email)) { r.errors.push('Email already exists in the system.'); r.status = 'error'; }
    if (r.normalized.rollNo && exRoll.has(r.normalized.rollNo)) { r.errors.push('Register number already exists.'); r.status = 'error'; }
    if (r.normalized.employeeId && exEmp.has(r.normalized.employeeId)) { r.errors.push('Employee ID already exists.'); r.status = 'error'; }
  }

  const okCount = validated.filter((r) => r.status === 'ok').length;
  res.json({
    success: true,
    data: {
      total: validated.length,
      okCount,
      errorCount: validated.length - okCount,
      rows: validated,
    },
  });
});

/** Step 2: confirm → create the valid rows with generated passwords → return a
 *  credentials sheet (base64 xlsx) + summary. The client re-sends the validated
 *  OK rows (normalized) so we don't rely on server session state. */
export const confirmImport = asyncHandler(async (req, res) => {
  const incoming = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!incoming.length) throw BadRequest('No rows to import.');

  const created = [];
  const failed = [];
  for (const row of incoming) {
    try {
      const { name, email, role, department, cohort, section, rollNo, employeeId } = row;
      if (!name || !email || !role) { failed.push({ email, reason: 'Missing required fields' }); continue; }
      // Guard against races/duplicates created since preview.
      const clash = await User.findOne({ $or: [{ email }, ...(rollNo ? [{ rollNo }] : []), ...(employeeId ? [{ employeeId }] : [])] });
      if (clash) { failed.push({ email, reason: 'Already exists' }); continue; }

      const tempPassword = generatePassword();
      const ident = {};
      if (role === 'student' && rollNo) ident.rollNo = rollNo;
      if (['faculty', 'hod', 'admin'].includes(role) && employeeId) ident.employeeId = employeeId;

      const user = new User({ name, email, role, department, cohort, section, ...ident, mustChangePassword: true });
      await user.setPassword(tempPassword);
      await user.save();
      created.push({ name, email, role, identifier: rollNo || employeeId || '', tempPassword });
    } catch (e) {
      failed.push({ email: row.email, reason: e.message });
    }
  }

  await recordAudit({
    actor: { id: req.user.id, role: req.user.role }, action: 'bulk_user_import',
    targetType: 'user', targetId: null,
    after: { created: created.length, failed: failed.length },
    reason: `Bulk import: ${created.length} created, ${failed.length} failed`,
  });

  const credentialsB64 = created.length ? buildCredentialsBuffer(created).toString('base64') : null;
  res.json({
    success: true,
    data: {
      createdCount: created.length,
      failedCount: failed.length,
      failed,
      // credentials returned once, for the admin to download & distribute securely
      credentialsFileBase64: credentialsB64,
      credentialsFilename: 'user_credentials.xlsx',
    },
  });
});

/** Single-add form (one-off): create one user with a generated password. */
export const createSingleUser = asyncHandler(async (req, res) => {
  const validated = validateRows([req.body]);
  const r = validated[0];
  if (r.status !== 'ok') throw BadRequest(r.errors.join(' '));

  const clash = await User.findOne({ email: r.normalized.email });
  if (clash) throw BadRequest('Email already exists.');

  const tempPassword = generatePassword();
  const user = new User({ ...r.normalized, mustChangePassword: true });
  await user.setPassword(tempPassword);
  await user.save();
  await recordAudit({ actor: { id: req.user.id, role: req.user.role }, action: 'create_user', targetType: 'user', targetId: user._id, after: { email: user.email, role: user.role }, reason: 'Single user add' });
  res.status(201).json({ success: true, data: { user: { _id: user._id, name: user.name, email: user.email, role: user.role }, tempPassword } });
});

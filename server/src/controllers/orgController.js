import { asyncHandler, BadRequest, NotFound } from '../utils/errors.js';
import Department from '../models/Department.js';
import Institute from '../models/Institute.js';
import User from '../models/User.js';
import { PO_KEYS } from '../models/Course.js';
import { recordAudit } from '../services/auditService.js';

const PO_ID_KEYS = PO_KEYS.filter((k) => k.startsWith('PO'));
const PSO_ID_KEYS = PO_KEYS.filter((k) => k.startsWith('PSO'));

/* ===================== DEPARTMENTS ===================== */

export const listDepartments = asyncHandler(async (req, res) => {
  const depts = await Department.find().sort({ code: 1 }).lean();
  // attach member counts
  const withCounts = await Promise.all(depts.map(async (d) => {
    const faculty = await User.countDocuments({ departmentId: d._id, role: { $in: ['faculty', 'hod'] } });
    const students = await User.countDocuments({ departmentId: d._id, role: 'student' });
    return { ...d, facultyCount: faculty, studentCount: students };
  }));
  res.json({ success: true, data: withCounts });
});

/** Create a department and optionally map existing users to it now. */
export const createDepartment = asyncHandler(async (req, res) => {
  const { name, code, facultyIds = [], studentIds = [] } = req.body;
  if (!name || !code) throw BadRequest('Department name and code are required.');

  const exists = await Department.findOne({ code: code.toUpperCase() });
  if (exists) throw BadRequest(`A department with code ${code.toUpperCase()} already exists.`);

  const dept = await Department.create({
    name, code,
    programOutcomes: PO_ID_KEYS.map((k) => ({ key: k, statement: '' })),
    programSpecificOutcomes: PSO_ID_KEYS.map((k) => ({ key: k, statement: '' })),
  });

  // Optional immediate mapping of existing users.
  const toMap = [...new Set([...facultyIds, ...studentIds].map(String))];
  if (toMap.length) {
    await User.updateMany({ _id: { $in: toMap } }, { $set: { departmentId: dept._id, department: dept.code } });
  }

  await recordAudit({ actor: { id: req.user.id, role: req.user.role }, action: 'create_department', targetType: 'department', targetId: dept._id, after: { code: dept.code, mapped: toMap.length }, reason: 'Department created' });
  res.status(201).json({ success: true, data: dept });
});

export const updateDepartment = asyncHandler(async (req, res) => {
  const dept = await Department.findById(req.params.id);
  if (!dept) throw NotFound('Department not found.');
  const { name, active, vision, mission, peos, wks, academicObjectives, programOutcomes, programSpecificOutcomes } = req.body;
  if (name != null) dept.name = name;
  if (active != null) dept.active = active;
  if (Array.isArray(vision)) dept.vision = vision;
  if (Array.isArray(mission)) dept.mission = mission;
  if (Array.isArray(peos)) dept.peos = peos;
  if (Array.isArray(wks)) dept.wks = wks;
  if (Array.isArray(academicObjectives)) dept.academicObjectives = academicObjectives;
  // PO/PSO: text-only edits against stable keys.
  if (Array.isArray(programOutcomes)) {
    const byKey = Object.fromEntries(programOutcomes.map((o) => [o.key, o.statement]));
    dept.programOutcomes = dept.programOutcomes.map((o) => ({ key: o.key, statement: byKey[o.key] ?? o.statement }));
  }
  if (Array.isArray(programSpecificOutcomes)) {
    const byKey = Object.fromEntries(programSpecificOutcomes.map((o) => [o.key, o.statement]));
    dept.programSpecificOutcomes = dept.programSpecificOutcomes.map((o) => ({ key: o.key, statement: byKey[o.key] ?? o.statement }));
  }
  await dept.save();
  res.json({ success: true, data: dept });
});

/** Map/unmap users to a department (add or remove members after creation). */
export const mapUsersToDepartment = asyncHandler(async (req, res) => {
  const dept = await Department.findById(req.params.id);
  if (!dept) throw NotFound('Department not found.');
  const { addUserIds = [], removeUserIds = [] } = req.body;

  if (addUserIds.length) {
    await User.updateMany({ _id: { $in: addUserIds } }, { $set: { departmentId: dept._id, department: dept.code } });
  }
  if (removeUserIds.length) {
    await User.updateMany({ _id: { $in: removeUserIds }, departmentId: dept._id }, { $unset: { departmentId: '', department: '' } });
  }
  await recordAudit({ actor: { id: req.user.id, role: req.user.role }, action: 'map_department_users', targetType: 'department', targetId: dept._id, after: { added: addUserIds.length, removed: removeUserIds.length }, reason: 'Department membership updated' });
  res.json({ success: true, data: { added: addUserIds.length, removed: removeUserIds.length } });
});

/** Members + assignable (unassigned or other-dept) users, for the mapping UI. */
export const departmentMembers = asyncHandler(async (req, res) => {
  const dept = await Department.findById(req.params.id).lean();
  if (!dept) throw NotFound('Department not found.');
  const members = await User.find({ departmentId: dept._id }).select('name email role rollNo employeeId').lean();
  const unassigned = await User.find({ departmentId: { $exists: false }, role: { $in: ['faculty', 'hod', 'student'] } })
    .select('name email role rollNo employeeId').lean();
  res.json({ success: true, data: { members, unassigned } });
});

export const deleteDepartment = asyncHandler(async (req, res) => {
  const dept = await Department.findById(req.params.id);
  if (!dept) throw NotFound('Department not found.');
  const memberCount = await User.countDocuments({ departmentId: dept._id });
  if (memberCount > 0) throw BadRequest(`Cannot delete: ${memberCount} user(s) are still mapped to this department. Unmap them first.`);
  await dept.deleteOne();
  res.json({ success: true, data: { deleted: true } });
});

/* ===================== INSTITUTE ===================== */

export const getInstitute = asyncHandler(async (req, res) => {
  const inst = await Institute.getOrCreate();
  res.json({ success: true, data: inst });
});

/** Update institute name and/or the statement collections. Accepts partial
 *  updates: any provided field replaces that collection. */
export const updateInstitute = asyncHandler(async (req, res) => {
  const inst = await Institute.getOrCreate();
  const { name, vision, mission } = req.body;
  if (name != null) inst.name = name;
  if (Array.isArray(vision)) inst.vision = vision;
  if (Array.isArray(mission)) inst.mission = mission;
  await inst.save();
  res.json({ success: true, data: inst });
});

/* ===================== SEEDING (from reference document) ===================== */
import { INSTITUTE_SEED, DEPARTMENT_SEED } from '../data/orgSeed.js';

/** Seed institute-level statements (name stays manual; vision/mission seeded). */
export const seedInstitute = asyncHandler(async (req, res) => {
  const inst = await Institute.getOrCreate();
  const overwrite = req.query.overwrite === 'true';
  if (overwrite || !inst.vision?.length) inst.vision = INSTITUTE_SEED.vision;
  if (overwrite || !inst.mission?.length) inst.mission = INSTITUTE_SEED.mission;
  await inst.save();
  res.json({ success: true, data: inst });
});

/** Seed a department's full statement set (Vision/Mission + PO/PSO/PEO/WK/
 *  Academic Objectives) from the reference document. Non-destructive by default. */
export const seedDepartment = asyncHandler(async (req, res) => {
  const dept = await Department.findById(req.params.id);
  if (!dept) throw NotFound('Department not found.');
  const overwrite = req.query.overwrite === 'true';

  if (overwrite || !dept.vision?.length) dept.vision = DEPARTMENT_SEED.vision;
  if (overwrite || !dept.mission?.length) dept.mission = DEPARTMENT_SEED.mission;
  if (overwrite || !dept.peos?.length) dept.peos = DEPARTMENT_SEED.peos;
  if (overwrite || !dept.wks?.length) dept.wks = DEPARTMENT_SEED.wks;
  if (overwrite || !dept.academicObjectives?.length) dept.academicObjectives = DEPARTMENT_SEED.academicObjectives;

  const applyText = (target, seed) => {
    const byKey = Object.fromEntries(seed.map((o) => [o.key, o.statement]));
    return (target || []).map((o) => ({ key: o.key, statement: (overwrite || !o.statement) ? (byKey[o.key] ?? o.statement) : o.statement }));
  };
  dept.programOutcomes = applyText(dept.programOutcomes, DEPARTMENT_SEED.programOutcomes);
  dept.programSpecificOutcomes = applyText(dept.programSpecificOutcomes, DEPARTMENT_SEED.programSpecificOutcomes);
  await dept.save();
  res.json({ success: true, data: dept });
});

/* ============ Parse an uploaded reference document (suggestions only) ============ */
import { parseOrgDocument } from '../services/aiClient.js';

/** Upload a PDF/DOCX; returns detected sections for admin review. Applies nothing. */
export const parseReferenceDocument = asyncHandler(async (req, res) => {
  if (!req.file) throw BadRequest('No file uploaded.');
  const name = (req.file.originalname || '').toLowerCase();
  if (!name.endsWith('.pdf') && !name.endsWith('.docx')) {
    throw BadRequest('Please upload a .pdf or .docx file.');
  }
  const result = await parseOrgDocument(req.file.buffer, req.file.originalname);
  res.json({ success: true, data: result });
});

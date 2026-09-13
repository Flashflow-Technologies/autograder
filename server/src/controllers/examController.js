import { asyncHandler, NotFound, BadRequest, Forbidden } from '../utils/errors.js';
import Course, { COURSE_TYPE_DEFAULTS, courseTypeKey } from '../models/Course.js';
import Exam from '../models/Exam.js';
import QuestionPaper from '../models/QuestionPaper.js';
import User from '../models/User.js';
import { Scheme, Submission, Score } from '../models/index.js';
import { enqueueEmail } from '../services/jobDispatch.js';
import { examScheduledEmail } from '../services/notificationService.js';
import { isEnforced, hasFeature } from '../services/licenseService.js';
import { deriveCoCeiling, isRbtlWithinCeiling, rbtlRank, RBTL_LEVELS } from '../utils/bloom.js';
import { generateQuestions, draftAnswerFromNotes } from '../services/aiClient.js';
import { schemeForExamType, expectedModules } from '../utils/examScheme.js';
import { validatePaperScheme } from '../utils/paperSchemeValidator.js';
import ModuleNotes from '../models/ModuleNotes.js';
import { storeQuestionImage, openQuestionImage } from '../services/questionImageStore.js';
import QuestionBank from '../models/QuestionBank.js';
import { recordAndAnnotate } from '../services/questionBank.js';
import { buildQuestionPaperDocx, buildSchemeDocx } from '../services/paperDocx.js';
import logger from '../utils/logger.js';
import { visibleCourses, isFacultyMapped, courseInDepartment, assertCourseAccess } from '../services/courseAccess.js';

/**
 * For each CO without an explicit maxRbtl, derive it from the statement's verbs.
 * Statements with no recognisable Bloom's verb are left null — the UI requires
 * faculty to set those manually before the course can be used to build exams.
 */
function fillCoCeilings(cos) {
  if (!Array.isArray(cos)) return cos;
  return cos.map((co) => {
    if (co.maxRbtl) return co; // faculty set it explicitly — respect it
    const derived = deriveCoCeiling(co.description);
    return { ...co, maxRbtl: derived.level || undefined };
  });
}

/* ===== Courses ===== */
export const createCourse = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  if (body.cos) body.cos = fillCoCeilings(body.cos);
  // Apply the per-type defaults (active components + blend weights) unless the
  // request already provides them. Faculty can edit afterwards.
  const key = courseTypeKey(body.courseType || 'PCC', body.aecType);
  const defaults = COURSE_TYPE_DEFAULTS[key];
  if (defaults) {
    if (body.componentsActive === undefined) body.componentsActive = { ...defaults.components };
    if (body.hasPractical === undefined) body.hasPractical = defaults.hasPractical;
    if (body.attainmentWeights === undefined) body.attainmentWeights = { ...defaults.weights };
  }
  // Admin creates the course; faculty are assigned via offerings, not here.
  const course = await Course.create(body);
  logger.info('Course created', { courseId: course._id, code: course.code });
  res.status(201).json({ success: true, data: course });
});

export const listCourses = asyncHandler(async (req, res) => {
  const all = await Course.find().sort({ code: 1 });
  // Faculty see only mapped courses; HOD sees their department's; admin sees all.
  const courses = visibleCourses(all, req.user);
  res.json({ success: true, data: courses });
});

export const getCourse = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) throw NotFound('Course not found');
  // View access: admin, mapped faculty, or HOD of an offering department.
  if (req.user.role !== 'admin' && !isFacultyMapped(course, req.user.id) && !courseInDepartment(course, req.user.departmentId)) {
    throw Forbidden('You do not have access to this course.');
  }
  res.json({ success: true, data: course });
});

export const updateCourse = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  if (body.cos) body.cos = fillCoCeilings(body.cos);
  // Only admin or a mapped faculty may modify a course.
  const existing = await Course.findById(req.params.id);
  if (!existing) throw NotFound('Course not found');
  if (req.user.role !== 'admin' && !isFacultyMapped(existing, req.user.id)) {
    throw Forbidden('You are not mapped to this course.');
  }
  const course = await Course.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
  logger.info('Course updated', { courseId: course._id });
  res.json({ success: true, data: course });
});


/** Admin-only: delete a course (blocked if it has exams/assessments). */
export const deleteCourse = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) throw NotFound('Course not found');
  const examCount = await Exam.countDocuments({ courseId: course._id });
  if (examCount > 0) throw BadRequest(`Cannot delete: ${examCount} exam(s) exist for this course. Remove them first.`);
  await course.deleteOne();
  logger.info('Course deleted', { courseId: course._id, code: course.code });
  res.json({ success: true, data: { deleted: true } });
});

/** Admin-only: set the course's offerings (departments + per-dept faculty). */
export const setCourseOfferings = asyncHandler(async (req, res) => {
  const { offerings } = req.body; // [{ departmentId, facultyIds: [] }]
  const course = await Course.findById(req.params.id);
  if (!course) throw NotFound('Course not found');
  course.offerings = offerings || [];
  await course.save();
  logger.info('Course offerings updated', { courseId: course._id, offerings: (offerings || []).length });
  res.json({ success: true, data: course });
});

/**
 * Set attainment targets for a course. Faculty (mapped to the course) and HoD
 * (owning the department) may configure these; admin too. Supports all four
 * modes via a single shape: course-level defaults plus optional per-CO overrides.
 *   body: {
 *     defaultThresholdPct, defaultCoTargetPct,
 *     coTargets: [{ coId, thresholdPct?, coTargetPct? }]   // overrides; omit a
 *                field to inherit the course default for that CO
 *   }
 */
export const setCourseTargets = asyncHandler(async (req, res) => {
  await assertCourseAccess(req.user, req.params.id, 'targets');
  const course = await Course.findById(req.params.id);
  if (!course) throw NotFound('Course not found');

  const { defaultThresholdPct, defaultCoTargetPct, coTargets, attainmentWeights, isAutonomous } = req.body;
  const clamp = (v) => (v == null ? undefined : Math.max(1, Math.min(100, Number(v))));

  if (defaultThresholdPct != null) course.defaultThresholdPct = clamp(defaultThresholdPct);
  if (defaultCoTargetPct != null) course.defaultCoTargetPct = clamp(defaultCoTargetPct);

  // Attainment blend weights (theory/practical/assessment sub-weights + CIE:SEE).
  if (attainmentWeights && typeof attainmentWeights === 'object') {
    const aw = course.attainmentWeights || {};
    const num = (v, min, max) => (v == null ? undefined : Math.max(min, Math.min(max, Number(v))));
    if (attainmentWeights.theory != null) aw.theory = num(attainmentWeights.theory, 0, 1000);
    if (attainmentWeights.practical != null) aw.practical = num(attainmentWeights.practical, 0, 1000);
    if (attainmentWeights.assessment != null) aw.assessment = num(attainmentWeights.assessment, 0, 1000);
    if (attainmentWeights.ciePct != null) aw.ciePct = num(attainmentWeights.ciePct, 0, 100);
    if (attainmentWeights.seePct != null) aw.seePct = num(attainmentWeights.seePct, 0, 100);
    course.attainmentWeights = aw;
    course.markModified('attainmentWeights');
  }
  if (isAutonomous != null) course.isAutonomous = !!isAutonomous;

  // Editable attainment-level band table + blend mode.
  if (Array.isArray(req.body.levelBands)) {
    const bands = req.body.levelBands
      .filter((b) => b && b.minPct != null && b.level != null)
      .map((b) => ({ minPct: Number(b.minPct), level: Number(b.level) }))
      .sort((a, b) => b.minPct - a.minPct);
    if (bands.length) { course.levelBands = bands; course.markModified('levelBands'); }
  }
  if (req.body.levelFallback != null) course.levelFallback = Number(req.body.levelFallback);
  if (req.body.blendMode && ['levels', 'percentages'].includes(req.body.blendMode)) course.blendMode = req.body.blendMode;
  if (Array.isArray(req.body.assessmentPlan)) { course.assessmentPlan = req.body.assessmentPlan; course.markModified('assessmentPlan'); }

  // Course type / AEC sub-type. Changing the type re-applies its default active
  // components and weights UNLESS the request also supplies its own values.
  const typeChanged = req.body.courseType && req.body.courseType !== course.courseType;
  const aecChanged = req.body.aecType && req.body.aecType !== course.aecType;
  if (req.body.courseType) course.courseType = req.body.courseType;
  if (req.body.aecType) course.aecType = req.body.aecType;
  if (typeChanged || aecChanged) {
    const key = courseTypeKey(course.courseType, course.aecType);
    const defaults = COURSE_TYPE_DEFAULTS[key];
    if (defaults) {
      if (req.body.componentsActive === undefined) { course.componentsActive = { ...defaults.components }; course.markModified('componentsActive'); }
      if (req.body.attainmentWeights === undefined) { course.attainmentWeights = { ...course.attainmentWeights, ...defaults.weights }; course.markModified('attainmentWeights'); }
      course.hasPractical = defaults.hasPractical;
    }
  }
  // Explicit component toggles (faculty override).
  if (req.body.componentsActive && typeof req.body.componentsActive === 'object') {
    course.componentsActive = { ...course.componentsActive, ...req.body.componentsActive };
    course.markModified('componentsActive');
  }

  // Apply per-CO overrides. An explicit null clears an override (CO reverts to
  // the course default); a number sets it; an absent field is left unchanged.
  if (Array.isArray(coTargets)) {
    const byId = {};
    coTargets.forEach((t) => { byId[t.coId] = t; });
    course.cos = course.cos.map((co) => {
      const t = byId[co.coId];
      if (!t) return co;
      const next = co.toObject ? co.toObject() : { ...co };
      if ('thresholdPct' in t) next.thresholdPct = t.thresholdPct == null ? undefined : clamp(t.thresholdPct);
      if ('coTargetPct' in t) next.coTargetPct = t.coTargetPct == null ? undefined : clamp(t.coTargetPct);
      return next;
    });
  }

  await course.save();
  logger.info('Course attainment targets updated', { courseId: course._id, by: req.user.role });
  res.json({ success: true, data: course });
});

/* ===== Exams (schedule) ===== */
export const createExam = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.body.courseId);
  if (!course) throw NotFound('Course not found');
  // Only admin or a faculty mapped to this course may create its exams.
  if (req.user.role !== 'admin' && !isFacultyMapped(course, req.user.id)) {
    throw Forbidden('You are not mapped to this course, so you cannot create its exams.');
  }
  const exam = await Exam.create({ ...req.body, createdBy: req.user.id, status: 'draft' });
  logger.info('Exam created', { examId: exam._id, examType: exam.examType });
  res.status(201).json({ success: true, data: exam });
});

export const listExams = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.courseId) filter.courseId = req.query.courseId;
  if (req.query.status) filter.status = req.query.status;
  // Course-scoping applies to faculty and HOD only. Students see exams by status
  // AND cohort targeting (their actual submission access is enforced at submission
  // time via timeGate / paper fetch); admin sees all.
  if (req.user.role === 'faculty' || req.user.role === 'hod') {
    const all = await Course.find().select('offerings');
    const visibleIds = visibleCourses(all, req.user).map((c) => c._id);
    filter.courseId = req.query.courseId
      ? (visibleIds.some((id) => String(id) === String(req.query.courseId)) ? req.query.courseId : '__none__')
      : { $in: visibleIds };
  } else if (req.user.role === 'student') {
    // A student sees an exam only if it targets their cohort, OR the exam has no
    // cohort targeting at all (empty = open to all of the course's cohorts,
    // backward-compatible with exams created before cohort targeting existed).
    const cohort = req.user.cohort || null;
    filter.$or = [
      { cohorts: { $exists: false } },
      { cohorts: { $size: 0 } },
      ...(cohort ? [{ cohorts: cohort }] : []),
    ];
  }
  const exams = await Exam.find(filter).sort({ startTime: -1 });
  res.json({ success: true, data: exams });
});

export const getExam = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.id);
  if (!exam) throw NotFound('Exam not found');
  // View access follows course mapping: admin, mapped faculty, or HOD of an
  // offering department. (Was creator-only; now any mapped faculty may view.)
  const course = await Course.findById(exam.courseId);
  if (req.user.role !== 'admin' && course &&
      !isFacultyMapped(course, req.user.id) && !courseInDepartment(course, req.user.departmentId)) {
    throw NotFound('Exam not found');
  }
  const data = exam.toObject({ virtuals: true });
  res.json({ success: true, data });
});

// Update an exam's schedule/metadata (title, type, date, start, duration,
// grace period, max marks, venue). Only allowed while the exam is still a
// draft or scheduled — never once it is active or closed, to protect students
// mid-exam and preserve the integrity of a completed assessment.
export const updateExam = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.id);
  if (!exam) throw NotFound('Exam not found');
  if (!['draft', 'scheduled'].includes(exam.status)) {
    throw BadRequest(`Cannot edit an exam that is "${exam.status}"`);
  }

  const editable = ['title', 'subjectCode', 'examType', 'examDate', 'startTime',
    'durationMins', 'gracePeriodMins', 'allowEarlySubmit', 'maxMarks', 'venue'];
  for (const key of editable) {
    if (req.body[key] !== undefined) exam[key] = req.body[key];
  }
  await exam.save();
  logger.info('Exam updated', { examId: exam._id, fields: Object.keys(req.body) });
  res.json({ success: true, data: exam.toObject({ virtuals: true }) });
});

export const deleteExam = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.id);
  if (!exam) throw NotFound('Exam not found');
  // Only the creating faculty (or admin) may delete.
  if (req.user.role === 'faculty' && String(exam.createdBy) !== String(req.user.id)) {
    throw NotFound('Exam not found');
  }

  // Cascade: remove the paper, scheme, submissions, scores, and module notes
  // tied to this exam so no orphaned data is left behind.
  await Promise.all([
    QuestionPaper.deleteOne({ examId: exam._id }),
    Scheme.deleteOne({ examId: exam._id }),
    Submission.deleteMany({ examId: exam._id }),
    Score.deleteMany({ examId: exam._id }),
    ModuleNotes.deleteMany({ examId: exam._id }),
  ]);
  await exam.deleteOne();

  logger.info('Exam deleted', { examId: exam._id, by: req.user.id });
  res.json({ success: true, data: { deleted: true } });
});

export const publishExam = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.id);
  if (!exam) throw NotFound('Exam not found');
  const paper = await QuestionPaper.findOne({ examId: exam._id });
  if (!paper) throw BadRequest('Cannot publish: no question paper attached');
  const scheme = await Scheme.findOne({ examId: exam._id, published: true });
  if (!scheme) throw BadRequest('Cannot publish: marking scheme not published');
  exam.status = 'scheduled';
  await exam.save();
  logger.info('Exam published', { examId: exam._id });

  // Notify enrolled students (same department, student role). Failure to queue
  // notifications must never fail the publish itself.
  try {
    const course = await Course.findById(exam.courseId);
    const students = await User.find({ role: 'student', department: course?.department, active: true });
    const dateStr = exam.examDate.toDateString();
    const startStr = exam.startTime.toLocaleString();
    for (const s of students) {
      await enqueueEmail({
        to: s.email,
        ...examScheduledEmail({
          studentName: s.name,
          examTitle: exam.title,
          examType: exam.examType,
          dateStr,
          startStr,
          durationMins: exam.durationMins,
          venue: exam.venue,
        }),
      });
    }
    logger.info('Exam-scheduled notifications queued', { examId: exam._id, count: students.length });
  } catch (err) {
    logger.error('Failed to queue exam-scheduled notifications', { examId: exam._id, error: err.message });
  }

  res.json({ success: true, data: exam });
});

/* ===== Question Paper ===== */
export const upsertQuestionPaper = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.examId);
  if (!exam) throw NotFound('Exam not found');

  // Plan gate: programming questions are only available on plans that include
  // them. Block saving a paper that contains any if the licence doesn't allow.
  const hasProgramming = (req.body.groups || []).some((g) =>
    (g.questions || []).some((q) => (q.subQuestions || []).some((sq) => sq.questionType === 'programming')));
  if (hasProgramming && isEnforced() && !hasFeature('programmingQuestions')) {
    throw Forbidden('Programming questions are not included in your current EvalAI plan. Please upgrade to enable them.');
  }

  // Enforce the CO RBTL ceiling: no sub-question may exceed the Bloom's level
  // of the CO it maps to. Only checked when both the CO has a ceiling and the
  // question has an RBTL — untagged questions are not blocked.
  const course = await Course.findById(exam.courseId);
  if (!course) throw BadRequest('Cannot save paper: course not found for this exam');
  const ceilingByCo = {};
  (course.cos || []).forEach((co) => { ceilingByCo[co.coId] = co.maxRbtl || null; });

  const violations = [];
  (req.body.groups || []).forEach((group) => {
    (group.questions || []).forEach((q) => {
      (q.subQuestions || []).forEach((sq) => {
        const ceiling = ceilingByCo[sq.co];
        if (ceiling && sq.rbtl && !isRbtlWithinCeiling(sq.rbtl, ceiling)) {
          violations.push(
            `Q${q.questionNo}${sq.label} is ${sq.rbtl} but ${sq.co}'s ceiling is ${ceiling} — question level may not exceed the CO's Bloom's level.`
          );
        }
      });
    });
  });
  if (violations.length) throw BadRequest(violations.join(' '));

  // Enforce the VTU module structure + per-exam-type marks scheme (admin-
  // configurable; defaults to SEE equal-per-module, CIE-1/CIE-2 per-CO).
  const scheme = schemeForExamType(course, exam.examType);
  const schemeErrors = validatePaperScheme(req.body.groups || [], scheme, course);
  if (schemeErrors.length) throw BadRequest(schemeErrors.join(' '));

  let paper = await QuestionPaper.findOne({ examId: exam._id });
  if (paper) {
    paper.groups = req.body.groups;
  } else {
    paper = new QuestionPaper({ examId: exam._id, groups: req.body.groups });
  }
  await paper.save(); // pre-save hook enforces OR equivalence
  exam.questionPaperId = paper._id;
  await exam.save();
  logger.info('Question paper saved', { examId: exam._id, groups: paper.groups.length });
  res.json({ success: true, data: paper });
});

export const getQuestionPaper = asyncHandler(async (req, res) => {
  const paper = await QuestionPaper.findOne({ examId: req.params.examId });
  if (!paper) throw NotFound('Question paper not found');
  res.json({ success: true, data: paper });
});

/** Resolve the active marks scheme + expected module layout for an exam. */
export const getExamScheme = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.examId);
  if (!exam) throw NotFound('Exam not found');
  const course = await Course.findById(exam.courseId);
  if (!course) throw BadRequest('Course not found for this exam');
  const scheme = schemeForExamType(course, exam.examType);
  res.json({
    success: true,
    data: {
      examType: exam.examType,
      kind: scheme.kind,
      modules: expectedModules(scheme), // [{moduleNo, co|null, marks}] or null
      enforceModuleCoMapping: !!course.enforceModuleCoMapping,
      moduleCoMap: course.moduleCoMap || [],
      cos: (course.cos || []).map((c) => ({ coId: c.coId, maxRbtl: c.maxRbtl })),
    },
  });
});

/**
 * Optional feature: generate DRAFT questions from an uploaded notes file.
 * Does NOT save anything — returns drafts for the faculty to edit/accept in the
 * builder. Enforces the CO ceiling by clamping every requested RBTL to at-or-
 * below the CO's ceiling before generation, so drafts can never exceed it.
 */
export const generateDraftQuestions = asyncHandler(async (req, res) => {
  if (!req.file) throw BadRequest('No notes file uploaded (field "file").');
  const fname = (req.file.originalname || '').toLowerCase();
  if (!/\.(pdf|docx)$/.test(fname)) throw BadRequest('Upload a PDF or DOCX file.');

  const exam = await Exam.findById(req.params.examId);
  if (!exam) throw NotFound('Exam not found');
  const course = await Course.findById(exam.courseId);
  if (!course) throw BadRequest('Course not found for this exam');

  const ceilingByCo = {};
  (course.cos || []).forEach((co) => { ceilingByCo[co.coId] = co.maxRbtl || null; });

  // Derive the generation plan from the exam type's marks scheme: one OR pair
  // per module slot, with the slot's CO and marks. Each pair's RBTL is clamped
  // to that CO's Bloom's ceiling. This makes generated papers conform to the
  // VTU module structure and the per-exam-type marks rules automatically.
  const scheme = schemeForExamType(course, exam.examType);
  const modules = expectedModules(scheme); // [{moduleNo, co|null, marks}] or null (flexible)

  // Optional: upload notes for ONE specific module. When provided, we generate
  // only that module's pair and store that module's notes text for later answer
  // drafting in the scheme builder.
  const reqModule = req.body.moduleNo ? Number(req.body.moduleNo) : null;

  const adjustments = [];
  let safeSpec;
  if (modules) {
    let slots = modules;
    if (reqModule) {
      slots = modules.filter((m) => m.moduleNo === reqModule);
      if (!slots.length) throw BadRequest(`Module ${reqModule} is not part of this exam's scheme.`);
    }
    safeSpec = slots.map((m) => {
      let co = m.co;
      if (!co) {
        const mapped = (course.moduleCoMap || []).find((x) => x.moduleNo === m.moduleNo);
        co = mapped?.cos?.[0] || (course.cos?.[(m.moduleNo - 1) % (course.cos.length || 1)]?.coId);
      }
      const ceiling = ceilingByCo[co];
      if (!ceiling) { adjustments.push(`Module ${m.moduleNo}: ${co || 'CO'} has no Bloom's ceiling — skipped.`); return null; }
      return { co, rbtl: ceiling, count: 1, marks: m.marks, moduleNo: m.moduleNo };
    }).filter(Boolean);
  } else {
    // Flexible exam type: fall back to one pair per CO at its ceiling.
    safeSpec = (course.cos || []).filter((co) => co.maxRbtl)
      .map((co, i) => ({ co: co.coId, rbtl: co.maxRbtl, count: 1, marks: 5, moduleNo: i + 1 }));
  }

  if (!safeSpec.length) throw BadRequest('Nothing to generate — set Bloom\'s ceilings on the course COs first.');

  // Per-course non-repetition: fetch already-used question texts for this
  // course and pass them as the "avoid" set so generation prefers fresh ones.
  const banked = await QuestionBank.find({ courseId: course._id }).select('normalizedText').lean();
  const avoid = banked.map((b) => b.normalizedText);

  let result;
  try {
    result = await generateQuestions(req.file.buffer, req.file.originalname, safeSpec, avoid);
  } catch (err) {
    throw BadRequest('Question generation is unavailable right now. Please try again, or add questions manually.');
  }

  // Store the extracted notes text per module, so the scheme builder can draft
  // answers from it later. If a single module was uploaded, store under it;
  // otherwise store the whole-document text under every generated module.
  const extractedText = result.extractedText || '';
  if (extractedText.trim()) {
    const moduleNosToStore = reqModule ? [reqModule] : safeSpec.map((s) => s.moduleNo);
    await Promise.all(moduleNosToStore.map((mn) =>
      ModuleNotes.findOneAndUpdate(
        { examId: exam._id, moduleNo: mn },
        { examId: exam._id, moduleNo: mn, filename: req.file.originalname, text: extractedText, charCount: extractedText.length },
        { upsert: true, new: true }
      )
    ));
  }

  // Attach the module number to each returned pair (by slot order) and defend
  // the CO ceiling once more.
  let pairs = (result.pairs || [])
    .map((p, i) => ({ ...p, moduleNo: safeSpec[i]?.moduleNo || (i + 1), marks: safeSpec[i]?.marks ?? p.marks }))
    .filter((p) => isRbtlWithinCeiling(p.rbtl, ceilingByCo[p.co]));

  // Record new questions in the per-course bank and annotate repeats.
  let bankInfo = { newCount: 0, repeatCount: 0 };
  try {
    const r = await recordAndAnnotate(course._id, pairs);
    pairs = r.pairs; bankInfo = { newCount: r.newCount, repeatCount: r.repeatCount };
  } catch (e) { logger.warn('Question bank record failed (non-fatal)', { error: e.message }); }

  logger.info('Draft OR pairs generated', { examId: exam._id, module: reqModule || 'all', count: pairs.length, file: req.file.originalname });
  res.json({
    success: true,
    data: {
      pairs,
      adjustments,
      bankInfo,
      warning: result.warning || null,
      scheme: { kind: scheme.kind, modules },
      note: 'AI-generated draft module-wise OR pairs, matched to this exam type\'s marks scheme. Review and edit each question (and split marks into sub-questions if needed) before saving.',
    },
  });
});

/** Download the question paper as a formatted .docx. */
export const downloadQuestionPaper = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.examId);
  if (!exam) throw NotFound('Exam not found');
  if (req.user.role === 'faculty' && String(exam.createdBy) !== String(req.user.id)) throw NotFound('Exam not found');
  const course = await Course.findById(exam.courseId);
  const paper = await QuestionPaper.findOne({ examId: exam._id });
  if (!paper) throw BadRequest('No question paper has been created for this exam yet.');

  const withCoRbtl = req.query.coRbtl !== 'false'; // default include CO/RBTL
  const buffer = await buildQuestionPaperDocx({ course, exam, paper, options: { withCoRbtl } });
  const fname = `${(exam.subjectCode || course?.code || 'paper').replace(/\s+/g, '_')}_QP.docx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  res.send(buffer);
});

/** Download the scheme of valuation as a formatted .docx. */
export const downloadScheme = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.examId);
  if (!exam) throw NotFound('Exam not found');
  if (req.user.role === 'faculty' && String(exam.createdBy) !== String(req.user.id)) throw NotFound('Exam not found');
  const course = await Course.findById(exam.courseId);
  const paper = await QuestionPaper.findOne({ examId: exam._id });
  if (!paper) throw BadRequest('No question paper has been created for this exam yet.');
  const scheme = await Scheme.findOne({ examId: exam._id });
  if (!scheme) throw BadRequest('No marking scheme has been created for this exam yet.');

  const buffer = await buildSchemeDocx({ course, exam, paper, scheme });
  const fname = `${(exam.subjectCode || course?.code || 'scheme').replace(/\s+/g, '_')}_Scheme.docx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  res.send(buffer);
});

/** Faculty uploads an image to attach to a question; returns the stored id. */
export const uploadQuestionImage = asyncHandler(async (req, res) => {
  if (!req.file) throw BadRequest('No image uploaded (field "image").');
  const ok = /^image\/(png|jpe?g|gif|webp)$/.test(req.file.mimetype || '');
  if (!ok) throw BadRequest('Only PNG, JPEG, GIF or WEBP images are allowed.');
  const exam = await Exam.findById(req.params.examId);
  if (!exam) throw NotFound('Exam not found');
  const fileId = await storeQuestionImage(req.file.buffer, req.file.originalname, req.file.mimetype, {
    examId: String(exam._id), uploadedBy: String(req.user.id), kind: 'question',
  });
  logger.info('Question image uploaded', { examId: exam._id, fileId });
  res.status(201).json({ success: true, data: { imageFileId: fileId } });
});

/** Faculty fetches a question image (e.g. while building the paper). */
export const serveQuestionImageFaculty = asyncHandler(async (req, res) => {
  let result;
  try { result = await openQuestionImage(req.params.fileId); }
  catch { throw NotFound('Image not found'); }
  // Enforce course access via the image's stored examId (if present).
  const examId = result.file?.metadata?.examId;
  if (examId && req.user.role !== 'admin') {
    const exam = await Exam.findById(examId).select('courseId');
    const course = exam && await Course.findById(exam.courseId);
    if (course && !isFacultyMapped(course, req.user.id) && !courseInDepartment(course, req.user.departmentId)) {
      throw NotFound('Image not found');
    }
  }
  res.setHeader('Content-Type', result.file.contentType || 'image/png');
  res.setHeader('Cache-Control', 'private, max-age=300');
  result.stream.on('error', () => res.status(404).end()).pipe(res);
});
export const draftAnswerForQuestion = asyncHandler(async (req, res) => {
  const { examId } = req.params;
  const { question, moduleNo, co, marks } = req.body || {};
  if (!question) throw BadRequest('question text is required.');

  // Find the notes: prefer the question's module; if not given, try to locate
  // any stored module notes for this exam.
  let notes = null;
  if (moduleNo) notes = await ModuleNotes.findOne({ examId, moduleNo: Number(moduleNo) });
  if (!notes) notes = await ModuleNotes.findOne({ examId }).sort({ updatedAt: -1 });
  if (!notes) {
    throw BadRequest('No notes have been uploaded for this exam yet. Upload module notes (in the paper builder) before drafting answers from them.');
  }

  let result;
  try {
    result = await draftAnswerFromNotes(question, notes.text, Number(marks) || 5);
  } catch (err) {
    throw BadRequest('Answer drafting is unavailable right now. Please write the answer manually.');
  }

  logger.info('Answer drafted from notes', { examId, moduleNo: moduleNo || notes.moduleNo, chars: (result.draft || '').length });
  res.json({
    success: true,
    data: {
      draft: result.draft || '',
      sentenceCount: result.sentenceCount || 0,
      sourceModule: notes.moduleNo,
      warning: result.warning || null,
      note: 'Draft extracted from the module notes. Please review and edit into a proper model answer before saving the scheme.',
    },
  });
});

/* ===== Scheme ===== */
export const upsertScheme = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.examId);
  if (!exam) throw NotFound('Exam not found');
  const scheme = await Scheme.findOneAndUpdate(
    { examId: exam._id },
    { examId: exam._id, entries: req.body.entries, published: !!req.body.published },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  logger.info('Scheme saved', { examId: exam._id, entries: scheme.entries.length, published: scheme.published });
  res.json({ success: true, data: scheme });
});

// Faculty-only: students must never receive the scheme
export const getScheme = asyncHandler(async (req, res) => {
  const scheme = await Scheme.findOne({ examId: req.params.examId });
  if (!scheme) throw NotFound('Scheme not found');
  res.json({ success: true, data: scheme });
});

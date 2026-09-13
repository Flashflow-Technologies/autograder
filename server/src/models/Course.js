import mongoose from 'mongoose';

export const PO_KEYS = ['PO1','PO2','PO3','PO4','PO5','PO6','PO7','PO8','PO9','PO10','PO11','PSO1','PSO2'];
export const CO_KEYS = ['CO1','CO2','CO3','CO4','CO5'];

/**
 * Per-course-type defaults: which components are active, and their blend weights.
 * Selecting a type applies these; faculty can then edit weights and toggle
 * components. 'see' entries are the autonomous-only SEE share (CIE:SEE outer
 * blend); when a course is not autonomous, SEE is inactive regardless.
 *
 * Weights follow the institution's sheet:
 *   IPCC : theory 0.15, practical 0.10, assessment 0.25, SEE 0.50
 *   PCC  : theory 0.25, assessment 0.25, SEE 0.50
 *   PCCL : practical (CIE) 0.50, SEE 0.50
 *   AEC  : theory-type behaves as PCC; practical-type behaves as PCCL
 */
export const COURSE_TYPE_DEFAULTS = {
  PCC: {
    components: { theory: true, practical: false, assessment: true, see: false },
    weights: { theory: 0.25, practical: 0, assessment: 0.25, ciePct: 50, seePct: 50 },
    hasPractical: false,
  },
  IPCC: {
    components: { theory: true, practical: true, assessment: true, see: false },
    weights: { theory: 0.15, practical: 0.10, assessment: 0.25, ciePct: 50, seePct: 50 },
    hasPractical: true,
  },
  PCCL: {
    components: { theory: false, practical: true, assessment: false, see: false },
    weights: { theory: 0, practical: 0.50, assessment: 0, ciePct: 50, seePct: 50 },
    hasPractical: true,
  },
  AEC_theory: {
    components: { theory: true, practical: false, assessment: true, see: false },
    weights: { theory: 0.25, practical: 0, assessment: 0.25, ciePct: 50, seePct: 50 },
    hasPractical: false,
  },
  AEC_practical: {
    components: { theory: false, practical: true, assessment: false, see: false },
    weights: { theory: 0, practical: 0.50, assessment: 0, ciePct: 50, seePct: 50 },
    hasPractical: true,
  },
};

/** Resolve the defaults key for a course type (+ aecType for AEC). */
export function courseTypeKey(courseType, aecType) {
  if (courseType === 'AEC') return aecType === 'practical' ? 'AEC_practical' : 'AEC_theory';
  if (courseType === 'theory') return 'PCC'; // legacy alias
  return courseType; // PCC / IPCC / PCCL
}

// Embedded: a single CO definition
const coSchema = new mongoose.Schema(
  {
    coId: { type: String, enum: CO_KEYS, required: true },
    description: { type: String, required: true, trim: true },
    // Bloom's ceiling for this CO: questions on this CO may not exceed it.
    // Auto-derived from the statement's verbs, but faculty-overridable (and
    // required when the statement has no recognisable Bloom's verb).
    maxRbtl: { type: String, enum: ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'] },
    // Optional per-CO attainment targets. When set, they override the course
    // defaults for THIS CO. Leaving them unset means "use the course default".
    //   thresholdPct = mark % a student must score to attain this CO
    //   coTargetPct  = % of students who must attain for this CO to pass
    // The four faculty target-setting modes (common/varied for each value) are
    // simply different fill patterns over these per-CO fields + course defaults.
    thresholdPct: { type: Number, min: 1, max: 100 },
    coTargetPct: { type: Number, min: 1, max: 100 },
  },
  { _id: false }
);

// Embedded: contribution weights from one CO to every PO/PSO (0-3 scale)
const weightsShape = PO_KEYS.reduce((acc, k) => {
  acc[k] = { type: Number, min: 0, max: 3, default: 0 };
  return acc;
}, {});

const coPoSchema = new mongoose.Schema(
  {
    coId: { type: String, enum: CO_KEYS, required: true },
    weights: weightsShape,
  },
  { _id: false }
);

// Embedded: per-exam-type marks scheme (admin-configurable; see utils/examScheme.js)
const slotSchema = new mongoose.Schema(
  { co: { type: String, enum: CO_KEYS, required: true }, marks: { type: Number, required: true, min: 1 } },
  { _id: false }
);
const examSchemeSchema = new mongoose.Schema(
  {
    examType: { type: String, required: true },
    kind: { type: String, enum: ['equal_per_module', 'per_co', 'flexible'], required: true },
    moduleCount: { type: Number, min: 1, max: 12 }, // for equal_per_module
    totalMarks: { type: Number, min: 1 },           // for equal_per_module
    slots: [slotSchema],                            // for per_co
  },
  { _id: false }
);

// Embedded: optional module -> allowed CO(s) mapping (used when strict mode on)
const moduleCoSchema = new mongoose.Schema(
  { moduleNo: { type: Number, required: true, min: 1 }, cos: [{ type: String, enum: CO_KEYS }] },
  { _id: false }
);

const courseSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, index: true },
    title: { type: String, required: true, trim: true },
    // Legacy single-department string kept for backward compatibility with
    // existing attainment/course code; the canonical mapping is `offerings`.
    department: { type: String, trim: true },
    semester: { type: Number, min: 1, max: 8 },
    // VTU course category, which presets the assessment structure. Faculty can
    // still adjust components. 'theory' = CIE tests + SEE (no practical);
    // 'PCCL' = standalone lab (practical only); 'IPCC' = theory + integrated lab
    // practical component; 'AEC' = ability-enhancement (report/activity, no SEE).
    // VTU course category, which presets the assessment structure and which
    // components are active in attainment. Faculty can still adjust.
    //   'PCC'   = theory only (CIE test + assessment, + SEE if autonomous)
    //   'PCCL'  = practical only (CIE test + SEE test)
    //   'IPCC'  = theory + practical components (+ SEE if autonomous)
    //   'AEC'   = ability-enhancement; see aecType for whether it behaves as a
    //             theory course or a practical course.
    // 'theory' is retained as an alias of PCC for backward compatibility.
    courseType: { type: String, enum: ['theory', 'PCC', 'PCCL', 'IPCC', 'AEC'], default: 'PCC' },
    // For AEC only: whether it is assessed as a theory course or a practical one.
    aecType: { type: String, enum: ['theory', 'practical'], default: 'theory' },
    // Whether this course has a practical component whose marks are entered via
    // the practical marks sheet. Auto-set from courseType but overridable.
    hasPractical: { type: Boolean, default: false },
    // Which attainment components are active for this course. Auto-set from the
    // course type (see COURSE_TYPE_DEFAULTS) but each can be toggled by faculty.
    componentsActive: {
      theory: { type: Boolean, default: true },
      practical: { type: Boolean, default: false },
      assessment: { type: Boolean, default: true },
      see: { type: Boolean, default: false },
    },
    // Two-level attainment blend configuration (used by computeCourseAttainment).
    //
    // Level 1 (inside CIE): theory + practical + assessment CO-attainment are
    // blended by these sub-weights. Faculty set them per course. A source with
    // no data is dropped and the remaining weights renormalise.
    //
    // Level 2 (CIE vs SEE): the CIE result is blended with SEE. SEE only counts
    // when isAutonomous is true (otherwise SEE is under the university and not
    // available, so attainment is CIE-only). Default 50:50 for autonomous.
    attainmentWeights: {
      theory: { type: Number, default: 1, min: 0 },
      practical: { type: Number, default: 1, min: 0 },
      assessment: { type: Number, default: 1, min: 0 },
      ciePct: { type: Number, default: 50, min: 0, max: 100 }, // CIE share of subject
      seePct: { type: Number, default: 50, min: 0, max: 100 }, // SEE share (autonomous)
    },
    isAutonomous: { type: Boolean, default: false },
    // Editable attainment-level band table. Each band: "if attainment % > minPct
    // then level". Evaluated top-down (highest minPct first); the first match
    // wins, else the fallback level. Defaults to the standard NBA 0-3 scheme
    // (60/50/40 -> 3/2/1, else 0). The band table remains editable per course,
    // so a programme that uses a finer scale can still configure it.
    levelBands: {
      type: [{ minPct: { type: Number, required: true }, level: { type: Number, required: true } }],
      default: () => ([
        { minPct: 60, level: 3 },
        { minPct: 50, level: 2 },
        { minPct: 40, level: 1 },
      ]),
    },
    // Level assigned when no band matches (below the lowest minPct).
    levelFallback: { type: Number, default: 0 },
    // How component sources combine into CO attainment:
    //   'levels'      - convert each source's attainment % to a band LEVEL, then
    //                   weight-average the levels (matches the college's sheet:
    //                   0.15*CO_level + 0.5*SEE_level ...).
    //   'percentages' - weight-average the attainment PERCENTAGES, then map the
    //                   blended % to a level at the end.
    blendMode: { type: String, enum: ['levels', 'percentages'], default: 'levels' },
    // The cohorts (batches/sections) this course instance covers, e.g.
    // ["2022-CSE-A", "2022-CSE-B"]. The same subject code is re-created as a
    // separate course record for a later batch; COs stay the same, but exams,
    // assessments and attainment are separate per course instance. Exams/
    // assessments target a subset of these cohorts.
    cohorts: { type: [String], default: [] },
    // A course can be offered by multiple departments, each with its OWN faculty
    // list (the same course in CSE and ISE has different faculty per department).
    offerings: {
      type: [new mongoose.Schema({
        departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
        // Flat faculty list — used for course-level ACCESS control (any mapped
        // faculty can act on the course). Kept for backward compatibility.
        facultyIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
        // Per-faculty SECTION allocation — which sections each faculty teaches.
        // Drives section-scoped attainment VISIBILITY for faculty. A faculty in
        // facultyIds but absent here (or with empty sections) is treated as
        // teaching all of the offering's sections (backward compatible).
        facultyAllocations: {
          type: [new mongoose.Schema({
            facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            sections: { type: [String], default: [] }, // e.g. ["A", "C"]
          }, { _id: false })],
          default: undefined,
        },
      }, { _id: true })],
      default: undefined,
    },
    // Course-level default attainment targets, used for any CO that does not
    // set its own override. Faculty/HoD configure these (and optional per-CO
    // overrides) via the target-settings UI. Defaults follow the common 60/60.
    defaultThresholdPct: { type: Number, min: 1, max: 100, default: 60 },
    defaultCoTargetPct: { type: Number, min: 1, max: 100, default: 60 },
    cos: {
      type: [coSchema],
      validate: {
        validator: (arr) => arr.length >= 1 && arr.length <= 5,
        message: 'A course must have between 1 and 5 Course Outcomes',
      },
    },
    coPoMatrix: [coPoSchema],
    // Course-level assessment plan: which assessment methods this course uses
    // and the CO(s) each method assesses. This is a planning/blueprint view
    // (the "map COs to each assessment method" layer); actual attainment still
    // comes from the per-item marks. Purely declarative — helps faculty and
    // auditors see the CO coverage of each method at a glance.
    assessmentPlan: {
      type: [{
        method: { type: String, trim: true, required: true }, // "IA Test 1", "Assignment", "Lab", "SEE"
        cos: { type: [{ type: String, enum: CO_KEYS }], default: [] },
        maxMarks: { type: Number, min: 0 },
      }],
      default: undefined,
    },
    // Per-exam-type marks schemes. If empty, defaults (defaultExamSchemes) apply.
    examSchemes: { type: [examSchemeSchema], default: undefined },
    // When true, questions in a module may only use the CO(s) mapped to it.
    enforceModuleCoMapping: { type: Boolean, default: false },
    moduleCoMap: { type: [moduleCoSchema], default: undefined },
    facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

courseSchema.index({ department: 1, semester: 1 });

export default mongoose.model('Course', courseSchema);
export { courseSchema };

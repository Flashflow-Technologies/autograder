import mongoose from 'mongoose';
import { CO_KEYS } from './Course.js';
import { RBTL_KEYS } from './QuestionPaper.js';

/* ============ Scheme ============ */
const schemeEntrySchema = new mongoose.Schema(
  {
    groupIndex: { type: Number, required: true },
    questionNo: { type: Number, required: true },
    subLabel: { type: String, required: true },
    co: { type: String, enum: CO_KEYS, required: true },
    rbtl: { type: String, enum: RBTL_KEYS, required: true },
    maxMarks: { type: Number, required: true },
    questionType: { type: String, enum: ['descriptive', 'programming'], default: 'descriptive' },
    // Required for descriptive questions; programming questions are scored from
    // their test cases (on the paper), so no model answer is needed.
    modelAnswer: {
      type: String,
      required: function () { return this.questionType !== 'programming'; },
    },
    mandatoryKeywords: [String],
    bonusKeywords: [String],
    imageFileId: { type: String }, // optional figure/diagram for the model answer
    weights: {
      cosine: { type: Number, default: 35 },
      keywords: { type: Number, default: 35 },
      style: { type: Number, default: 20 },
      grammar: { type: Number, default: 10 },
    },
  },
  { _id: false }
);

// Each descriptive entry's NLP weights must sum to 100. Programming entries are
// scored by their test-case rubric (on the paper), so this check is skipped.
schemeEntrySchema.pre('validate', function (next) {
  if (this.questionType === 'programming') return next();
  const w = this.weights;
  const total = w.cosine + w.keywords + w.style + w.grammar;
  if (total !== 100) return next(new Error(`Weights for Q${this.questionNo}${this.subLabel} sum to ${total}, must be 100`));
  next();
});

const schemeSchema = new mongoose.Schema(
  {
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true, unique: true, index: true },
    entries: [schemeEntrySchema],
    published: { type: Boolean, default: false },
  },
  { timestamps: true }
);
export const Scheme = mongoose.model('Scheme', schemeSchema);

/* ============ Submission ============ */
const answerSchema = new mongoose.Schema(
  {
    groupIndex: { type: Number, required: true },
    questionNo: { type: Number, required: true }, // which OR side was answered
    subLabel: { type: String, required: true },
    inputMode: { type: String, enum: ['typed', 'scanned'], default: 'typed' },
    rawText: { type: String, default: '' },
    scanFileId: { type: mongoose.Schema.Types.ObjectId }, // GridFS ref
    ocrText: { type: String, default: '' },
  },
  { _id: false }
);

const submissionSchema = new mongoose.Schema(
  {
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    startedAt: { type: Date },
    submittedAt: { type: Date },
    submitMode: { type: String, enum: ['manual', 'auto_timeout'], default: 'manual' },
    status: { type: String, enum: ['in_progress', 'submitted', 'scored'], default: 'in_progress' },
    answers: [answerSchema],
    // Re-access workflow: after submitting, a student may request to reopen the
    // test; faculty approve/reject. Approval only lets them back in while the
    // exam window is still open, and their existing answers are preserved.
    reAccess: {
      status: { type: String, enum: ['none', 'requested', 'approved', 'rejected'], default: 'none' },
      reason: { type: String, trim: true },           // student's reason
      requestedAt: { type: Date },
      decidedAt: { type: Date },
      decidedByName: { type: String },
      decisionNote: { type: String, trim: true },     // faculty note
      used: { type: Boolean, default: false },         // student re-entered after approval
    },
  },
  { timestamps: true }
);
submissionSchema.index({ examId: 1, studentId: 1 }, { unique: true });
export const Submission = mongoose.model('Submission', submissionSchema);

/* ============ Score ============ */
const subScoreSchema = new mongoose.Schema(
  {
    groupIndex: Number,
    questionNo: Number,
    subLabel: String,
    co: { type: String, enum: CO_KEYS },
    rbtl: { type: String, enum: RBTL_KEYS },
    maxMarks: Number,
    components: {
      cosine: Number,
      keywords: Number,
      style: Number,
      grammar: Number,
    },
    aiScore: Number,
    finalScore: Number,
    confidence: Number,
    foundKeywords: [String],
    missingKeywords: [String],
    aiFeedback: String,
    spans: [{ text: String, score: Number }],  // #4 per-sentence match scores for highlighting
    // Programming-question execution detail (present only for code questions).
    programming: {
      language: String,
      compiled: Boolean,
      testResults: [{
        index: Number, hidden: Boolean, passed: Boolean, statusId: Number,
        time: Number, memory: Number, stdout: String, stderr: String, compileOutput: String,
      }],
      passedWeight: Number,
      totalWeight: Number,
      correctnessFrac: Number,
      styleFrac: Number,
      complexityFrac: Number,
      complexity: Number,
      styleViolations: Number,
    },
    reviewStatus: { type: String, enum: ['auto', 'pending', 'approved', 'adjusted', 'flagged'], default: 'pending', index: true },
    // Why this answer was routed to human review (for the review queue UI):
    // 'low_confidence' | 'borderline' | 'high_rbtl' | 'ai_unavailable' | ''.
    reviewReason: { type: String, default: '' },
    adjustReason: { type: String },    // faculty's reason when score was adjusted (student-facing provenance)
    reviewedByName: { type: String },   // name of the human approver
    reviewedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
  },
  { _id: false }
);

const orSelectionSchema = new mongoose.Schema(
  {
    groupIndex: Number,
    selectedQuestionNo: Number,
    selectedBy: { type: String, enum: ['ai', 'faculty'], default: 'ai' },
  },
  { _id: false }
);

const scoreSchema = new mongoose.Schema(
  {
    submissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Submission', required: true },
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subScores: [subScoreSchema],
    orSelections: [orSelectionSchema],
    totalScore: { type: Number, default: 0 },
    // Per-student review progress so faculty can save and continue later
    reviewState: { type: String, enum: ['not_started', 'in_progress', 'completed'], default: 'not_started', index: true },
    published: { type: Boolean, default: false, index: true },
    publishedByName: { type: String },  // human who published the results
    publishedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    publishedAt: { type: Date },
    // Accountability: stamp what produced this score (#6 version stamping) so any
    // grade can be reproduced/explained later — strong accreditation evidence.
    scoringProvenance: {
      aiModel: { type: String },        // e.g. "all-MiniLM-L6-v2"
      aiServiceVersion: { type: String },
      appVersion: { type: String },     // server package.json version
      schemeVersion: { type: Number },  // scheme doc's version/updatedAt marker
      scoredAt: { type: Date },
    },
  },
  { timestamps: true }
);
scoreSchema.index({ examId: 1, studentId: 1 }, { unique: true });
export const Score = mongoose.model('Score', scoreSchema);

/* ============ Attainment ============ */
const attainmentSchema = new mongoose.Schema(
  {
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true, unique: true, index: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    thresholdPct: { type: Number, default: 60 }, // student pass %
    coTargetPct: { type: Number, default: 60 }, // class attainment %
    coAttainment: [
      { coId: String, avgScorePct: Number, studentsAttainedPct: Number, attained: Boolean, _id: false },
    ],
    poAttainment: [{ poId: String, value: Number, _id: false }],
    ciActions: [{ coId: String, gap: Number, suggestedAction: String, _id: false }],
    computedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
export const Attainment = mongoose.model('Attainment', attainmentSchema);

/* ============ Appeal ============ */
const appealSchema = new mongoose.Schema(
  {
    scoreId: { type: mongoose.Schema.Types.ObjectId, ref: 'Score', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    questionNo: Number,
    subLabel: String,
    grounds: { type: String, required: true },
    explanation: { type: String, required: true },
    status: { type: String, enum: ['submitted', 'under_review', 'resolved'], default: 'submitted', index: true },
    outcome: { type: String, enum: ['upheld', 'revised', null], default: null },
    revisedScore: Number,
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
export const Appeal = mongoose.model('Appeal', appealSchema);

/* ============ AuditLog (append-only) ============ */
const auditLogSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actorRole: String,
    action: { type: String, required: true, index: true },
    targetType: String,
    targetId: mongoose.Schema.Types.ObjectId,
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
    reason: String,
    timestamp: { type: Date, default: Date.now, index: true },
    // Tamper-evidence (#7): each entry is hash-chained to the previous one.
    // hash = SHA256(canonical entry content + prevHash). Altering any past entry
    // breaks the chain from that point, which the verifier detects.
    prevHash: { type: String },
    hash: { type: String, index: true },
    seq: { type: Number, index: true }, // monotonic sequence for ordering the chain
  },
  { capped: false }
);
auditLogSchema.index({ targetType: 1, targetId: 1 });
export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export { schemeSchema, submissionSchema, scoreSchema, attainmentSchema, appealSchema, auditLogSchema };

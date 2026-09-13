import mongoose from 'mongoose';
import { CO_KEYS } from './Course.js';
import logger from '../utils/logger.js';

export const RBTL_KEYS = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'];
export const LENGTH_BANDS = ['brief', 'short', 'medium', 'long'];

const testCaseSchema = new mongoose.Schema(
  {
    stdin: { type: String, default: '' },
    expectedStdout: { type: String, default: '' },
    hidden: { type: Boolean, default: false }, // hidden from students; used in scoring
    weight: { type: Number, default: 1, min: 0 }, // relative weight within correctness
  },
  { _id: false }
);

const subQuestionSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true }, // "a", "b", "c"
    text: { type: String, required: true, trim: true },
    co: { type: String, enum: [...CO_KEYS, ""], default: "" }, // optional topic/CO tag (metadata only)
    // Optional extra COs this question also assesses. When present, the
    // question's marks are split equally across [co, ...additionalCos] for
    // attainment (the same multi-CO rule used by rubrics and practicals). The
    // primary `co` stays required so all existing single-CO logic keeps working.
    additionalCos: { type: [{ type: String, enum: CO_KEYS }], default: [] },
    rbtl: { type: String, enum: [...RBTL_KEYS, ""], default: "" }, // optional Bloom-level tag (metadata only)
    marks: { type: Number, required: true, min: 1 },
    expectedLength: { type: String, enum: LENGTH_BANDS, default: 'short' },
    imageFileId: { type: String }, // optional GridFS id of an attached figure/diagram

    // Question type: descriptive (AI/keyword scored) or programming (executed).
    questionType: { type: String, enum: ['descriptive', 'programming'], default: 'descriptive' },

    // --- Programming-question fields (used only when questionType === 'programming') ---
    language: { type: String, enum: ['python', 'java', 'c', 'cpp'] },
    starterCode: { type: String, default: '' },
    testCases: { type: [testCaseSchema], default: undefined },
    timeLimitSec: { type: Number, default: 5, min: 1, max: 15 },
    memoryLimitMb: { type: Number, default: 128, min: 16, max: 512 },
    // Rubric weights (must sum to 100); how the final mark is composed.
    rubric: {
      correctness: { type: Number, default: 65, min: 0, max: 100 },
      style: { type: Number, default: 15, min: 0, max: 100 },
      complexity: { type: Number, default: 20, min: 0, max: 100 },
    },
    complexityThreshold: { type: Number, default: 10, min: 1 }, // cyclomatic ceiling before penalty
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    questionNo: { type: Number, required: true },
    moduleNo: { type: Number, min: 1 }, // VTU module this question belongs to
    instruction: { type: String, trim: true },
    subQuestions: {
      type: [subQuestionSchema],
      validate: { validator: (a) => a.length >= 1, message: 'A question needs at least one sub-question' },
    },
  },
  { _id: false }
);

const groupSchema = new mongoose.Schema(
  {
    groupType: { type: String, enum: ['solo', 'or_pair'], required: true },
    questions: {
      type: [questionSchema],
      validate: {
        validator: function (qs) {
          return this.groupType === 'or_pair' ? qs.length === 2 : qs.length === 1;
        },
        message: 'A solo group needs 1 question; an or_pair needs exactly 2',
      },
    },
  },
  { _id: false }
);

const questionPaperSchema = new mongoose.Schema(
  {
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true, unique: true, index: true },
    groups: [groupSchema],
  },
  { timestamps: true }
);

/** Build a map of "CO·RBTL" -> total marks for one question's sub-questions. */
function coRbtlMarksMap(question) {
  const map = {};
  for (const sq of question.subQuestions) {
    const key = `${sq.co}·${sq.rbtl}`;
    map[key] = (map[key] || 0) + sq.marks;
  }
  return map;
}

/**
 * Core OBE rule: for every OR pair, each CO·RBTL combination must carry
 * identical marks on both sides, so a student is assessed uniformly
 * regardless of which alternative they answer.
 */
questionPaperSchema.methods.validateOrEquivalence = function () {
  const errors = [];
  this.groups.forEach((group, gi) => {
    if (group.groupType !== 'or_pair') return;
    const [qA, qB] = group.questions;
    const mapA = coRbtlMarksMap(qA);
    const mapB = coRbtlMarksMap(qB);
    const keys = new Set([...Object.keys(mapA), ...Object.keys(mapB)]);
    for (const key of keys) {
      const a = mapA[key] || 0;
      const b = mapB[key] || 0;
      if (a !== b) {
        errors.push(
          `Group ${gi + 1} (Q${qA.questionNo}/Q${qB.questionNo}): ${key} carries ${a}m on Q${qA.questionNo} but ${b}m on Q${qB.questionNo}`
        );
      }
    }
  });
  return errors;
};

// Block save if OR equivalence is violated — invalid papers can never persist
questionPaperSchema.pre('save', function (next) {
  const errors = this.validateOrEquivalence();
  if (errors.length) {
    logger.warn('QuestionPaper OR equivalence validation failed', { examId: this.examId, errors });
    const err = new Error('OR equivalence validation failed');
    err.name = 'ValidationError';
    err.details = errors;
    return next(err);
  }
  next();
});

export default mongoose.model('QuestionPaper', questionPaperSchema);
export { questionPaperSchema };

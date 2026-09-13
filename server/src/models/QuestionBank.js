import mongoose from 'mongoose';

/**
 * A per-course bank of questions generated from notes. Each time questions are
 * generated, they're recorded here so future generations can prefer questions
 * NOT used before — avoiding repeats across that course's papers until the bank
 * is exhausted.
 *
 * Keyed by (courseId, normalizedText) so the same question text isn't stored
 * twice. `usedCount` / `lastUsedAt` track reuse so we can rank least-recently-
 * used when we do have to repeat.
 */
const questionBankSchema = new mongoose.Schema(
  {
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    co: { type: String, required: true },
    rbtl: { type: String, required: true },
    text: { type: String, required: true },
    normalizedText: { type: String, required: true }, // lowercased/trimmed for dedupe
    sourceConcept: { type: String },
    usedCount: { type: Number, default: 0 },
    lastUsedAt: { type: Date },
  },
  { timestamps: true }
);

// Prevent duplicate question text within a course.
questionBankSchema.index({ courseId: 1, normalizedText: 1 }, { unique: true });

export const QuestionBank = mongoose.model('QuestionBank', questionBankSchema);
export default QuestionBank;
export { questionBankSchema };

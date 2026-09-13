import mongoose from 'mongoose';

/**
 * Stores the extracted TEXT of notes uploaded for an exam, keyed by module.
 * We persist the text (not the original file) so the scheme builder's
 * "draft answer from notes" feature can retrieve the right module's content
 * later, in a separate step from question generation.
 *
 * One document per (examId, moduleNo); re-uploading a module replaces it.
 */
const moduleNotesSchema = new mongoose.Schema(
  {
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    moduleNo: { type: Number, required: true, min: 1 },
    filename: { type: String },
    text: { type: String, required: true }, // extracted plain text
    charCount: { type: Number },
  },
  { timestamps: true }
);

moduleNotesSchema.index({ examId: 1, moduleNo: 1 }, { unique: true });

export const ModuleNotes = mongoose.model('ModuleNotes', moduleNotesSchema);
export default ModuleNotes;
export { moduleNotesSchema };

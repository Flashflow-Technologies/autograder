import mongoose from 'mongoose';

export const EXAM_TYPES = ['CIE 1', 'CIE 2', 'CIE 3', 'SEE', 'Model', 'Supplementary'];
export const EXAM_STATUS = ['draft', 'scheduled', 'active', 'closed'];

const examSchema = new mongoose.Schema(
  {
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    // The cohorts (subset of the course's cohorts) this exam is assigned to.
    // Only students whose cohort is in this list may attend. Empty = all of the
    // course's cohorts (backward-compatible default for pre-existing exams).
    cohorts: { type: [String], default: [] },
    title: { type: String, required: true, trim: true },
    subjectCode: { type: String, required: true, trim: true },
    examType: { type: String, enum: EXAM_TYPES, required: true, index: true },
    examDate: { type: Date, required: true },
    startTime: { type: Date, required: true }, // full datetime, stored UTC — authoritative
    durationMins: { type: Number, required: true, min: 15 },
    gracePeriodMins: { type: Number, default: 10, min: 0 },
    allowEarlySubmit: { type: Boolean, default: true },
    maxMarks: { type: Number, required: true, min: 1 },
    venue: { type: String, trim: true },
    status: { type: String, enum: EXAM_STATUS, default: 'draft', index: true },
    questionPaperId: { type: mongoose.Schema.Types.ObjectId, ref: 'QuestionPaper' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Optional per-exam tuning of the auto-grade review triggers. Any omitted
    // value falls back to the service defaults. These let different institutions
    // (varying pass marks, stricter/looser review) configure without code changes.
    reviewConfig: {
      // Confidence below which an answer is routed to human review (0-1).
      confidenceThreshold: { type: Number, min: 0, max: 1 },
      // Pass mark as a fraction of a question's max (e.g. 0.4 for 40%).
      passFraction: { type: Number, min: 0, max: 1 },
      // Half-width of the borderline band around the pass mark, as a fraction of
      // max (e.g. 0.1 flags answers within +/-10% of max of the pass line).
      borderlineMargin: { type: Number, min: 0, max: 1 },
    },
  },
  { timestamps: true }
);

examSchema.index({ status: 1, startTime: 1 });

// Server-authoritative time computations. `now` is always the server clock.
examSchema.virtual('endTime').get(function () {
  return new Date(this.startTime.getTime() + this.durationMins * 60000);
});

examSchema.methods.entryDeadline = function () {
  return new Date(this.startTime.getTime() + this.gracePeriodMins * 60000);
};

// Can a student START the exam right now? (within grace window after start)
examSchema.methods.canEnter = function (now = new Date()) {
  return now >= this.startTime && now <= this.entryDeadline() && now < this.endTime;
};

// Is the exam window still open for saving/submitting answers?
examSchema.methods.isOpen = function (now = new Date()) {
  return now >= this.startTime && now < this.endTime;
};

export default mongoose.model('Exam', examSchema);
export { examSchema };

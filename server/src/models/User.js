import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin', 'faculty', 'student', 'hod'], required: true, index: true },
    rollNo: { type: String, trim: true, index: true, sparse: true }, // students only
    employeeId: { type: String, trim: true, index: true, sparse: true }, // faculty/admin only
    department: { type: String, trim: true },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' }, // canonical dept link
    cohort: { type: String, trim: true }, // BATCH / admission-year cohort, e.g. "2021-CSE"
    section: { type: String, trim: true }, // section within the batch, e.g. "A" (students only)
    consentGiven: { type: Boolean, default: false }, // data-processing consent (Responsible AI)
    active: { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: false }, // set for bulk/single-added users
  },
  { timestamps: true }
);

userSchema.index({ role: 1, cohort: 1 });
userSchema.index({ role: 1, cohort: 1, section: 1 });

// Hash a plaintext password and attach it. Caller sets user.passwordHash via this.
userSchema.methods.setPassword = async function (plain) {
  this.passwordHash = await bcrypt.hash(plain, 10);
};

userSchema.methods.verifyPassword = async function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

// Never leak the hash in JSON responses
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    return ret;
  },
});

export default mongoose.model('User', userSchema);
export { userSchema };

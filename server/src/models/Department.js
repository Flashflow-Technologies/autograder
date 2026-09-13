import mongoose from 'mongoose';
import { statementSchema, outcomeStatementSchema } from './Institute.js';

/**
 * Department — a real institutional entity (previously only a free-text string
 * on users/courses). Faculty and students are mapped to a department via their
 * User.departmentId; the legacy User.department string is kept in sync for
 * backward compatibility with existing course/attainment code.
 *
 * Holds department-level Vision/Mission AND the program-level accreditation
 * statements (PO/PSO/PEO/WK/Academic Objectives) — these are per-program in OBE,
 * so they live on the department that runs the program, not the institute.
 * PO/PSO identifiers stay stable (PO1..PO11, PSO1, PSO2) so attainment maths is
 * unaffected; only the statement TEXT is per-department.
 */
const departmentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },       // e.g. "Computer Science & Engineering"
  code: { type: String, required: true, trim: true, uppercase: true, unique: true }, // e.g. "CSE"

  vision: [statementSchema],
  mission: [statementSchema],

  // Program-level outcomes (moved here from Institute).
  programOutcomes: [outcomeStatementSchema],         // PO1..PO11 (text editable, IDs fixed)
  programSpecificOutcomes: [outcomeStatementSchema], // PSO1, PSO2
  peos: [statementSchema],                            // Program Educational Objectives
  wks: [statementSchema],                             // Knowledge & attitude profile (WK)
  academicObjectives: [statementSchema],             // departmental academic objectives/targets

  active: { type: Boolean, default: true },
}, { timestamps: true });

departmentSchema.index({ code: 1 }, { unique: true });

export default mongoose.model('Department', departmentSchema);

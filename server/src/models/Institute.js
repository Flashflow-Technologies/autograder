import mongoose from 'mongoose';

/**
 * Institute — a single institution-wide settings document (singleton).
 * Holds the institute name, institute-level Vision/Mission statements, and the
 * accreditation statement TEXT for stable PO/PSO/PEO/WK identifiers.
 *
 * Design note (agreed): PO/PSO identifiers stay STABLE (PO1..PO11, PSO1, PSO2)
 * so the CO-PO matrix and attainment engine keep working; the admin edits the
 * *statement text* attached to each ID. PEOs and WK (Knowledge & attitude
 * profile / Washington-accord knowledge) are fully add/remove lists since they
 * don't constrain attainment maths.
 */

// A simple ordered statement (for Vision/Mission bullet lists, PEOs, WK).
const statementSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true },
  order: { type: Number, default: 0 },
}, { _id: true });

// A fixed-ID outcome whose TEXT is editable (PO1.. / PSO1.. keep their IDs).
const outcomeStatementSchema = new mongoose.Schema({
  key: { type: String, required: true },   // e.g. 'PO1', 'PSO1' — stable identifier
  statement: { type: String, default: '', trim: true },
}, { _id: false });

const instituteSchema = new mongoose.Schema({
  // Singleton marker so we always upsert the one settings doc.
  singleton: { type: String, default: 'INSTITUTE', unique: true, immutable: true },

  name: { type: String, trim: true, default: '' },

  vision: [statementSchema],   // institute vision statement(s)
  mission: [statementSchema],  // institute mission statement(s)
}, { timestamps: true });

// Singleton accessor for the one institute settings document.
instituteSchema.statics.getOrCreate = async function getOrCreate() {
  let doc = await this.findOne({ singleton: 'INSTITUTE' });
  if (!doc) doc = await this.create({ singleton: 'INSTITUTE' });
  return doc;
};

export default mongoose.model('Institute', instituteSchema);
export { statementSchema, outcomeStatementSchema };

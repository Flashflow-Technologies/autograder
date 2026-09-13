/**
 * Binds all institutional schemas to a specific tenant connection.
 *
 * The schemas are imported (now exported as named schemas from the model files)
 * and registered on the given connection. The same schema definitions serve
 * every tenant, but each call binds them to a DIFFERENT database connection, so
 * the resulting models read/write only that tenant's database.
 *
 * Controllers receive these via req.db.<Model> and must NEVER import a globally
 * registered model — that is the rule that keeps tenants isolated in code.
 */
import { courseSchema } from '../models/Course.js';
import { examSchema } from '../models/Exam.js';
import { questionPaperSchema } from '../models/QuestionPaper.js';
import { userSchema } from '../models/User.js';
import { questionBankSchema } from '../models/QuestionBank.js';
import { moduleNotesSchema } from '../models/ModuleNotes.js';
import {
  schemeSchema, submissionSchema, scoreSchema,
  attainmentSchema, appealSchema, auditLogSchema,
} from '../models/index.js';

/**
 * @param {import('mongoose').Connection} conn  a tenant's Mongoose connection
 * @returns {Object} map of model name -> Model bound to that connection
 */
export function bindTenantModels(conn) {
  // conn.models caches registrations, so this is safe to call repeatedly.
  return {
    User: conn.models.User || conn.model('User', userSchema),
    Course: conn.models.Course || conn.model('Course', courseSchema),
    Exam: conn.models.Exam || conn.model('Exam', examSchema),
    QuestionPaper: conn.models.QuestionPaper || conn.model('QuestionPaper', questionPaperSchema),
    QuestionBank: conn.models.QuestionBank || conn.model('QuestionBank', questionBankSchema),
    ModuleNotes: conn.models.ModuleNotes || conn.model('ModuleNotes', moduleNotesSchema),
    Scheme: conn.models.Scheme || conn.model('Scheme', schemeSchema),
    Submission: conn.models.Submission || conn.model('Submission', submissionSchema),
    Score: conn.models.Score || conn.model('Score', scoreSchema),
    Attainment: conn.models.Attainment || conn.model('Attainment', attainmentSchema),
    Appeal: conn.models.Appeal || conn.model('Appeal', appealSchema),
    AuditLog: conn.models.AuditLog || conn.model('AuditLog', auditLogSchema),
  };
}

export const TENANT_MODEL_NAMES = [
  'User', 'Course', 'Exam', 'QuestionPaper', 'QuestionBank', 'ModuleNotes',
  'Scheme', 'Submission', 'Score', 'Attainment', 'Appeal', 'AuditLog',
];

import 'dotenv/config';
import { connectDB, disconnectDB } from '../config/db.js';
import User from '../models/User.js';
import Course from '../models/Course.js';
import logger from './logger.js';

/** Seeds an admin, a faculty, a student, and one course with COs + CO-PO matrix. */
async function seed() {
  await connectDB();
  logger.info('Seeding database');

  await Promise.all([User.deleteMany({}), Course.deleteMany({})]);

  const admin = new User({ name: 'Admin', email: 'admin@demo.edu', role: 'admin', employeeId: 'EMP001', consentGiven: true });
  await admin.setPassword('admin123');
  const faculty = new User({ name: 'Dr. Faculty', email: 'faculty@demo.edu', role: 'faculty', employeeId: 'EMP100', department: 'CSE', consentGiven: true });
  await faculty.setPassword('faculty123');
  const hod = new User({ name: 'Dr. HoD', email: 'hod@demo.edu', role: 'hod', employeeId: 'EMP010', department: 'CSE', consentGiven: true });
  await hod.setPassword('hod123');
  const student = new User({ name: 'Ravi Kumar', email: 'student@demo.edu', role: 'student', rollNo: '21CS047', department: 'CSE', cohort: '2021-CSE-A', consentGiven: true });
  await student.setPassword('student123');
  await Promise.all([admin.save(), faculty.save(), hod.save(), student.save()]);

  const weights = (obj) => ({ PO1: 0, PO2: 0, PO3: 0, PO4: 0, PO5: 0, PO6: 0, PO7: 0, PO8: 0, PO9: 0, PO10: 0, PO11: 0, PSO1: 0, PSO2: 0, ...obj });
  await Course.create({
    code: 'CS401', title: 'Computer Networks', department: 'CSE', semester: 4, facultyId: faculty._id,
    cos: [
      { coId: 'CO1', description: 'Define network fundamentals', maxRbtl: 'L1' },
      { coId: 'CO2', description: 'Explain protocols', maxRbtl: 'L2' },
      { coId: 'CO3', description: 'Apply routing concepts', maxRbtl: 'L3' },
      { coId: 'CO4', description: 'Analyse network design', maxRbtl: 'L4' },
      { coId: 'CO5', description: 'Evaluate security models', maxRbtl: 'L5' },
    ],
    coPoMatrix: [
      { coId: 'CO1', weights: weights({ PO1: 3, PO2: 3, PSO1: 3, PSO2: 2 }) },
      { coId: 'CO2', weights: weights({ PO1: 3, PO2: 3, PO3: 3, PSO1: 3, PSO2: 3 }) },
      { coId: 'CO3', weights: weights({ PO2: 3, PO3: 3, PO4: 3, PSO2: 3 }) },
      { coId: 'CO4', weights: weights({ PO3: 3, PO4: 3, PO5: 3, PO9: 3, PSO2: 3 }) },
      { coId: 'CO5', weights: weights({ PO4: 3, PO5: 3, PO6: 3, PSO1: 3, PSO2: 3 }) },
    ],
    examSchemes: [
      { examType: 'SEE', kind: 'equal_per_module', moduleCount: 5, totalMarks: 100 },
      { examType: 'CIE 1', kind: 'per_co', slots: [{ co: 'CO1', marks: 10 }, { co: 'CO2', marks: 10 }, { co: 'CO3', marks: 5 }] },
      { examType: 'CIE 2', kind: 'per_co', slots: [{ co: 'CO3', marks: 5 }, { co: 'CO4', marks: 10 }, { co: 'CO5', marks: 10 }] },
    ],
    enforceModuleCoMapping: false,
  });

  logger.info('Seed complete: admin@demo.edu / faculty@demo.edu / hod@demo.edu / student@demo.edu (pw: role+123)');
  await disconnectDB();
  process.exit(0);
}

seed().catch((err) => { logger.error('Seed failed', { error: err.message }); process.exit(1); });

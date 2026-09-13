import Course from '../models/Course.js';
import Exam from '../models/Exam.js';
import { Forbidden, NotFound } from '../utils/errors.js';

/**
 * Course-level access control.
 *
 * Rules (agreed):
 *  - admin: full access to everything.
 *  - faculty: may act on a course ONLY if they are in some offering's facultyIds.
 *  - hod: may VIEW courses offered by their department, but not create/modify/
 *    evaluate (that stays with the mapped faculty).
 *
 * "action" is 'view' or 'write' (write = create/modify/evaluate). HOD view is
 * allowed for their department; write is faculty-mapped-only.
 *
 * These helpers throw Forbidden/NotFound so controllers can call them inline.
 */

/** Is this faculty mapped to teach this course (in any offering)? */
export function isFacultyMapped(course, userId) {
  const uid = String(userId);
  return (course.offerings || []).some((o) => (o.facultyIds || []).some((f) => String(f) === uid));
}

/** Does this course have an offering in the user's department (for HOD view)? */
export function courseInDepartment(course, departmentId) {
  if (!departmentId) return false;
  const did = String(departmentId);
  return (course.offerings || []).some((o) => String(o.departmentId) === did);
}

/**
 * Assert the user may perform `action` ('view'|'write') on the course.
 * Returns the course document (lean=false so callers can mutate if needed).
 */
export async function assertCourseAccess(user, courseId, action = 'write') {
  const course = await Course.findById(courseId);
  if (!course) throw NotFound('Course not found.');

  if (user.role === 'admin') return course;

  if (user.role === 'faculty') {
    if (isFacultyMapped(course, user.id)) return course;
    throw Forbidden('You are not mapped to this course. Ask an admin to assign you.');
  }

  if (user.role === 'hod') {
    // HOD: view their department's courses, and set attainment targets for them
    // ('targets' action), but not otherwise modify course structure.
    if ((action === 'view' || action === 'targets') && courseInDepartment(course, user.departmentId)) return course;
    throw Forbidden('HODs can view their department\u2019s courses and set targets, but not modify course structure.');
  }

  throw Forbidden('Not authorised for this course.');
}

/** Resolve the course behind an exam, then assert access. */
export async function assertExamAccess(user, examId, action = 'write') {
  const exam = await Exam.findById(examId).select('courseId');
  if (!exam) throw NotFound('Exam not found.');
  await assertCourseAccess(user, exam.courseId, action);
  return exam;
}

/** Filter a list of courses to those the user may see (for list endpoints). */
export function visibleCourses(courses, user) {
  if (user.role === 'admin') return courses;
  if (user.role === 'faculty') return courses.filter((c) => isFacultyMapped(c, user.id));
  if (user.role === 'hod') return courses.filter((c) => courseInDepartment(c, user.departmentId));
  return [];
}

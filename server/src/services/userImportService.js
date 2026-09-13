import * as XLSX from 'xlsx';

/**
 * Bulk user import — parsing + validation (pure, DB-free so it is unit-testable).
 *
 * Handles CSV and Excel via SheetJS (one library, both formats). The expected
 * columns (case-insensitive, flexible aliases):
 *   name, email, role, department, cohort, and an identifier that is
 *   rollNo for students / employeeId for faculty|hod|admin.
 *
 * Design choices baked in:
 *  - NO password column: passwords are auto-generated at creation time.
 *  - role-conditional identifier: students -> rollNo, others -> employeeId.
 *  - validation returns per-row status so the UI can show a preview with errors
 *    before anything is written.
 */

const VALID_ROLES = ['student', 'faculty', 'hod', 'admin'];

// Accept several spellings/casings for each logical column.
const COLUMN_ALIASES = {
  name: ['name', 'student name', 'full name', 'fullname'],
  email: ['email', 'e-mail', 'mail', 'email id', 'emailid'],
  role: ['role', 'user role', 'type'],
  department: ['department', 'dept', 'branch'],
  cohort: ['cohort', 'batch', 'class', 'admission year'],
  section: ['section', 'sec', 'div', 'division'],
  rollNo: ['rollno', 'roll no', 'roll number', 'register number', 'register no', 'registration number', 'usn', 'reg no', 'regno'],
  employeeId: ['employeeid', 'employee id', 'emp id', 'empid', 'staff id', 'staffid'],
};

function buildHeaderMap(headerRow) {
  // Map each source header -> canonical field name.
  const map = {};
  headerRow.forEach((h, idx) => {
    const norm = String(h || '').trim().toLowerCase();
    for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (aliases.includes(norm)) { map[idx] = canonical; return; }
    }
  });
  return map;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Parse a file buffer (csv/xlsx) into an array of raw row objects using the
 * canonical field names. Returns { rows, detectedColumns }.
 */
export function parseBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { rows: [], detectedColumns: [] };
  // header:1 -> array-of-arrays so we can map arbitrary headers ourselves.
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
  if (!aoa.length) return { rows: [], detectedColumns: [] };

  const headerMap = buildHeaderMap(aoa[0]);
  const detectedColumns = [...new Set(Object.values(headerMap))];
  const rows = [];
  for (let r = 1; r < aoa.length; r++) {
    const rowArr = aoa[r];
    if (!rowArr || rowArr.every((c) => String(c).trim() === '')) continue; // skip blank lines
    const obj = {};
    Object.entries(headerMap).forEach(([idx, field]) => {
      obj[field] = String(rowArr[idx] ?? '').trim();
    });
    rows.push(obj);
  }
  return { rows, detectedColumns };
}

/**
 * Validate parsed rows. Cross-checks in-file duplicates; the caller adds a
 * DB-existence check separately (so this stays pure/testable).
 *
 * @param rows parsed row objects
 * @returns [{ rowNumber, data, status:'ok'|'error', errors:[], normalized:{} }]
 */
export function validateRows(rows) {
  const seenEmails = new Map();      // email -> first rowNumber
  const seenRoll = new Map();
  const seenEmp = new Map();

  return rows.map((raw, i) => {
    const rowNumber = i + 2; // +2: 1 for header, 1 for 1-based display
    const errors = [];

    const name = (raw.name || '').trim();
    const email = (raw.email || '').trim().toLowerCase();
    const role = (raw.role || '').trim().toLowerCase();
    const department = (raw.department || '').trim();
    const cohort = (raw.cohort || '').trim();
    const section = (raw.section || '').trim();
    const rollNo = (raw.rollNo || '').trim();
    const employeeId = (raw.employeeId || '').trim();

    if (!name) errors.push('Name is required.');
    if (!email) errors.push('Email is required.');
    else if (!EMAIL_RE.test(email)) errors.push('Email format is invalid.');
    if (!role) errors.push('Role is required.');
    else if (!VALID_ROLES.includes(role)) errors.push(`Role must be one of: ${VALID_ROLES.join(', ')}.`);

    // Role-conditional identifier.
    let identifier = {};
    if (role === 'student') {
      if (!rollNo) errors.push('Register/Roll number is required for students.');
      else identifier.rollNo = rollNo;
      if (employeeId) errors.push('Students should not have an Employee ID (use Register number).');
    } else if (['faculty', 'hod', 'admin'].includes(role)) {
      if (!employeeId) errors.push('Employee ID is required for faculty/HOD/admin.');
      else identifier.employeeId = employeeId;
      if (rollNo) errors.push('Only students use a Register number; faculty/HOD/admin use Employee ID.');
    }

    // Students generally need a cohort for grouping/assessments; warn (not block).
    const warnings = [];
    if (role === 'student' && !cohort) warnings.push('No cohort — student won\u2019t appear in cohort lists until set.');

    // In-file duplicate checks.
    if (email) {
      if (seenEmails.has(email)) errors.push(`Duplicate email in file (also row ${seenEmails.get(email)}).`);
      else seenEmails.set(email, rowNumber);
    }
    if (identifier.rollNo) {
      if (seenRoll.has(identifier.rollNo)) errors.push(`Duplicate register number in file (also row ${seenRoll.get(identifier.rollNo)}).`);
      else seenRoll.set(identifier.rollNo, rowNumber);
    }
    if (identifier.employeeId) {
      if (seenEmp.has(identifier.employeeId)) errors.push(`Duplicate employee ID in file (also row ${seenEmp.get(identifier.employeeId)}).`);
      else seenEmp.set(identifier.employeeId, rowNumber);
    }

    return {
      rowNumber,
      data: { name, email, role, department, cohort, section, rollNo, employeeId },
      normalized: { name, email, role, department, cohort, section, ...identifier },
      status: errors.length ? 'error' : 'ok',
      errors,
      warnings,
    };
  });
}

/** Secure, human-typeable temporary password (no ambiguous chars). */
export function generatePassword(len = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let p = '';
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    const arr = new Uint32Array(len);
    cryptoObj.getRandomValues(arr);
    for (let i = 0; i < len; i++) p += chars[arr[i] % chars.length];
  } else {
    for (let i = 0; i < len; i++) p += chars[Math.floor(Math.random() * chars.length)];
  }
  return p;
}

/** Build a downloadable template workbook (as a buffer) with headers + example. */
export function buildTemplateBuffer() {
  const rows = [
    ['name', 'email', 'role', 'department', 'cohort', 'section', 'rollNo', 'employeeId'],
    ['Asha Rao', 'asha@example.edu', 'student', 'CSE', '2021-CSE-A', '1CE21CS001', ''],
    ['Dr. Kiran M', 'kiran@example.edu', 'faculty', 'CSE', '', '', 'EMP1023'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Users');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/** Build a credentials sheet (buffer) for successfully-created users. */
export function buildCredentialsBuffer(created) {
  const rows = [['name', 'email', 'role', 'identifier', 'temporaryPassword']];
  for (const c of created) rows.push([c.name, c.email, c.role, c.identifier || '', c.tempPassword]);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Credentials');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export { VALID_ROLES };

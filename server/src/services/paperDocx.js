import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, VerticalAlign, HeadingLevel, ImageRun,
} from 'docx';
import { readQuestionImageBuffer } from './questionImageStore.js';
import logger from '../utils/logger.js';

// Institutional defaults — adjust per college. These appear on the header.
// Institution-wide constants. The COLLEGE name and PROGRAMME aren't stored per
// course (they're the same college-wide), so they're configurable via env with
// sensible fallbacks. The DEPARTMENT and all other details are driven by the
// actual course/exam data.
const COLLEGE_NAME = process.env.COLLEGE_NAME || 'CANARA ENGINEERING COLLEGE';
const DEFAULT_PROGRAMME = process.env.PROGRAMME || 'B.E. (CS&D)';

// Build the department line shown on the header, e.g.
// "DEPARTMENT OF COMPUTER SCIENCE & DESIGN, CANARA ENGINEERING COLLEGE".
function departmentLine(course) {
  const dept = (course?.department || '').trim();
  if (!dept) return COLLEGE_NAME;
  // If the stored department already reads like a full "DEPARTMENT OF ..." line,
  // use it as-is; otherwise wrap it.
  const deptUpper = dept.toUpperCase();
  const prefixed = deptUpper.startsWith('DEPARTMENT')
    ? deptUpper
    : `DEPARTMENT OF ${deptUpper}`;
  return `${prefixed}, ${COLLEGE_NAME}`;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

// Read intrinsic pixel dimensions from a PNG / JPEG / GIF buffer header without
// any image library (keeps the build dependency-free).
function imageSize(buf) {
  try {
    // PNG: width/height are big-endian uint32 at byte 16 and 20.
    if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    // GIF: little-endian uint16 at byte 6 and 8.
    if (buf.length > 10 && buf[0] === 0x47 && buf[1] === 0x49) {
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    }
    // JPEG: scan for a Start-Of-Frame marker (0xFFC0..0xFFCF, excluding C4/C8/CC).
    if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      let off = 2;
      while (off + 9 < buf.length) {
        if (buf[off] !== 0xff) { off++; continue; }
        const marker = buf[off + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
        }
        off += 2 + buf.readUInt16BE(off + 2);
      }
    }
  } catch { /* fall through to default */ }
  return { width: 400, height: 300 }; // sensible fallback
}

// Pre-fetch every question image referenced in the paper into a map keyed by
// imageFileId, scaling each to a max display width (in points) for the doc.
async function prefetchImages(paper, maxWidthPx = 360) {
  const map = {};
  const ids = [];
  for (const g of paper.groups || []) {
    for (const q of g.questions || []) {
      for (const s of q.subQuestions || []) {
        if (s.imageFileId) ids.push(String(s.imageFileId));
      }
    }
  }
  for (const id of ids) {
    try {
      const { buffer, contentType } = await readQuestionImageBuffer(id);
      const { width, height } = imageSize(buffer);
      const scale = width > maxWidthPx ? maxWidthPx / width : 1;
      map[id] = {
        buffer,
        type: contentType.includes('png') ? 'png' : contentType.includes('gif') ? 'gif' : 'jpg',
        width: Math.round(width * scale),
        height: Math.round(height * scale),
      };
    } catch (e) {
      logger.warn('Could not load question image for document', { id, error: e.message });
    }
  }
  return map;
}
const examTypeLabel = (t) => {
  const map = { 'CIE-1': 'CIE: TEST-1', 'CIE-2': 'CIE: TEST-2', SEE: 'SEE', CIE: 'CIE' };
  return map[t] || t;
};
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB') : '';

const thin = { style: BorderStyle.SINGLE, size: 1, color: '000000' };
const allBorders = { top: thin, bottom: thin, left: thin, right: thin };
const noBorders = {
  top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
  left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
};

const run = (text, opts = {}) => new TextRun({ text: String(text ?? ''), font: 'Times New Roman', size: 22, ...opts });
const para = (children, opts = {}) => new Paragraph({ children: Array.isArray(children) ? children : [children], ...opts });
const centered = (children, opts = {}) => para(children, { alignment: AlignmentType.CENTER, ...opts });

// USN grid: a small 10-cell empty box, like the sample's "USN" field.
function usnRow(courseCode) {
  const usnCells = [];
  for (let i = 0; i < 10; i++) {
    usnCells.push(new TableCell({
      borders: allBorders, width: { size: 300, type: WidthType.DXA },
      children: [centered(run(''))],
    }));
  }
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [700, 3000, 2660, 3000],
    borders: noBorders,
    rows: [new TableRow({ children: [
      new TableCell({ borders: noBorders, verticalAlign: VerticalAlign.CENTER, width: { size: 700, type: WidthType.DXA },
        children: [para(run('USN', { bold: true }))] }),
      new TableCell({ borders: noBorders, width: { size: 3000, type: WidthType.DXA }, children: [
        new Table({ width: { size: 3000, type: WidthType.DXA }, columnWidths: Array(10).fill(300),
          rows: [new TableRow({ children: usnCells })] }),
      ] }),
      new TableCell({ borders: noBorders, width: { size: 2660, type: WidthType.DXA }, children: [para(run(''))] }),
      new TableCell({ borders: noBorders, verticalAlign: VerticalAlign.CENTER, width: { size: 3000, type: WidthType.DXA },
        children: [para([run('Course Code: ', { bold: true }), run(courseCode, { bold: true })], { alignment: AlignmentType.RIGHT })] }),
    ] })],
  });
}

// Shared header block used by both the QP and the scheme.
function headerBlock({ course, exam, department, programme }) {
  return [
    usnRow(exam.subjectCode || course.code),
    centered(run(department, { bold: true }), { spacing: { before: 60, after: 60 } }),
    centered([
      run('Programme: '), run(programme, { bold: true }),
      run('     Semester: '), run(ROMAN[course.semester] || course.semester || '', { bold: true }),
      run('     '), run(examTypeLabel(exam.examType), { bold: true }),
      run('     Date: '), run(fmtDate(exam.examDate), { bold: true }),
    ]),
    centered([run('Course Title: '), run(course.title, { bold: true })]),
    new Table({
      width: { size: 9360, type: WidthType.DXA }, columnWidths: [4680, 4680], borders: noBorders,
      rows: [new TableRow({ children: [
        new TableCell({ borders: noBorders, children: [para([run('Duration: '), run(`${exam.durationMins} MINUTES`, { bold: true })])] }),
        new TableCell({ borders: noBorders, children: [para([run('Max. Marks: '), run(exam.maxMarks, { bold: true })], { alignment: AlignmentType.RIGHT })] }),
      ] })],
    }),
  ];
}

// Signature / moderation block at the foot of each document.
function signatureBlock() {
  const cell = (text, bold = true) => new TableCell({ borders: allBorders, verticalAlign: VerticalAlign.CENTER,
    margins: { top: 200, bottom: 200, left: 100, right: 100 },
    children: [centered(run(text, { bold, size: 18 }))] });
  return new Table({
    width: { size: 9360, type: WidthType.DXA }, columnWidths: [4680, 4680],
    rows: [
      new TableRow({ children: [cell('Signature of Course Instructor/Paper Setter with Date'), cell('Signature of Course Coordinator with Date')] }),
      new TableRow({ children: [new TableCell({ borders: allBorders, columnSpan: 2, margins: { top: 100, bottom: 100, left: 100, right: 100 },
        children: [
          centered(run('Questions, CO, RBTL, Coverage and difficulty level is appropriate / inadequate.', { size: 18 })),
          centered(run('APPROVED / NOT APPROVED', { bold: true, size: 18 })),
        ] })] }),
      new TableRow({ children: [cell('Signature of Senior Faculty/Expert with Date'), cell('Signature of Senior Faculty/Expert with Date')] }),
      new TableRow({ children: [new TableCell({ borders: allBorders, columnSpan: 2, margins: { top: 300, bottom: 300, left: 100, right: 100 },
        children: [centered(run('HEAD OF THE DEPARTMENT/CHAIRMAN – MODERATION COMMITTEE', { bold: true, size: 18 }))] })] }),
    ],
  });
}

// Walk the paper's module structure into a flat ordered list of rows for the
// table. Each OR group yields its question(s) plus an "OR" separator row.
function moduleRows(paper, { withCoRbtl, images = {} }) {
  const rows = [];
  const colCount = withCoRbtl ? 5 : 3;

  const moduleHeader = (modNo) => new TableRow({ children: [
    new TableCell({ borders: allBorders, columnSpan: colCount, shading: undefined,
      children: [centered(run(`MODULE-${modNo}`, { bold: true }))] }),
  ] });

  const orRow = () => new TableRow({ children: [
    new TableCell({ borders: allBorders, columnSpan: colCount, children: [centered(run('OR', { bold: true }))] }),
  ] });

  const qRow = (qno, sub) => {
    // Question cell: the text, plus the attached image (if any) below it.
    const questionChildren = [para(run(sub.text))];
    const img = sub.imageFileId ? images[String(sub.imageFileId)] : null;
    if (img) {
      questionChildren.push(new Paragraph({
        spacing: { before: 60 },
        children: [new ImageRun({
          data: img.buffer,
          transformation: { width: img.width, height: img.height },
          type: img.type,
        })],
      }));
    }
    const cells = [
      new TableCell({ borders: allBorders, width: { size: 700, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
        margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [centered(run(`${qno}.${sub.label}.`))] }),
      new TableCell({ borders: allBorders, width: { size: withCoRbtl ? 6300 : 7600, type: WidthType.DXA },
        margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: questionChildren }),
      new TableCell({ borders: allBorders, width: { size: 900, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
        margins: { top: 60, bottom: 60, left: 40, right: 40 }, children: [centered(run(sub.marks))] }),
    ];
    if (withCoRbtl) {
      cells.push(new TableCell({ borders: allBorders, width: { size: 700, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
        margins: { top: 60, bottom: 60, left: 40, right: 40 }, children: [centered(run((sub.co || '').replace(/^CO/i, '')))] }));
      cells.push(new TableCell({ borders: allBorders, width: { size: 760, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
        margins: { top: 60, bottom: 60, left: 40, right: 40 }, children: [centered(run((sub.rbtl || '').replace(/^L/i, '')))] }));
    }
    return new TableRow({ children: cells });
  };

  // Group questions by module number (fallback to sequential modules).
  const groups = paper.groups || [];
  let lastModule = null;
  groups.forEach((g) => {
    const mod = g.questions?.[0]?.moduleNo || (lastModule || 0) + 1;
    if (mod !== lastModule) { rows.push(moduleHeader(mod)); lastModule = mod; }
    g.questions.forEach((q, qi) => {
      (q.subQuestions || []).forEach((sub) => rows.push(qRow(q.questionNo, sub)));
      if (g.groupType === 'or_pair' && qi === 0) rows.push(orRow());
    });
  });
  return rows;
}

// ---- Question paper ----
export async function buildQuestionPaperDocx({ course, exam, paper, options = {} }) {
  const withCoRbtl = options.withCoRbtl !== false; // default: include CO/RBTL columns
  const department = options.department || departmentLine(course);
  const programme = options.programme || DEFAULT_PROGRAMME;

  const headerCells = withCoRbtl
    ? ['Qn. No.', 'Question', 'Marks', 'CO', 'RBTL']
    : ['Qn. No.', 'Question', 'Marks'];
  const colWidths = withCoRbtl ? [700, 6300, 900, 700, 760] : [700, 7600, 900];

  const headerRow = new TableRow({ tableHeader: true, children: headerCells.map((h, i) =>
    new TableCell({ borders: allBorders, width: { size: colWidths[i], type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
      margins: { top: 60, bottom: 60, left: 60, right: 60 }, children: [centered(run(h, { bold: true }))] })) });

  const images = await prefetchImages(paper);
  const table = new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: colWidths,
    rows: [headerRow, ...moduleRows(paper, { withCoRbtl, images })] });

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Times New Roman', size: 22 } } } },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
      children: [
        ...headerBlock({ course, exam, department, programme }),
        para(run(''), { border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 1 } } }),
        centered([run('Note: ', { bold: true, italics: true }), run('Answer any ONE full question from each Module', { italics: true })], { spacing: { before: 80, after: 120 } }),
        table,
        para(run(''), { spacing: { before: 200 } }),
        signatureBlock(),
      ],
    }],
  });
  return Packer.toBuffer(doc);
}

// ---- Scheme of valuation ----
export async function buildSchemeDocx({ course, exam, paper, scheme, options = {} }) {
  const department = options.department || departmentLine(course);
  const programme = options.programme || DEFAULT_PROGRAMME;

  // Index scheme entries by (groupIndex, questionNo, subLabel) for lookup.
  const schemeByKey = {};
  (scheme?.entries || []).forEach((e) => { schemeByKey[`${e.groupIndex}-${e.questionNo}-${e.subLabel}`] = e; });

  const colWidths = [800, 7560, 1000];
  const headerRow = new TableRow({ tableHeader: true, children: ['Qn. No.', 'Question', 'Marks'].map((h, i) =>
    new TableCell({ borders: allBorders, width: { size: colWidths[i], type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
      margins: { top: 60, bottom: 60, left: 60, right: 60 }, children: [centered(run(h, { bold: true }))] })) });

  const rows = [headerRow];
  (paper.groups || []).forEach((g, gi) => {
    g.questions.forEach((q) => {
      (q.subQuestions || []).forEach((sub) => {
        const entry = schemeByKey[`${gi}-${q.questionNo}-${sub.label}`];
        const answer = entry?.modelAnswer || '(model answer not provided)';
        // Split the model answer into lines so it reads as a structured scheme.
        const answerParas = String(answer).split('\n').filter((l) => l.trim().length)
          .map((line) => para(run(line.trim()), { spacing: { after: 40 } }));
        rows.push(new TableRow({ children: [
          new TableCell({ borders: allBorders, width: { size: 800, type: WidthType.DXA }, verticalAlign: VerticalAlign.TOP,
            margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [para(run(`${q.questionNo}.${sub.label}.`))] }),
          new TableCell({ borders: allBorders, width: { size: 7560, type: WidthType.DXA },
            margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: answerParas.length ? answerParas : [para(run(''))] }),
          new TableCell({ borders: allBorders, width: { size: 1000, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
            margins: { top: 60, bottom: 60, left: 40, right: 40 }, children: [centered(run(`${sub.marks}M`))] }),
        ] }));
      });
    });
  });

  const table = new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: colWidths, rows });

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Times New Roman', size: 22 } } } },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
      children: [
        ...headerBlock({ course, exam, department, programme }),
        centered(run('SCHEME OF VALUATION', { bold: true }), { spacing: { before: 80, after: 120 } }),
        table,
        para(run(''), { spacing: { before: 200 } }),
        signatureBlock(),
      ],
    }],
  });
  return Packer.toBuffer(doc);
}

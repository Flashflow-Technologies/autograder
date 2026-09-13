# OBE-COMPLIANT AUTOMATED EXAM EVALUATION SYSTEM
## Final Year Engineering Project Report

---

## EXECUTIVE SUMMARY

EvalAI is a comprehensive web-based Outcome-Based Education (OBE) examination evaluation system designed to streamline the assessment of student learning outcomes against defined program outcomes, modelled on the VTU (Visvesvaraya Technological University) examination scheme. The system automates the scoring of descriptive answers through AI-powered natural language processing while keeping faculty firmly in control of every grade — its guiding principle is "AI assists, humans decide." It produces transparent, auditable evaluation workflows and ready-made CO/PO attainment evidence for accreditation bodies (NBA/NAAC).

**Key Features:**
- VTU-style module-structured question papers (Module → OR-pair → sub-questions) with internal-choice (OR) equivalence enforcement
- Bloom's-level (RBTL) ceiling enforcement: a question's cognitive level can never exceed the Bloom's level of the CO it assesses, derived automatically from each CO statement; questions whose verb implies a higher level are flagged
- Admin-configurable per-exam-type marks schemes (SEE equal-per-module; CIE-1/CIE-2 fixed per-CO weightage)
- Optional AI question generation from uploaded lecture notes (PDF/DOCX), producing editable draft OR-pairs, with a per-course question bank that avoids repetition across papers
- AI-powered scoring of descriptive answers (semantic similarity + keyword + grammar + readability) with faculty review, adjustment (logged), and approval
- **Programming questions (Python, Java, C, C++)**: student code is compiled and executed against faculty-authored test cases inside a sandboxed engine (Judge0), scored on correctness plus code-quality indicators (complexity, style) per a configurable rubric, with faculty review
- Time-gated exam delivery with autosave, grace periods, handwritten-answer scan upload + OCR, and attachable question images (embedded in downloadable papers)
- Downloadable, institution-formatted question papers and valuation schemes (Word), with internal and clean student-facing versions
- Post-submission lock with a faculty-mediated re-access request workflow (single-use, window-limited, resumes existing answers)
- Live evaluation-progress indicator so faculty see background scoring complete in real time
- Student result view with an appeal mechanism; faculty appeal resolution that recomputes scores and attainment
- Role-based access (Admin, Faculty, Student, HoD) with faculty exam isolation
- HoD dashboard: department-wide CO **and PO/PSO** attainment using the NBA level (1/2/3) formula, aggregated across all courses
- **Admin dashboards**: filterable user-management view and an audit-log view of every material action
- **Self-hosted licensing**: signed licence keys enforce plan tier and validity; software updates are gated to active licences
- Whole-number marks stored and displayed consistently across student view, faculty view, totals, CSV export, and attainment
- Comprehensive audit trails, structured logging, and system monitoring

**Technology Stack:** MERN (MongoDB, Express.js, React, Node.js) + Python FastAPI AI service + Redis/BullMQ background worker + Judge0 sandboxed code execution
**Deployment:** Containerized with Docker Compose (nine services); fully free / open-source / self-hostable, with no paid APIs

---

## TABLE OF CONTENTS

1. [Introduction](#introduction)
2. [Problem Statement](#problem-statement)
3. [System Architecture](#system-architecture)
4. [Database Design](#database-design)
5. [UML Diagrams](#uml-diagrams)
6. [Component Details](#component-details)
7. [API Documentation](#api-documentation)
8. [Testing and Validation](#testing-and-validation)
9. [Deployment Guide (Free Platforms)](#deployment-guide)
10. [Business Model & Design-Thinking Canvases](#business-model)
11. [Conclusion](#conclusion)

---

## 1. INTRODUCTION

### 1.1 Background
Outcome-Based Education (OBE) is an educational approach focused on what students can do upon graduation rather than just what they know. Assessment of learning outcomes requires:
- Clear mapping of course outcomes (COs) to program outcomes (POs)
- Consistent evaluation of student work against defined criteria
- Aggregate analysis to demonstrate program effectiveness
- Transparent, auditable evaluation processes

Traditional manual grading and spreadsheet-based assessment workflows are prone to:
- Inconsistency across evaluators
- Lack of audit trails
- Manual error in computation and aggregation
- Difficulty in generating compliance reports

### 1.2 Proposed Solution
An integrated system that:
1. **Automates routine scoring** using AI (NLP) for baseline evaluation
2. **Empowers faculty review** with a per-student console to approve, modify, or flag scores
3. **Validates OBE constraints** at design time (CO-PO equivalence for OR questions)
4. **Aggregates outcomes data** for program-level analysis
5. **Maintains complete audit trails** for accreditation and accountability

### 1.3 Project Scope
- Web-based application for administrators, faculty, students, and Heads of Department (HoD)
- Support for 5 COs per course, 11 POs + 2 PSOs program-wide, with a CO-PO/PSO articulation matrix
- VTU module-structured papers: configurable module count, internal-choice (OR) pairs per module, with strict OR-equivalence (both sides identical in CO·RBTL·marks)
- Bloom's taxonomy (RBTL L1-L6): per-CO ceiling derived from the CO statement's action verb, enforced on both manual and AI-generated questions
- Per-exam-type marks schemes (admin-configurable): SEE equal-per-module; CIE-1 and CIE-2 fixed per-CO weightage giving each CO a balanced total across the two internals
- Optional AI question generation from uploaded notes (PDF/DOCX) with a per-course non-repeating question bank
- Handwritten-answer scan upload with OCR; attachable images on questions
- Post-submission lock with faculty-approved, single-use, window-limited re-access
- Email notifications for exam scheduling and result publication
- CSV reports for outcomes, audit trails, and student scores
- HoD department-level attainment dashboard (NBA level 1/2/3)

---

## 2. PROBLEM STATEMENT

### 2.1 Current Challenges
1. **Manual Grading Inconsistency** — faculty grade subjectively; student appeals often valid
2. **No CO-level Analysis** — schools cannot demonstrate per-outcome attainment to accreditors
3. **Lost Audit Trails** — no record of who approved what scores or when
4. **Operational Burden** — faculty spend excessive time on clerical tasks (grading, manual mapping, paper setting)
5. **Error-Prone Aggregation** — spreadsheet calculations error-prone, hard to audit
6. **Compliance Risk** — inability to prove assessment rigor to NBA/NAAC/accreditors
7. **Assessment-Outcome Misalignment** — questions sometimes test beyond the cognitive level the outcome targets, or papers drift from the prescribed module/marks structure

### 2.2 Requirements
**Functional:**
- Design VTU module-structured question papers with CO/RBTL tagging, OR-pairs, and per-exam-type marks schemes
- Enforce that a question's Bloom's level never exceeds its CO's ceiling
- Optionally generate draft questions from lecture notes
- Deliver time-gated exams with secure submission, autosave, scan upload, and question images
- Score descriptive answers using AI with human review/adjustment/approval
- Publish results to students with an appeal mechanism and a re-access workflow
- Generate CO and PO attainment reports and a department-level HoD dashboard
- Maintain audit trails of all approvals and score changes

**Non-Functional:**
- System uptime: 99% during exam periods
- Latency: API responses < 500ms (heavy ML work offloaded to an async worker so the API stays responsive)
- Audit logging: 100% of material state changes
- Scalability: support concurrent exam-taking via stateless API + queue-based scoring
- Security: RBAC (4 roles), JWT auth, rate limiting, input validation, faculty data isolation
- Cost: strictly free / open-source / self-hostable — no paid APIs
- Auditability: export audit trails and reports in standard formats

---

## 3. SYSTEM ARCHITECTURE

### 3.1 High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                          END USERS                              │
├──────────────────────────────────────────────────────────────────┤
│   Admin (institute settings)  │  Faculty (exams, review)        │
│   Students (take exams, view results, appeal)                   │
└──────────────────────────────────────────────────────────────────┘
                                 │
                    ┌────────────┴─────────────┐
                    │                          │
            ┌───────▼──────┐         ┌────────▼────────┐
            │  React SPA   │         │   REST API      │
            │  (nginx)     │◄───────►│  (Express.js)   │
            │  Port 8080   │         │  Port 5000      │
            └──────────────┘         └────────┬────────┘
                                              │
        ┌──────────────┬──────────────┬───────┼───────────┬─────────────────┐
        │              │              │       │           │                 │
 ┌──────▼─────┐ ┌──────▼────┐ ┌───────▼───┐ ┌─▼─────────┐ ┌────────────────▼┐
 │  MongoDB   │ │  Redis    │ │ Python    │ │  Judge0   │ │ BullMQ Worker   │
 │ (database  │ │ (queue +  │ │ AI Svc    │ │ sandboxed │ │ (background     │
 │  + GridFS) │ │  cache)   │ │ :8000     │ │ code exec │ │  scoring,email) │
 │  :27017    │ │  :6379    │ │           │ │ :2358     │ │                 │
 └────────────┘ └───────────┘ └───────────┘ └─────┬─────┘ └─────────────────┘
                                                   │
                                       ┌───────────┴────────────┐
                                       │ judge0-db (Postgres) + │
                                       │ judge0-redis           │
                                       └────────────────────────┘

Nine Docker services in total: mongo, redis, ai-service, server (API),
worker, client (nginx), judge0, judge0-db, judge0-redis.
```

### 3.2 Architectural Layers

#### **Presentation Layer (Frontend)**
- React 18 + Vite (fast bundling)
- React Router (SPA navigation)
- Recharts (attainment bar charts on the HoD dashboard)
- Axios interceptor (JWT auth, error logging)
- Role-based route guards (admin, faculty, student, hod)
- Components: exam builder (module-structured, marks-scheme aware), question paper editor with image upload, scheme editor, faculty review console, re-access and appeals panels, student exam/result views, HoD attainment dashboard

#### **API Layer (Express.js)**
- RESTful endpoints for all operations
- JWT middleware for authentication
- Role-based authorization guards
- Input validation (Joi schemas)
- Centralized error handling with Winston logging
- Request context middleware (correlates client/server logs with request IDs)

#### **Business Logic Layer (Services)**
- **AuditService** — records all material state changes
- **ScoringService** — orchestrates AI scoring + final score computation (marks rounded to whole numbers, capped at max)
- **AttainmentService** — aggregates CO/PO attainment from published exams
- **HodService** — maps CO attainment percentages to NBA levels (1/2/3) and aggregates them across a department's courses and exams
- **QuestionBank service** — records generated questions per course and supplies the "avoid" set so generation does not repeat across papers
- **QuestionImageStore / ScanStore** — GridFS-backed storage for question figures and handwritten answer scans
- **JobDispatch** — enqueues background jobs (scoring, email)
- **NotificationService** — email templates (exam publication, result publication, appeal resolution)
- **AIClient** — calls the Python service (scoring, OCR, generation, answer drafting); gracefully degrades if AI unavailable
- **Bloom/ExamScheme utilities** — derive CO ceilings from CO statements and validate papers against the active marks scheme
- **CodeRunner / CodeQuality** — submit programming answers to Judge0 (compile + run against test cases), then compute correctness, complexity, and style into a rubric-weighted score
- **PaperDocx service** — generates institution-formatted question papers and valuation schemes as Word documents, embedding question images from GridFS
- **LicenseService** — verifies signed licence keys (RSA), exposes plan tier/feature flags/expiry, enforced via middleware on privileged actions
- **UpdateService** — gates software-update eligibility to active licences
- **AdminService (controllers)** — filterable user-management and audit-log dashboards

#### **Data Layer (MongoDB)**
- Document schemas for users, courses, exams, question papers, schemes, submissions, scores, appeals, question bank, module notes, and audit logs
- **GridFS** buckets for binary data: `answerScans` (handwritten submissions) and `questionImages` (figures attached to questions)
- Indexes on frequently queried fields (examId, studentId, status); sparse-unique indexes on rollNo/employeeId
- Mongoose ODM with pre/post hooks for validation and audit logging

#### **AI Service (Python FastAPI)**
- `POST /score` — scores a single student answer
  - Inputs: student answer, model answer, keywords, expected length, RBTL, CO, weights
  - Outputs: component scores (cosine, keyword, style, grammar), final score, confidence, feedback
  - Scoring components: sentence-transformer embedding (cosine similarity), keyword matching (spaCy), grammar checking (LanguageTool), readability (NLTK); each wrapped for graceful degradation
- `POST /ocr` — optical character recognition (Tesseract) for uploaded answer images. The backend stores the image in GridFS, calls this endpoint, and returns the extracted text plus the stored image id. The text pre-fills the student's answer box (editable), and the original image is shown to faculty during review. Returns empty text on failure so the image is still preserved for manual reading.
- `POST /generate` — extracts text from uploaded notes (PyMuPDF for PDF, python-docx for DOCX), ranks salient concepts using the embedding model, and produces template-based draft OR-pairs at the requested CO/RBTL/marks, accepting an "avoid" set so wording differs from previously-used questions
- `POST /draft-answer` — extractive model-answer drafting from notes (retained in the backend; the scheme-builder button is currently disabled)
- Pre-loads models at startup (warmup) so scoring requests don't incur cold-start latency

#### **Background Job Queue (BullMQ + Redis)**
- **Scoring queue** — triggered on exam submission; worker calls the AI service per sub-question, writes integer scores, then recomputes the total
- **Email queue** — triggered on exam publication and result publication
- Configurable concurrency; automatic retries with exponential backoff

#### **Code Execution Layer (Judge0)**
- Self-hosted, sandboxed execution engine for programming questions (Python, Java, C, C++)
- Runs each test case in an isolated environment with CPU/memory/wall-time and process limits, and no network access — untrusted student code can never reach the host
- The worker submits the student's source per test case (base64 I/O), polls for results, and reports pass/fail per case
- Requires `privileged` containers + cgroups; runs on a standard Linux Docker host

#### **Licensing & Updates Layer**
- Signed licence keys (RSA-SHA256): the vendor signs with a private key; the server verifies with an embedded public key, so customers cannot forge or extend licences
- Plan tiers map to feature flags (e.g. programming questions) and limits (e.g. max students); enforced via middleware on privileged actions; expiry degrades gracefully (read-only, never data loss)
- Update eligibility gated to active licences, so lapsed customers stop receiving updates until renewal

---

## 4. DATABASE DESIGN

### 4.1 Entity-Relationship Diagram

```
┌──────────────┐
│   USER       │
├──────────────┤
│ _id (PK)     │
│ name         │
│ email (UK)   │
│ role         │──┐  (admin, faculty, student, hod)
│ rollNo       │  │  (students; sparse-unique)
│ employeeId   │  │  (faculty/admin/hod; sparse-unique)
│ department   │  │  (scopes HoD dashboard)
│ cohort       │  │
│ active       │  │
│ createdAt    │  │
└──────────────┘  │
        │         │
        │    ┌────▼────────────────┐
        │    │    COURSE           │
        │    ├────────────────────┤
        │    │ _id (PK)           │
        │    │ code (UK)          │
        │    │ title              │
        │    │ department         │
        │    │ semester           │
        │    │ facultyId (FK)─────┤─────► USER
        │    │ cos: [             │
        │    │  {coId, desc,      │
        │    │   maxRbtl}         │  (Bloom's ceiling)
        │    │ ]                  │
        │    │ coPoMatrix: [      │
        │    │   {coId,weights}   │
        │    │ ]                  │
        │    │ examSchemes: [     │  (per exam type:
        │    │  {kind, modules,   │   marks layout)
        │    │   perCoMarks}]     │
        │    │ moduleCoMap        │  (optional)
        │    └────────────────────┘
        │              │
        │         ┌────▼──────────────┐
        │         │      EXAM         │
        │         ├───────────────────┤
        │         │ _id (PK)          │
        │         │ courseId (FK)─────┤─────► COURSE
        │         │ createdBy (FK)────┤─────► USER
        │         │ examType          │
        │         │ startTime         │
        │         │ duration          │
        │         │ maxMarks          │
        │         │ status: draft |   │
        │         │  scheduled|active │
        │         │  closed|archived  │
        │         └────┬──────────────┘
        │              │
        └──────┬───────┼────────────────┐
               │       │                │
       ┌───────▼──┐ ┌──▼──────────────┐│
       │SUBMISSION││  QUESTIONPAPER   ││
       ├─────────┤│ ├────────────────┤│
       │ _id (PK)││ │ _id (PK)        ││
       │examId◄──┘│ │examId◄──────┐   ││
       │studentId││ │groups: [     │   ││
       │ (FK)────┼──┤ {groupType,  │   ││
       │answers[  ││ │  questions:[ │   ││
       │ {gIdx,qNo││ │   {qNo,      │   ││
       │  subLabel││ │    moduleNo, │   ││
       │  inputMode││ │    subQs:[   ││   ││
       │  rawText ││ │     {label,  ││   ││
       │  ocrText ││ │      co,rbtl,││   ││
       │  scanFileId│ │      marks, ││   ││
       │ }]       ││ │      imageFileId││
       │status    ││ │     }]       ││   ││
       │ (in_prog/││ │   }]         ││   ││
       │ submitted││ │ }]           ││   ││
       │ /scored) ││ │ (Module→OR→  ││   ││
       │reAccess: ││ │  sub-question)││  ││
       │ {status, ││ └────────────────┘   ││
       │  reason, ││                      ││
       │  used}   ││                      ││
       │submitAt  │└──────────────────────┘
       └──────────┘
                          │
                   ┌──────▼──────────┐
                   │   SCORE         │
                   ├─────────────────┤
                   │ _id (PK)        │
                   │examId (FK, IX)──┤─────► EXAM
                   │studentId (FK,IX)├─────► USER
                   │totalScore       │
                   │published        │
                   │publishedByName  │
                   │publishedAt      │
                   │subScores: [     │
                   │  {qNo,subLabel, │
                   │   co, rbtl,     │
                   │   maxMarks,     │
                   │   aiScore,      │
                   │   finalScore,   │
                   │   confidence,   │
                   │   reviewStatus, │
                   │   reviewedByName│
                   │   reviewedAt}   │
                   │]                │
                   │orSelections: [ │
                   │  {groupIndex,   │
                   │   selectedQNo}  │
                   │]                │
                   │reviewState      │
                   └─────────────────┘
                          │
                   ┌──────▼──────────┐
                   │ ATTAINMENT      │
                   ├─────────────────┤
                   │ _id (PK)        │
                   │examId (FK)──────┤─────► EXAM
                   │courseId (FK)────┤─────► COURSE
                   │coAttainment: [  │
                   │  {coId, pct}    │
                   │]                │
                   │poAttainment: [  │
                   │  {poId, value}  │
                   │]                │
                   │ciActions: [...]│
                   └─────────────────┘

┌────────────────┐     ┌────────────────────┐
│  AUDITLOG      │     │     APPEAL         │
├────────────────┤     ├────────────────────┤
│ _id (PK)       │     │ _id (PK)           │
│ actorId (FK)───┤────► USER               │
│ action         │     │ scoreId (FK)───────┤───► SCORE
│ targetType     │     │ examId, studentId  │
│ targetId       │     │ questionNo,subLabel│
│ before         │     │ grounds, explanation│
│ after          │     │ status, outcome    │
│ timestamp (IX) │     │ revisedScore       │
│                │     │ resolvedByName     │
└────────────────┘     └────────────────────┘

┌────────────────────┐   ┌────────────────────┐
│   QUESTIONBANK     │   │    MODULENOTES     │
├────────────────────┤   ├────────────────────┤
│ _id (PK)           │   │ _id (PK)           │
│ courseId (FK,IX)───┤─► │ examId (FK)────────┤─► EXAM
│ co, rbtl           │ C │ moduleNo           │
│ text               │ O │ filename           │
│ normalizedText     │ U │ text (extracted)   │
│  (UK per course)   │ R │ charCount          │
│ sourceConcept      │ S │ (unique examId+mod)│
│ usedCount,lastUsed │ E └────────────────────┘
└────────────────────┘
  (per-course bank so generated questions
   don't repeat across that course's papers)
```

### 4.2 Key Design Decisions

1. **Embedded Arrays** — subScores, orSelections, and the Module→OR→sub-question tree are embedded in their parent documents (denormalized) for fast reads and atomic updates
2. **Mongoose ODM** — validation at save time; OR-equivalence checking (CO·RBTL·marks must be identical on both sides of a pair) and paper-vs-scheme validation
3. **Indexes** — compound indexes on (examId, studentId) for score lookup; timestamp indexes for audit log queries; sparse-unique indexes on rollNo and employeeId so empty identifiers don't collide
4. **GridFS for binaries** — handwritten answer scans (`answerScans`) and question figures (`questionImages`) are stored in GridFS rather than as base64 blobs in documents
5. **Per-course question bank** — generated questions are recorded per course (unique on normalized text) so future generations can avoid repeats; the bank deliberately survives exam deletion
6. **Single-use re-access state** — the `reAccess` sub-document on a submission tracks request → approve/reject → consumed, so a granted reopen cannot be reused
7. **Integer marks** — `finalScore` is stored as a whole number (standard rounding, capped at max) at every write point, so totals, display, CSV, and attainment all use one consistent value
8. **Audit Trail** — separate collection; every material change (score adjustment, OR selection, appeal resolution, re-access decision) recorded with actor, before/after values, timestamp, and reason

---

## 5. UML DIAGRAMS

### 5.1 Use Case Diagram

```
                       ┌─────────────────────────────────┐
                       │  EvalAI Exam Evaluation System  │
                       └─────────────────────────────────┘

  ┌─────────┐   ┌──────────────────┐   ┌──────────────────┐   ┌────────┐
  │  Admin  │   │     Faculty      │   │     Student      │   │  HoD   │
  └────┬────┘   └────────┬─────────┘   └────────┬─────────┘   └───┬────┘
       │                 │                      │                 │
  Create users      Build module-structured  Take exam        View dept
  & courses;        paper (OR-pairs);         (time-gated,     attainment
  set COs with      auto CO-ceiling on RBTL;  autosave);       overview;
  Bloom ceilings;   define marks scheme;      answer one OR    per-course
  configure marks   generate draft Qs from    side; upload     CO levels +
  schemes; assign   notes (non-repeating);    handwritten      PO/PSO across
  HoD role;         attach question images;   scan (OCR);      all courses;
  manage licence;   define model answers      view question    per-exam CO
  view users &      & scoring weights;        image; write &   bar charts
  audit-log         author programming Qs     submit code      (NBA L1/2/3)
  dashboards;       (test cases + rubric);    answers
  check updates     publish exam schedule
                         │                      │
                    Review console:        Submit answers;
                    approve / adjust       (locked after
                    (logged) / flag        submit) request
                    AI & code scores;      re-access; resume
                    see test results;      on approval; view
                    switch counted OR;     published result;
                    decide re-access;      appeal a question
                    resolve appeals;
                    watch live eval
                    progress; download
                    paper/scheme (Word);
                    publish; export CSV
                         │
                    Analyze outcomes:
                    CO & PO attainment;
                    generate reports
```

**Actors:** Admin (institutional setup, licensing, user/audit dashboards), Faculty (assessment lifecycle for their own exams, including programming questions), Student (exam-taking, code submission, and results), HoD (read-only department CO and PO/PSO attainment oversight). Faculty see only their own exams; Admin and HoD have broader visibility.

### 5.2 Class Diagram (Core Classes)

```
┌──────────────────────────────────────┐
│            User                       │
├──────────────────────────────────────┤
│ - _id: ObjectId                      │
│ - name: String                       │
│ - email: String (unique)             │
│ - passwordHash: String               │
│ - role: admin|faculty|student|hod    │
│ - rollNo: String (if student)        │
│ - employeeId: String (faculty/admin) │
│ - department: String                 │
│ - cohort: String                     │
│ - consentGiven: Boolean              │
│ - active: Boolean                    │
│ - createdAt: Date                    │
├──────────────────────────────────────┤
│ + setPassword(pwd): Promise          │
│ + verifyPassword(pwd): Promise<bool> │
│ + toJSON(): object                   │
└──────────────────────────────────────┘
         △                    △
         │                    │
         │ isA                │ isA
         │                    │
  ┌──────┴──────┐       ┌─────┴────────┐
  │   Faculty   │       │   Student    │
  │ (created by │       │ (created by  │
  │ admin,      │       │  self        │
  │ teaches     │       │  register)   │
  │ courses,    │       │              │
  │ reviews)    │       │ submits exams│
  └─────────────┘       │ views results│
                        └──────────────┘

┌───────────────────────────────────────┐
│           Course                      │
├───────────────────────────────────────┤
│ - _id: ObjectId                       │
│ - code: String (unique)               │
│ - title: String                       │
│ - department: String                  │
│ - semester: Number (1..8)             │
│ - facultyId: ObjectId (ref User)      │
│ - cos: CoDefinition[]                 │
│   {coId, description}                 │
│ - coPoMatrix: CoPoWeight[]            │
│   {coId, weights{PO→0..3}}            │
│ - createdAt, updatedAt: Date          │
├───────────────────────────────────────┤
│ + validateOrEquivalence(): Error[]    │
│ + getCOByName(co): CoDefinition|null  │
└───────────────────────────────────────┘
         △
         │ defines
         │
    ┌────┴───────┐
    │             │
┌───▼──────┐  ┌──▼──────┐
│  Exam    │  │Question │
│(schedule)   │ Paper   │
│(publish)    │(QP)     │
└──────────┘  └─────────┘

┌──────────────────────────────────────────┐
│           Exam                           │
├──────────────────────────────────────────┤
│ - _id: ObjectId                          │
│ - courseId: ObjectId (ref Course)        │
│ - examType: String ('CIE1','CIE2','VTU')│
│ - startTime: Date                        │
│ - duration: Minutes                      │
│ - gracePeriod: Minutes                   │
│ - maxMarks: Number                       │
│ - status: ExamStatus (enum)              │
│ - createdBy: ObjectId (ref User)         │
│ - createdAt, updatedAt: Date             │
├──────────────────────────────────────────┤
│ + canStudent_enter(userId, now): bool   │
│ + canStudent_submit(userId, now): bool  │
│ + isScheduled(): bool                    │
│ + isActive(): bool                       │
└──────────────────────────────────────────┘
         △
    ┌────┴──────────┐
    │               │
┌───▼────────┐  ┌──▼──────────┐
│ Question   │  │ Submission  │
│ Paper      │  │ (student    │
│            │  │ answers)    │
└────────────┘  └─────────────┘

┌──────────────────────────────────────┐
│      Submission (Student Answer)     │
├──────────────────────────────────────┤
│ - _id: ObjectId                      │
│ - examId: ObjectId (ref Exam)        │
│ - studentId: ObjectId (ref User)     │
│ - answers: {                         │
│     [qNo]: {text, scannedImageUrl}   │
│   }                                  │
│ - submittedAt: Date                  │
│ - gracePeriodUsed: Number (min)      │
├──────────────────────────────────────┤
│ + getAnswer(qNo): string             │
│ + getTimeSpent(): Number             │
└──────────────────────────────────────┘
         │ triggers async scoring
         │
    ┌────▼───────────┐
    │                │
┌───▼──────┐  ┌──────▼────────┐
│  Score   │  │ Attainment    │
│(computed)   │(aggregated from│
│            │ Score)         │
└──────────┘  └───────────────┘

┌──────────────────────────────────────┐
│           Score                      │
├──────────────────────────────────────┤
│ - _id: ObjectId                      │
│ - examId: ObjectId (ref Exam) [IX]   │
│ - studentId: ObjectId (ref User) [IX]│
│ - totalScore: Number (0..maxMarks)   │
│ - published: Boolean                 │
│ - publishedByName: String            │
│ - publishedAt: Date                  │
│ - reviewState: String (enum)         │
│ - subScores: SubScore[]              │
│   {questionNo, subLabel, co, rbtl,   │
│    maxMarks, aiScore, finalScore,    │
│    confidence, reviewStatus,         │
│    reviewedByName, reviewedAt,       │
│    foundKeywords, missingKeywords,   │
│    aiFeedback}                       │
│ - orSelections: OrSelection[]        │
│   {groupIndex, selectedQuestionNo}   │
│ - createdAt, updatedAt: Date         │
├──────────────────────────────────────┤
│ + isReady_for_publish(): bool        │
│ + hasReviewPending(): bool           │
│ + getCoWiseMarks(): {co→scored}      │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│         AuditLog                     │
├──────────────────────────────────────┤
│ - _id: ObjectId                      │
│ - actorId: ObjectId (ref User)       │
│ - actorRole: String                  │
│ - action: String (enum)              │
│ - targetType: String ('score', ...)  │
│ - targetId: ObjectId                 │
│ - before: Mixed (previous state)     │
│ - after: Mixed (new state)           │
│ - reason: String (required for adj.) │
│ - timestamp: Date [IX]               │
├──────────────────────────────────────┤
│ + describe(): string                 │
│ + getChanges(): object               │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│   SubQuestion (embedded in paper)     │
├──────────────────────────────────────┤
│ - label, text, co, rbtl, marks        │
│ - questionType: descriptive|programming│
│ - imageFileId: String (GridFS)        │
│ -- programming-only fields: --        │
│ - language: python|java|c|cpp         │
│ - starterCode: String                 │
│ - testCases: [{stdin, expectedStdout, │
│     hidden, weight}]                  │
│ - timeLimitSec, memoryLimitMb         │
│ - rubric: {correctness, style,        │
│     complexity}  // sums to 100        │
│ - complexityThreshold: Number         │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│   SubScore.programming (in Score)     │
├──────────────────────────────────────┤
│ - language, compiled: Boolean         │
│ - testResults: [{index, passed,       │
│     hidden, statusId, time}]          │
│ - passedWeight, totalWeight           │
│ - correctnessFrac, styleFrac,         │
│     complexityFrac                    │
│ - complexity, styleViolations         │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│   Licence (verified token, not a DB   │
│   collection — signed by vendor)      │
├──────────────────────────────────────┤
│ - institution: String                 │
│ - plan: essentials|institution|       │
│     university|enterprise             │
│ - issuedAt, expiresAt: Date           │
│ - (signature verified with RSA pubkey)│
├──────────────────────────────────────┤
│ + evaluateLicence(): status           │
│ + hasFeature(flag): Boolean           │
│ + isActive(): Boolean                 │
└──────────────────────────────────────┘
```

### 5.3 Sequence Diagram: Score Review & Approval

```
Faculty             FacultyUI           API            Database      AuditLog
  │                    │                 │               │              │
  │   Click Review     │                 │               │              │
  │────────────────────►                 │               │              │
  │                    │  GET /review/   │               │              │
  │                    │   examId/       │               │              │
  │                    │   students      │               │              │
  │                    │───────────────►│               │              │
  │                    │                │ find(examId) │              │
  │                    │                │──────────────►             │
  │                    │                │               return       │
  │                    │                │◄──────────────┤            │
  │                    │  [students      │               │            │
  │                    │   with scores]  │               │            │
  │                    │◄───────────────│               │            │
  │  See sidebar:      │                 │               │            │
  │  - Roll nos        │                 │               │            │
  │  - CO-wise marks   │                 │               │            │
  │  - Total (ceiled)  │                 │               │            │
  │  - Review status   │                 │               │            │
  │                    │                 │               │            │
  │  Click student     │                 │               │            │
  │────────────────────►                 │               │            │
  │                    │  GET /review/   │               │            │
  │                    │   student/      │               │            │
  │                    │   scoreId       │               │            │
  │                    │───────────────►│               │            │
  │                    │                │find score     │            │
  │                    │                │  by id        │            │
  │                    │                │──────────────►            │
  │                    │                │               return      │
  │                    │                │◄──────────────┤           │
  │                    │  [score detail  │               │           │
  │                    │   answers, AI   │               │           │
  │                    │   scores,       │               │           │
  │                    │   feedback]     │               │           │
  │                    │◄───────────────│               │           │
  │  Review answer 1:  │                 │               │           │
  │  - Student answer  │                 │               │           │
  │  - AI score: 7.8   │                 │               │           │
  │  - Approve button  │                 │               │           │
  │                    │                 │               │           │
  │  Click "Approve"   │                 │               │           │
  │────────────────────►                 │               │           │
  │                    │  POST /review/  │               │           │
  │                    │   scoreId/      │               │           │
  │                    │   subscore      │               │           │
  │                    │   {action:      │               │           │
  │                    │    'approve'}   │               │           │
  │                    │───────────────►│               │           │
  │                    │                │ update score  │           │
  │                    │                │ reviewStatus: │           │
  │                    │                │ 'approved'    │           │
  │                    │                │ reviewedByName│           │
  │                    │                │──────────────►           │
  │                    │                │               save ok    │
  │                    │                │◄──────────────           │
  │                    │                │ recordAudit() │           │
  │                    │                │──────────────┼──────────►
  │                    │                │               │  insert  │
  │                    │                │               │  audit   │
  │                    │                │               │  entry   │
  │                    │                │               │          │
  │                    │                │               │ ◄────────
  │                    │  200 OK        │               │           
  │                    │◄───────────────│               │           
  │  Card updated      │                 │               │           
  │  ✓ Reviewed by     │                 │               │           
  │    Faculty Name    │                 │               │           
  │    14:32:05 UTC    │                 │               │           
  │                    │                 │               │           
  │  Continue to next  │                 │               │           
  │  unapproved answer │                 │               │           
  │  ...               │                 │               │           
  │                    │                 │               │           
  │  [All answered]    │                 │               │           
  │                    │                 │               │           
  │  Click "Publish    │                 │               │           
  │   Results"         │                 │               │           
  │────────────────────►                 │               │           
  │                    │  POST /review/  │               │           
  │                    │   examId/       │               │           
  │                    │   publish       │               │           
  │                    │───────────────►│               │           
  │                    │                │ check all     │           
  │                    │                │ scores        │           
  │                    │                │ ready         │           
  │                    │                │──────────────►           
  │                    │                │               return ok  │
  │                    │                │◄──────────────           
  │                    │                │ update all    │           
  │                    │                │ scores:       │           
  │                    │                │ published=true│           
  │                    │                │ publishedByName           
  │                    │                │──────────────►           
  │                    │                │               save ok    │
  │                    │                │◄──────────────           
  │                    │                │ computeAttain │           
  │                    │                │ ment()        │           
  │                    │                │ trigger email │           
  │                    │                │ queue         │           
  │                    │  200 OK        │               │           
  │                    │◄───────────────│               │           
  │  "Results         │                 │               │           
  │   Published"      │                 │               │           
  │                   │                 │               │           
  │ ✓ Published by    │                 │               │           
  │   Faculty Name on │                 │               │           
  │   2026-05-31 15:45│                 │               │           
  │                   │                 │               │           
```

### 5.4 Sequence Diagram: Student Takes Exam

```
Student           StudentUI             API            Database        AI Service
   │                  │                  │                │               │
   │   Visit home     │                  │                │               │
   │─────────────────►│                  │                │               │
   │                  │ GET /exams/      │                │               │
   │                  │ (filters: status│
   │                  │  'scheduled')    │                │               │
   │                  │─────────────────►│                │               │
   │                  │                  │ find by        │               │
   │                  │                  │ studentDept    │               │
   │                  │                  │─────────────►│               │
   │                  │                  │                return exams   │
   │                  │  [Available      │◄──────────────┤               │
   │                  │   exams]         │                │               │
   │                  │◄─────────────────│                │               │
   │  Click exam      │                  │                │               │
   │─────────────────►│                  │                │               │
   │                  │ GET /            │                │               │
   │                  │ submissions/     │                │               │
   │                  │ examId/paper     │                │               │
   │                  │ (time-gated)     │                │               │
   │                  │─────────────────►│                │               │
   │                  │                  │ check if       │               │
   │                  │                  │ server time    │               │
   │                  │                  │ in [start,     │               │
   │                  │                  │ end+grace]     │               │
   │                  │                  │─────────────►│               │
   │                  │                  │                return true     │
   │                  │  [Question       │◄──────────────┤               │
   │                  │   paper]         │                │               │
   │                  │◄─────────────────│                │               │
   │  Timer starts    │                  │                │               │
   │  Duration: 60min │                  │                │               │
   │  Grace: 5min     │                  │                │               │
   │                  │                  │                │               │
   │  Read Q1, Q2     │                  │                │               │
   │  Q1: OR question │                  │                │               │
   │  (both sides)    │                  │                │               │
   │  Type answer     │                  │                │               │
   │  30 mins later   │                  │                │               │
   │─────────────────►(autosave every 30s)               │               │
   │                  │ PUT /            │                │               │
   │                  │ submissions/     │                │               │
   │                  │ examId/save      │                │               │
   │                  │─────────────────►│                │               │
   │                  │                  │ upsert answer  │               │
   │                  │                  │─────────────►│               │
   │                  │                  │                {_id, answer}   │
   │                  │  200 OK          │◄──────────────┤               │
   │                  │◄─────────────────│                │               │
   │                  │                  │                │               │
   │  60 mins: Time   │                  │                │               │
   │  to submit!      │                  │                │               │
   │  Finish Q2       │                  │                │               │
   │─────────────────►(final autosave)   │                │               │
   │                  │                  │                │               │
   │  Click Submit    │                  │                │               │
   │─────────────────►│                  │                │               │
   │                  │ POST /           │                │               │
   │                  │ submissions/     │                │               │
   │                  │ examId/submit    │                │               │
   │                  │─────────────────►│                │               │
   │                  │                  │ check server   │               │
   │                  │                  │ time <= end +  │               │
   │                  │                  │ grace          │               │
   │                  │                  │─────────────►│               │
   │                  │                  │                return true     │
   │                  │                  │ save status:   │◄──────────────
   │                  │                  │ 'submitted'    │               │
   │                  │                  │─────────────►│               │
   │                  │                  │                save ok        │
   │                  │                  │◄──────────────┤               │
   │                  │                  │ enqueueScoring│               │
   │                  │                  │ job(subId)    │               │
   │                  │                  │─────────────►(background)    │
   │                  │  200 OK          │                                │
   │                  │◄─────────────────│                │               │
   │  "Submitted"     │                  │                │               │
   │  Redirected to   │                  │                │               │
   │  results page    │                  │                │               │
   │  (polling or     │                  │                │               │
   │   message: "     │                  │                │               │
   │   Scoring in     │                  │                │               │
   │   progress...")  │                  │                │               │
   │                  │                  │                │               │
   │                  │                  │ ╔════════════════════════════╗ │
   │                  │                  │ ║ Background Job: Score      ║ │
   │                  │                  │ ║ 1. Get submission answers  ║ │
   │                  │                  │ ║ 2. For each sub-question:  ║ │
   │                  │                  │ ║    Call AI service         ║ │
   │                  │                  │ ╚════════════════════════════╝ │
   │                  │                  │                │               │
   │                  │                  │                │  POST /score  │
   │                  │                  │                │ (answer, model,├─►
   │                  │                  │                │  keywords,   │
   │                  │                  │                │  rbtl)       │
   │                  │                  │                │               │
   │                  │                  │                │ return:      │
   │                  │                  │                │ {score,      │◄──
   │                  │                  │                │  confidence, │
   │                  │                  │                │  feedback}   │
   │                  │                  │                │               │
   │  [After scoring │                  │                │               │
   │   completes]     │                  │                │               │
   │                  │ GET /results/    │                │               │
   │                  │ examId/me        │                │               │
   │                  │─────────────────►│                │               │
   │                  │                  │ find score     │               │
   │                  │                  │ by examId +    │               │
   │                  │                  │ studentId      │               │
   │                  │                  │─────────────►│               │
   │                  │  [Score detail]  │◄──────────────┤               │
   │                  │◄─────────────────│                │               │
   │  See results:    │                  │                │               │
   │  - CO-wise marks │                  │                │               │
   │  - Total (ceiled)│                  │                │               │
   │  - Per-question │                  │                │               │
   │    AI feedback   │                  │                │               │
   │  - Appeal button │                  │                │               │
   │                  │                  │                │               │
```

### 5.4a Sequence Diagram: Programming Question Scoring (Judge0)

```
 Student      API/Worker        ScoringService     Judge0        CodeQuality
   │              │                   │              │               │
   │ submit code  │                   │              │               │
   ├─────────────►│                   │              │               │
   │              │ enqueue scoring   │              │               │
   │              ├──────────────────►│              │               │
   │              │                   │ for each test case            │
   │              │                   ├─────────────►│               │
   │              │                   │  compile+run │               │
   │              │                   │  (sandboxed) │               │
   │              │                   │◄─────────────┤               │
   │              │                   │  pass/fail   │               │
   │              │                   │   (repeat per case)           │
   │              │                   │                               │
   │              │                   │ static analysis               │
   │              │                   ├──────────────────────────────►│
   │              │                   │   complexity + style          │
   │              │                   │◄──────────────────────────────┤
   │              │                   │                               │
   │              │                   │ compose score:                │
   │              │                   │  correctness×W1 +             │
   │              │                   │  style×W2 + complexity×W3      │
   │              │                   │  → integer, capped at max      │
   │              │                   │ write Score (flagged for       │
   │              │                   │  faculty review)               │
   │              │                   │                               │
   │  (meanwhile, faculty review screen polls and shows live          │
   │   "evaluating N of M" progress until the Score appears)          │
   │              │                   │                               │
```

Note: each test case is a separate sandboxed compile-and-run cycle, so
programming scoring takes longer than descriptive scoring; if Judge0 is
unavailable the answer is still recorded and flagged for manual review, so
the submission never disappears from the faculty queue.

### 5.5 State Machine: Exam Status

```
┌─────────┐
│  DRAFT  │ (initial state)
└────┬────┘
     │
     │ faculty: Publish exam (sets start time, duration)
     │
    ▼
┌───────────┐
│ SCHEDULED │ (awaiting start time)
└────┬──────┘
     │
     │ server: check if now >= startTime
     │
    ▼
┌─────────┐
│  ACTIVE │ (students can take exam)
└────┬────┘
     │
     │ server: check if now > endTime + gracePeriod
     │
    ▼
┌────────┐
│ CLOSED │ (no new submissions)
└────┬───┘
     │
     │ faculty: all scores reviewed & approved
     │ faculty: publish results
     │
    ▼
┌──────────────┐
│ ARCHIVED     │ (results published to students)
└──────────────┘
     │
     (can re-open for corrections)
     │
    ▼ (rare)
    CLOSED (restart review)
```

### 5.6 State Machine: Score Review Status

```
┌────────────────────────────────┐
│  INITIAL STATE FOR SUBSCORE    │
│  reviewStatus = 'pending' |    │
│              'auto' |          │
│              'approved' |      │
│              'adjusted' |      │
│              'flagged'         │
└────────────────────────────────┘

Determination (at scoring time):
  if RBTL in [L5, L6]:
     reviewStatus = 'pending'    (mandatory human review)
  elif aiScore confidence < 0.75:
     reviewStatus = 'pending'    (low confidence, needs review)
  else:
     reviewStatus = 'auto'       (auto-approved, can still be modified)

Faculty Actions:
  'auto' or 'pending'  ──[accept]──►  'approved'
  'auto' or 'pending'  ──[adjust]──►  'adjusted' (+ finalScore, reason logged)
  'auto' or 'pending'  ──[flag]────►  'flagged' (escalate, hold final score)

Constraint for publish:
  No score can be published with any subscore still in 'pending' or 'flagged'
  (only 'approved' and 'adjusted' are acceptable terminal states)
```

### 5.7 State Machine: Licence Status

```
            (no key / enforcement on)
                     │
                     ▼
              ┌─────────────┐   install valid key   ┌──────────┐
              │ unlicensed  │──────────────────────►│  active  │
              └─────────────┘                       └────┬─────┘
                     ▲                                   │
   invalid signature │                          time passes expiry
                     │                                   │
              ┌──────┴──────┐                            ▼
              │   invalid   │◄──── tampered token   ┌──────────┐
              └─────────────┘                       │ expired  │
                                                    └────┬─────┘
                                       install renewed key │
                                                    ◄──────┘  → active

Enforcement effects (when active=false):
  - Creating a new exam            → blocked (existing data stays readable)
  - Saving a paper with programming → blocked if plan lacks the feature
  - Software updates                → withheld until renewed
Graceful degradation: data is never deleted or made unreadable on expiry.
```

---

## 6. COMPONENT DETAILS

### 6.1 Frontend Architecture

#### **App.jsx (Router)**
```
Login
├─ /admin
│  └─ AdminHome (create users, courses, set CO-PO matrix)
├─ /faculty
│  ├─ FacultyHome (list exams, create exams)
│  ├─ ExamBuilder/:examId (build question paper, set scheme)
│  ├─ ReviewQueue/:examId (per-student review console)
│  └─ Attainment/:examId (CO/PO charts)
└─ /student
   ├─ StudentHome (list available exams, see past results)
   ├─ TakeExam/:examId (time-gated exam with autosave)
   └─ Result/:examId (view score, appeal questions)
```

#### **Core Components**
- **Layout** — sidebar navigation, role-based menu
- **PageHead** — title, subtitle, action buttons
- **Card** — content container with border
- **Banner** — alert/info/error bar (kind: info/err/warn/ok)
- **Tags** — badge display (CO, RBTL, marks)
- **Loading** — spinner with label

#### **Pages: Faculty Review Console (ReviewQueue.jsx)**
```
┌─────────────────────────────────────────────────────────┐
│ Exam: CS401 CIE 1 · Computer Networks                   │
│ [← Exams] [Download Report CSV] [Audit Trail CSV]       │
│ [Publish Results]                                        │
└─────────────────────────────────────────────────────────┘
┌──────────────────┬──────────────────────────────────────┐
│  Students        │  Question Answer Review              │
│  (sidebar)       │                                      │
├──────────────────┼──────────────────────────────────────┤
│ 21CS047 Ravi     │  Q1a (CO1, L3, 5 marks)              │
│ CO1: 4/5         │  ✓ OR — counted                      │
│ CO2: 5.4/6       │                                      │
│ CO3: 7.8/10      │  Student answer:                     │
│ Total: 18        │  "Packet switching enables..."       │
│ ✓ Reviewed       │                                      │
│ Pending: 2       │  AI Score: 7.8 / 5                  │
│                  │  Confidence: 84%                     │
│ [21CS048 Rani]   │  ✓ Approve | Modify | Flag          │
│ [21CS049 Sai]    │                                      │
│                  │  Q1b (CO2, L4, 6 marks)              │
│ ...              │  ✗ OR — not counted (lower score)   │
│                  │                                      │
│                  │  Q2a (CO1, L5, 5 marks)              │
│                  │  ⚠ Mandatory Review (L5)             │
│                  │                                      │
│                  │  Reviewed by Ravi Kumar on           │
│                  │  2026-05-31 14:32:05 UTC             │
│                  │                                      │
│                  │ ✓ Results published by Dr. Faculty   │
│                  │   on 2026-05-31 15:45 UTC            │
│                  │                                      │
│                  │ [Save & Continue Later]              │
│                  │ [Mark Reviewed & Next →]             │
└──────────────────┴──────────────────────────────────────┘
```

### 6.2 Backend Route Map

```
POST   /auth/register         (create user account)
POST   /auth/login            (authenticate, return JWT)
GET    /auth/me               (verify token, return user)

POST   /courses               (admin: create course)
GET    /courses               (list own courses)
GET    /courses/:id           (get by id)
PUT    /courses/:id           (faculty: update COs, ceilings, matrix, schemes)

POST   /exams                 (faculty: schedule exam)
GET    /exams                 (list exams — faculty see only their own)
GET    /exams/:id             (get exam detail — ownership-checked for faculty)
PUT    /exams/:id             (faculty: edit schedule, grace period)
DELETE /exams/:id             (faculty: delete own exam, cascades related data)
POST   /exams/:id/publish     (faculty: publish schedule to students)
PUT    /exams/:examId/paper   (faculty: upsert module-structured paper)
GET    /exams/:examId/paper   (faculty: read paper)
PUT    /exams/:examId/scheme  (faculty: upsert marking scheme)
GET    /exams/:examId/scheme-layout      (module/marks layout for the builder)
POST   /exams/:examId/generate-questions (faculty: draft Qs from uploaded notes)
POST   /exams/:examId/draft-answer       (faculty: draft model answer from notes)
POST   /exams/:examId/question-image     (faculty: upload a question figure)
GET    /question-image/:fileId           (faculty: stream a question image)

POST   /submissions/:examId/save    (student: autosave answers)
POST   /submissions/:examId/submit  (student: final submit → enqueue scoring)
POST   /submissions/:examId/ocr     (student: upload answer scan → OCR text + image id)
GET    /submissions/:examId/paper   (student: download paper if in window; resumes saved answers)
GET    /submissions/:examId/question-image/:fileId (student: time-gated image)
GET    /submissions/:examId/my-status            (student: lock/re-access status)
POST   /submissions/:examId/request-reaccess     (student: request to reopen)

GET    /review/:examId/queue        (faculty: all questions needing review)
GET    /review/:examId/students     (faculty: students with score summary, CO marks)
GET    /review/student/:scoreId     (faculty: full detail for one student)
GET    /review/scan/:fileId         (faculty: stream a stored answer scan)
POST   /review/student/:scoreId/state    (faculty: save review progress)
POST   /review/:scoreId/subscore    (faculty: approve/adjust/flag one answer)
POST   /review/:scoreId/or-select   (faculty: switch which OR side counts)
POST   /review/:examId/publish      (faculty: publish all results)
GET    /review/:examId/export       (faculty: download scores CSV)
GET    /audit/export                (faculty: download audit trail CSV)
GET    /reaccess/:examId            (faculty: list re-access requests)
POST   /reaccess/decide/:submissionId (faculty: approve/reject re-access)

GET    /attainment/:examId          (faculty: CO/PO charts for one exam)

GET    /results/:examId/me          (student: view own result)
POST   /results/appeal              (student: file appeal on one question)
GET    /appeals                     (faculty: list appeals, optional ?examId)
POST   /results/appeal/:id/resolve  (faculty: uphold/revise appeal)

GET    /hod/overview                (hod/admin: dept CO + PO/PSO attainment overview)
GET    /hod/exam/:examId            (hod/admin: per-exam CO attainment detail)

GET    /exams/:examId/download/paper   (faculty: question paper .docx; ?coRbtl=false for student version)
GET    /exams/:examId/download/scheme  (faculty: valuation scheme .docx)

GET    /admin/users                 (admin: filterable user list + pagination)
GET    /admin/users/facets          (admin: filter values + per-role counts)
GET    /admin/audit                 (admin: filterable audit-log list)
GET    /admin/audit/facets          (admin: audit filter dropdown values)

GET    /license/status              (any auth: current licence status)
GET    /license/plans               (admin: plan catalogue)
POST   /license/install             (admin: install/renew a licence key)
GET    /license/updates             (admin: check for updates — gated to active licence)

GET    /client-logs                 (frontend error logging endpoint)
```

Note: programming-question scoring uses the same submit/score endpoints; the
ScoringService branches by `questionType` and routes code answers to Judge0.
There is intentionally no in-exam "run code" endpoint — students submit, and
scoring happens in the background.

### 6.3 AI Service Architecture

```
POST /score
  Input:
    - answer_text: string (what student wrote)
    - model_answer: string (expected answer from scheme)
    - mandatory_keywords: [string] (must-have terms, weighted as co-occurrence)
    - bonus_keywords: [string] (nice-to-have, less weight)
    - expected_length: 'brief'|'moderate'|'detailed'
    - rbtl: 'L1'..'L6' (Bloom's level, informs style expectations)
    - co: string (CO this question tests)
    - weights: {cosine: 35, keywords: 35, style: 20, grammar: 10}
    - max_marks: Number

  Processing:
    1. Cosine Similarity (35% weight):
       - Embed student answer & model answer using all-MiniLM-L6-v2 (384-d)
       - Compute cosine distance
       - Normalize to [0, 1]

    2. Keyword Matching (35% weight):
       - Mandatory keywords: detect using spaCy NER + lemmatization
       - Bonus keywords: soft matching, partial credit
       - Score = (found_mandatory / total_mandatory) * 0.7 + (found_bonus / total_bonus) * 0.3
       - Capped at [0, 1]

    3. Style & Readability (20% weight):
       - Grammar check (LanguageTool):
         - Count errors
         - Penalize for L3+ (should be grammatical)
       - Sentence structure (NLTK):
         - Avg sentence length, variety
         - Penalize for L5/L6 (needs complex structure)
       - Score = (max_score - penalties) / max_score

    4. Grammar & Language Quality (10% weight):
       - LanguageTool error count
       - Spelling/grammar/punctuation errors per 100 words
       - Score = 1 - (errors / 100 * 0.1)

    5. Length Adequacy (penalty applied to final):
       - Expected words by length: brief=30, moderate=50, detailed=100
       - word_count / expected_words, capped at 1.0
       - final_score *= length_factor
       - Penalizes one-word answers even if high-quality for that word

  Output:
    {
      "components": {
        "cosine": 0.85,
        "keywords": 0.90,
        "style": 0.75,
        "grammar": 0.88
      },
      "score": 7.8,  (scaled to max_marks)
      "confidence": 0.84,
      "foundKeywords": ["TCP", "IP", "routing"],
      "missingKeywords": ["OSI model"],
      "feedback": "Good explanation of TCP/IP, clear examples. Missing reference to OSI model."
    }

  Health Checks:
    - GET /health → {status: 'ok'} when both models loaded
    - Startup warmup loads embedding model & grammar engine
    - /score timeouts after 90s, graceful degradation to AI unavailable
```

---

## 7. API DOCUMENTATION (Summary)

All endpoints require JWT Bearer token in Authorization header (except /auth/login, /auth/register, /client-logs).

### Authentication
```
POST /auth/register
  Body: {name, email, password, role, department, cohort, rollNo, consentGiven}
  Returns: {token, user}

POST /auth/login
  Body: {email, password}
  Returns: {token, user}

GET /auth/me
  Headers: {Authorization: "Bearer <token>"}
  Returns: {user}
```

### Courses (CO-PO mapping)
```
POST /courses [admin, faculty]
  Body: {code, title, semester, department, cos: [{coId, description}], 
         coPoMatrix: [{coId, weights: {PO1: 3, ...}}]}
  Returns: {course}

GET /courses [all]
  Returns: [{course}, ...]

GET /courses/:id [all]
  Returns: {course}

PUT /courses/:id [admin, faculty]
  Body: {title, semester, cos, coPoMatrix} (subset allowed)
  Returns: {course}
```

### Exams (Schedule & Question Paper)
```
POST /exams [faculty]
  Body: {courseId, examType, startTime, duration, maxMarks, gracePeriod, venue}
  Returns: {exam}

GET /exams [all]
  Query: ?courseId=... &status=draft|scheduled|active|closed|archived
  Returns: [{exam}, ...]

PUT /exams/:id [faculty]
  Body: {title, examType, startTime, duration, gracePeriod, maxMarks, venue} (draft/scheduled only)
  Returns: {exam}

POST /exams/:id/publish [faculty]
  (prevents students from entering if not in time window)
  Returns: {exam}

PUT /exams/:examId/paper [faculty]
  Body: {questions: [{qNo, text, orGroup, subQuestions: [{subLabel, co, rbtl, maxMarks, modelAnswer, keywords}]}]}
  (validates OR equivalence: both sides same CO + same marks)
  Returns: {paper}

GET /exams/:examId/paper [student, faculty]
  (time-gated: error if not in [startTime, endTime + gracePeriod])
  Returns: {questions, startTime, endTime, gracePeriod}

PUT /exams/:examId/scheme [faculty]
  Body: {marking: [{qNo, subLabel, maxMarks, mandatoryKeywords, bonusKeywords, expectedLength}]}
  Returns: {scheme}
```

### Student Submission & Results
```
POST /submissions/:examId/save [student]
  Body: {answers: {qNo: "student answer text"}}
  (time-gated; saves to DB, no scoring yet)
  Returns: {submissionId}

POST /submissions/:examId/submit [student]
  (time-gated; triggers background scoring job)
  Returns: {submissionId}

POST /submissions/:examId/ocr [student]
  Content-Type: multipart/form-data, field "image" (jpg/png, max 8 MB)
  (time-gated; stores the image in GridFS and runs Tesseract OCR)
  Returns: {text, scanFileId, warning?}
  Notes: the student's UI pre-fills the answer box with `text` (editable) and
         attaches `scanFileId` + inputMode:'scanned' to that answer, which then
         travels through the normal save/submit. On OCR failure, `text` is empty,
         a `warning` is returned, and the image is still stored for manual reading.

GET /results/:examId/me [student]
  Returns: {totalScore, publishedByName, publishedAt, subScores: [{qNo, subLabel, finalScore, maxMarks, aiFeedback, reviewedByName}]}

POST /results/appeal [student]
  Body: {scoreId, qNo, subLabel, reason}
  Returns: {appealId}

POST /results/appeal/:id/resolve [faculty]
  Body: {decision: 'approved'|'rejected', notes}
  Returns: {appeal}
```

### Faculty Review Console
```
GET /review/:examId/queue [faculty]
  (flat list of all sub-questions needing review, grouped by urgency)
  Returns: {mandatory: [...], spotCheck: [...], auto: [...]}

GET /review/:examId/students [faculty]
  (summary list of all students with CO-wise marks and review state)
  Returns: [{studentId, name, rollNo, coWise: [{co, scored, max}], totalScore, totalScoreCeiled, reviewState, pendingCount}]

GET /review/student/:scoreId [faculty]
  (full detail: answers, AI scores, feedback)
  Returns: {scoreId, student: {name, rollNo}, totalScore, publishedByName, publishedAt, items: [{qNo, subLabel, answerText, inputMode, scanFileId, finalScore, reviewedByName, reviewedAt}]}
  Notes: for scanned answers, inputMode='scanned' and scanFileId points to the
         stored image; answerText holds the OCR text. Faculty UI shows both.

GET /review/scan/:fileId [faculty]
  (streams the stored answer scan image from GridFS; image/* bytes)
  Returns: raw image (fetched as a blob with the JWT header, then rendered)

POST /review/student/:scoreId/state [faculty]
  Body: {state: 'not_started'|'in_progress'|'completed'}
  Returns: {score}

POST /review/:scoreId/subscore [faculty]
  Body: {action: 'accept'|'adjust'|'flag', newScore: ..., reason: "..."}
  (records: reviewedByName, reviewedAt, audit log entry)
  Returns: {score}

POST /review/:examId/publish [faculty]
  (fails if any pending|flagged; sets published=true, publishedByName, publishedAt)
  Returns: {count}

GET /review/:examId/export [faculty]
  (CSV: Roll No, Name, CO1 scored/max, CO2 scored/max, ..., Total Marks ceiled)
  Returns: CSV file

GET /audit/export [faculty]
  Query: ?examId=... (optional; scopes to one exam)
  (CSV: Timestamp, Actor, Role, Action, Before, After, Reason)
  Returns: CSV file
```

### Attainment & Reporting
```
GET /attainment/:examId [faculty]
  Returns: {coAttainment: [{coId, studentsAttainedPct, attained: bool}],
            poAttainment: [{poId, value: 0..100}],
            ciActions: [...]}
```

---

## 8. TESTING AND VALIDATION

### 8.1 Unit Tests
Run with: `npm run test` in the server directory.

**Test Coverage:**
- ✓ User authentication (login, token verify, password hash)
- ✓ Course CO-PO matrix validation (OR equivalence checking)
- ✓ Question paper validation (sub-question CO tagging)
- ✓ Score computation (OR selection, per-CO totals, ceiling)
- ✓ Exam time-gating (can_enter, can_submit checks)
- ✓ OR selection logic (both sides scored, higher selected)
- ✓ Attainment aggregation (CO % based on scores, PO weighted by matrix)

All 6 tests passing.

### 8.2 Integration Tests (Manual)
1. **End-to-end exam flow**
   - Faculty create exam (module-structured paper, marks scheme, CO-PO matrix, model answers)
   - Student take exam (time-gated entry/exit, autosave, optional scan upload)
   - AI scoring (subscore per question with semantic similarity/keywords/grammar)
   - Faculty review (approve/adjust per student, integer marks)
   - Publish results (audit trail recorded)
   - Student view (see scores, CO-wise breakdown, appeal button)
   - Attainment report (CO % for all students); HoD dashboard (department levels)

2. **OR question handling**
   - Both sides scored independently
   - Higher-scoring side auto-selected by default
   - Faculty can override which side counts (with a reason); both sides remain approvable
   - Non-selected side excluded from CO totals
   - Both marked with tags (OR—counted, OR—not counted)

3. **CO-ceiling enforcement**
   - A question whose RBTL exceeds its CO's Bloom ceiling is rejected at save and constrained in the builder UI

4. **Re-access workflow**
   - Locked after submit; request → faculty approve → reopen resumes saved answers
   - Single-use: a second reopen requires a fresh request; reopen only works while the window is open

5. **Appeals**
   - Student appeal appears in the faculty appeals panel
   - Uphold keeps the score; revise updates score and recomputes attainment

6. **Question generation & bank**
   - Draft questions generated from notes are non-repeating across a course's papers until options are exhausted

7. **Error logging**
   - API call failures logged with request ID
   - Client JS errors logged to backend
   - Audit trail shows approver name and timestamp
   - All actions timestamped and reversible (via adjustment)

### 8.3 Load & Performance
- **Latency targets:** API responses < 500ms (99th percentile)
- **Concurrency:** Redis queue handles 100+ parallel scoring jobs
- **Uptime:** PM2 with auto-restart on crash

### 8.4 Security Validation
- ✓ JWT tokens: HS256, 24h expiry
- ✓ Password hashing: bcryptjs, 10 rounds
- ✓ Input validation: Joi schemas on all POST/PUT
- ✓ Authorization: role-based guards on all routes
- ✓ Rate limiting: 30 client-log requests/min/IP
- ✓ HTTPS enforced in production (nginx)

---

## 9. DEPLOYMENT GUIDE (Free Platforms)

### 9.1 Free Hosting Options

#### **Option A (Recommended): GitHub Codespaces**

Because the entire system is already defined as a six-service `docker-compose.yml`, the simplest free path is **GitHub Codespaces**, which runs the compose file unmodified in a cloud dev container — no credit card, no per-service reconfiguration, and free monthly core-hours for personal accounts.

**Steps:**
1. Push the repository to GitHub.
2. Open the repo → **Code → Codespaces → Create codespace**.
3. In the Codespace terminal:
   ```
   docker compose up --build        # builds and starts all six services
   docker compose exec server npm run seed   # demo users + sample course
   ```
4. Codespaces auto-forwards the client port (8080); open the forwarded URL.
5. (Optional) run `docker compose exec server npm run migrate:scores` if importing older data.

This is ideal for demos, evaluation, and viva — the whole stack comes up exactly as it runs locally. For a longer-lived deployment, MongoDB can be pointed at a free **MongoDB Atlas** cluster (see §9.2) and the rest hosted on a small VM (§9.4); the alternatives below remain valid references.

#### **Option B: Heroku (Git-based deployment) — NO LONGER FREE**
Heroku discontinued their free tier in Nov 2022. Use alternatives below.

#### **Option C: Railway.app (simple managed services)**

**Pros:** Easy GitHub integration, free $5/month credit, sleek interface
**Cons:** Limited free tier after credit runs out; needs per-service root directories

**Steps:**
1. Create Railway account: railway.app
2. Create new project → GitHub import
3. Configure environment variables:
   ```
   NODE_ENV=production
   MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/exam_eval
   JWT_SECRET=<long-random-string>
   REDIS_HOST=redis-cache.railway.internal
   AI_SERVICE_URL=http://ai-service:5000
   ```
4. Add services:
   - **Node.js (server)** from GitHub repo
   - **MongoDB** — Railway plugin (free tier 512MB)
   - **Redis** — Railway plugin (free tier)
   - **Python (AI service)** — push Docker image
5. Deploy:
   ```
   git push
   # Railway auto-deploys
   ```

**Cost:** ~$5/month for 2CPU, 1GB RAM, after free trial

#### **Option C: Render (Easier Postgres, but harder for MongoDB)**

Not ideal for MongoDB; skip unless you want PostgreSQL.

#### **Option D: AWS (Free tier, 1 year)**

**Pros:** Generous free tier, scalable, industry standard
**Cons:** Complex setup, billing surprises if you exceed tier

**Free tier includes:**
- 750h/month t2.micro EC2 (1 vCPU, 1GB RAM)
- 20GB EBS storage
- MongoDB Atlas free tier (512MB)
- RDS (but not Postgres/MySQL, limited)

**Recommended:** Use MongoDB Atlas (free, cloud) + EC2 + S3

**Setup:**

1. **Create EC2 instance** (Ubuntu 22.04):
   ```bash
   # In AWS console: Launch t2.micro instance
   # Security group: inbound 22 (SSH), 80 (HTTP), 443 (HTTPS), 3000 (app)
   # Key pair: download .pem file
   ```

2. **SSH into instance:**
   ```bash
   ssh -i your-key.pem ubuntu@<public-ip>
   sudo apt update && sudo apt upgrade -y
   ```

3. **Install Docker & Docker Compose:**
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh && sudo sh get-docker.sh
   sudo usermod -aG docker ubuntu
   sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
   sudo chmod +x /usr/local/bin/docker-compose
   ```

4. **Clone your repo:**
   ```bash
   git clone <your-repo> ~/exam-eval-system
   cd ~/exam-eval-system
   ```

5. **Setup MongoDB Atlas** (cloud, free 512MB):
   - Create cluster at atlas.mongodb.com
   - Get connection string: `mongodb+srv://user:pass@cluster.mongodb.net/exam_eval?retryWrites=true&w=majority`
   - Whitelist EC2 IP in security rules

6. **Create .env:**
   ```bash
   cat > .env << 'EOF'
   MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/exam_eval
   JWT_SECRET=<generate-random-string>
   NODE_ENV=production
   AI_SERVICE_URL=http://ai-service:8000
   REDIS_HOST=redis
   EOF
   ```

7. **Modify docker-compose for AWS:**
   - Remove persistent volume mounts (EBS is ephemeral in free tier)
   - Keep Redis (in-memory; data lost on restart, fine for non-critical jobs)
   - Remove client service; serve React from nginx on port 80
   ```yaml
   # In docker-compose.yml, update client service:
   client:
     image: <your-docker-hub-user>/exam-eval-client:latest
     ports:
       - "80:80"  # expose to internet
   ```

8. **Build & push Docker images:**
   ```bash
   docker login
   docker build -t <user>/exam-eval-server:latest server/
   docker push <user>/exam-eval-server:latest
   # Repeat for client, ai-service
   ```

9. **Start services:**
   ```bash
   docker-compose up -d
   docker-compose exec server npm run seed
   ```

10. **Setup reverse proxy (Nginx on host):**
    ```bash
    sudo apt install nginx
    sudo tee /etc/nginx/sites-available/exam-eval > /dev/null << 'EOF'
    server {
        listen 80;
        server_name <your-domain-or-ip>;
        
        location / {
            proxy_pass http://localhost:8080;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
    EOF
    
    sudo ln -s /etc/nginx/sites-available/exam-eval /etc/nginx/sites-enabled/
    sudo nginx -t && sudo systemctl restart nginx
    ```

11. **HTTPS (Let's Encrypt):**
    ```bash
    sudo apt install certbot python3-certbot-nginx
    sudo certbot --nginx -d <your-domain>
    ```

12. **Monitor & maintain:**
    ```bash
    docker-compose logs -f server
    df -h  # check disk space (20GB should last months)
    ```

**Cost:** Free (with 1-year free tier), then ~$5/month for tiny compute + MongoDB Atlas free tier

#### **Option E: Docker Hub + GitHub Actions (Free CI/CD)**

**Free tier:**
- GitHub Actions: 2000 free minutes/month
- Docker Hub: 1 free private repo
- Automated builds on push

**Setup:**

1. **Create Dockerfile for each service** (already done in the project)
2. **Create GitHub Actions workflow:**
   ```yaml
   # .github/workflows/deploy.yml
   name: Build and Push Docker Images
   on:
     push:
       branches: [main]
   jobs:
     build:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v3
         - name: Set up Docker Buildx
           uses: docker/setup-buildx-action@v2
         - name: Login to Docker Hub
           uses: docker/login-action@v2
           with:
             username: ${{ secrets.DOCKER_USERNAME }}
             password: ${{ secrets.DOCKER_PASSWORD }}
         - name: Build and push Server
           uses: docker/build-push-action@v4
           with:
             context: ./server
             push: true
             tags: ${{ secrets.DOCKER_USERNAME }}/exam-eval-server:latest
   ```

3. **Deploy to EC2 from your laptop:**
   ```bash
   # After each git push, GitHub builds + pushes image
   # Then SSH into EC2 and pull latest image:
   docker-compose pull && docker-compose up -d
   ```

### 9.2 Database Setup

#### **MongoDB Atlas (Recommended, Free)**
```
1. Create account: atlas.mongodb.com
2. Create free cluster (512MB)
3. Create database user
4. Whitelist IPs (or 0.0.0.0/0 for dev)
5. Get connection string:
   mongodb+srv://user:pass@cluster.mongodb.net/exam_eval
```

#### **Self-Hosted MongoDB (Not recommended for free tier, needs 1GB+ RAM)**
```bash
# If running on EC2:
docker run -d --name mongo -p 27017:27017 mongo:6
# Uses ~500MB memory
```

### 9.3 Recommended Free Deployment Stack

```
┌─────────────────────────────────────────────────────┐
│ Domain: exam-eval.example.com (from Freenom.com)   │
│ (free .tk/.ml/.ga/.cf domains)                      │
└─────────────────────────────────────────────────────┘
         │
    ┌────▼──────┐
    │  HTTPS    │
    │(Let's     │
    │ Encrypt)  │
    └────┬──────┘
         │
┌────────▼────────────────────────────────┐
│ AWS EC2 t2.micro (1vCPU, 1GB RAM)      │
│ Ubuntu 22.04 · Free tier 1 year        │
├────────────────────────────────────────┤
│ - Nginx (reverse proxy)                │
│ - Docker + Docker Compose              │
│ - Node.js (server, port 5000)          │
│ - React (client, served by nginx:80)   │
│ - Python FastAPI (AI, port 8000)       │
│ - Redis (in-memory queue, ephemeral)   │
└────────────────────────────────────────┘
         │
         │ (MongoDB connection string)
         │
┌────────▼──────────────────────────────────┐
│ MongoDB Atlas (Cloud, Free 512MB)        │
│ - Global replicas                        │
│ - Automatic backups                      │
│ - Connection pooling                     │
└──────────────────────────────────────────┘
```

**Total cost:** $0 (first year AWS) → ~$5/month (for MongoDB Atlas after 512MB exceeded)

### 9.4 Step-by-Step AWS Deployment

**Complete walkthrough:**

```bash
# 1. Create EC2 instance
# (AWS console → EC2 → Launch Instance)
# - AMI: Ubuntu 22.04 LTS
# - Type: t2.micro
# - Security group: allow 22, 80, 443
# - Key pair: exam-eval.pem
# - Storage: default 20GB

# 2. SSH in
ssh -i exam-eval.pem ubuntu@<IP>

# 3. Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
newgrp docker

# 4. Install Docker Compose
sudo curl -L \
  "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" \
  -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 5. Clone repo & setup
git clone https://github.com/<your-username>/exam-eval-system.git
cd exam-eval-system
cp server/.env.example server/.env
# EDIT server/.env with MongoDB Atlas URI, JWT secret

# 6. Build & run
docker-compose build
docker-compose up -d
docker-compose exec server npm run seed

# 7. Setup Nginx reverse proxy
sudo apt install nginx certbot python3-certbot-nginx
sudo tee /etc/nginx/sites-available/default > /dev/null << 'EOF'
server {
    listen 80;
    server_name _;
    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
    }
}
EOF
sudo systemctl restart nginx

# 8. Get SSL certificate
# (Point your domain to the EC2 IP first)
sudo certbot --nginx -d exam-eval.example.com

# 9. Monitor
docker-compose logs -f
docker stats
```

### 9.5 Scaling Beyond Free Tier

**When you exceed free tier:**

1. **Add load balancer** (AWS ELB ~$0.22/day)
2. **Add RDS for MongoDB** (AWS DocumentDB ~$1/day for smallest tier)
3. **Use Kubernetes** (EKS ~$0.10/hour, more complex but cheaper at scale)

**Alternative simpler scaling:**
- Move to Linode ($5/month for 1GB), DigitalOcean ($5/month)
- Much simpler than AWS free tier complexity

---

## 10. BUSINESS MODEL & DESIGN-THINKING CANVASES

This section presents the product through standard design-thinking and business
frameworks. They frame EvalAI not just as software but as a venture: who it
serves, the value it creates, how it is differentiated, and how it sustains
itself commercially.

### 10.1 Empathy Map Canvas

The Empathy Map captures the primary user — an **engineering-college faculty
member responsible for OBE assessment** — to ground design decisions in real
needs.

```
┌───────────────────────────────────┬───────────────────────────────────┐
│  THINKS & FEELS                   │  SEES                             │
│  - "Grading 60 scripts by hand    │  - Colleagues drowning in         │
│    will take my whole weekend."   │    spreadsheets at results time   │
│  - Anxious about NBA/NAAC audits  │  - Inconsistent marks across      │
│  - Worried AI might grade unfairly│    evaluators for similar answers │
│  - Proud of teaching, frustrated  │  - Manual CO/PO attainment sheets │
│    by clerical burden             │    error-prone and dreaded        │
│  - Wants to trust but verify      │  - Students contesting marks      │
├───────────────────────────────────┼───────────────────────────────────┤
│  SAYS & DOES                      │  HEARS                            │
│  - "I don't have time to compute  │  - HoD: "We need attainment data  │
│    CO attainment manually."       │    ready for the accreditation    │
│  - Re-enters marks into multiple  │    visit."                        │
│    registers and spreadsheets     │  - Peers: "Online tools send our  │
│  - Sets papers in Word, formats   │    student data to the cloud."    │
│    by hand each exam              │  - Management: "Reduce cost, keep │
│  - Double-checks every total      │    data on campus."               │
├───────────────────────────────────┴───────────────────────────────────┤
│  PAINS                            │  GAINS                            │
│  - Hours of repetitive grading    │  - Faster grading with a reliable │
│  - Subjective, inconsistent marks │    first-pass draft               │
│  - Manual attainment computation  │  - Automatic, audit-ready CO/PO   │
│  - Fear of audit non-compliance   │    attainment                     │
│  - Reformatting papers each time  │  - Consistent, defensible scores  │
│  - Disputes with no audit trail   │  - Full control + audit trail     │
└───────────────────────────────────────────────────────────────────────┘
```

### 10.2 Value Proposition Canvas

Mapping what the customer needs (right) to what EvalAI offers (left).

```
   VALUE MAP (EvalAI)                  CUSTOMER PROFILE (Faculty/Institution)
┌────────────────────────────┐      ┌────────────────────────────────────┐
│ Products & Services        │      │ Customer Jobs                      │
│ - AI-assisted descriptive  │      │ - Set & grade OBE exams            │
│   scoring                  │      │ - Compute CO/PO attainment         │
│ - Sandboxed code grading   │      │ - Produce accreditation evidence   │
│ - CO/PO attainment engine  │      │ - Run fair, time-gated exams       │
│ - Paper/scheme generation  │      │ - Defend marks in disputes         │
│ - HoD & admin dashboards   │      │                                    │
│ - Self-hosted deployment   │      │                                    │
├────────────────────────────┤      ├────────────────────────────────────┤
│ Pain Relievers             │      │ Pains                              │
│ - First-pass auto-scoring  │ ───► │ - Hours of manual grading          │
│   cuts grading time        │      │ - Inconsistent marks               │
│ - Faculty approve every    │      │ - Manual attainment spreadsheets   │
│   grade (trust)            │      │ - Audit non-compliance risk        │
│ - Automatic attainment     │      │ - Data-privacy concerns with cloud │
│ - Data stays on campus     │      │ - Disputes without evidence        │
│ - Full audit trail         │      │                                    │
├────────────────────────────┤      ├────────────────────────────────────┤
│ Gain Creators              │      │ Gains                              │
│ - One platform: essay +    │ ───► │ - Save days per exam cycle         │
│   code + attainment        │      │ - Confident, defensible grading    │
│ - Accreditation-ready      │      │ - Ready accreditation reports      │
│   reports on demand        │      │ - Predictable flat cost            │
│ - Flat per-institution fee │      │ - Control & ownership of data      │
└────────────────────────────┘      └────────────────────────────────────┘

Fit: EvalAI's relievers/creators map directly onto the faculty's most painful,
most frequent jobs — grading and attainment — while preserving human control
and on-campus data, which directly answers the institution's top concerns.
```

### 10.3 SCAMPER Innovation Chart

SCAMPER systematically examines how EvalAI innovates on the status quo
(manual + spreadsheet-based OBE assessment).

```
S — Substitute   Replace manual grading of descriptive answers with AI-assisted
                 first-pass scoring; replace hand-checked code with sandboxed
                 test-case execution; replace Word paper-setting with generated,
                 formatted documents.

C — Combine      Combine exam delivery, AI scoring, code execution, attainment
                 analytics, and document generation into one platform — instead
                 of separate tools and spreadsheets.

A — Adapt        Adapt competitive-programming judge technology (Judge0) to
                 academic exam grading; adapt NLP semantic-similarity techniques
                 to score descriptive answers against model answers.

M — Modify       Modify the role of AI from "decision-maker" to "assistant":
                 every grade is human-approved. Magnify auditability — every
                 change is logged with before/after and reason.

P — Put to       Put attainment data (a by-product of grading) to new use as
  other use      live NBA/NAAC accreditation evidence; put the audit log to use
                 for dispute resolution and moderation.

E — Eliminate    Eliminate manual CO/PO attainment computation, manual paper
                 reformatting, per-API cloud costs, and off-campus data exposure.

R — Reverse/     Reverse the usual SaaS data flow: instead of sending student
  Rearrange      data to a vendor cloud, the software runs on the institution's
                 own servers. Rearrange grading so review starts from a draft,
                 not a blank slate.
```

### 10.4 Lean Canvas

```
┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
│ PROBLEM          │ SOLUTION         │ UNIQUE VALUE      │ UNFAIR ADVANTAGE │
│ - Manual grading │ - AI-assisted    │ PROPOSITION       │ - OBE/VTU-native │
│   is slow &      │   scoring +      │ "Outcome-based    │   domain depth   │
│   subjective    │   human approval │ exam evaluation,  │ - Self-hosted,   │
│ - CO/PO attain- │ - Sandboxed code │ automated — with  │   data-sovereign │
│   ment is manual│   grading        │ faculty in        │   architecture   │
│ - Accreditation │ - Attainment     │ control and data  │ - Both essay +   │
│   evidence is   │   analytics      │ on your campus."  │   code grading   │
│   painful       │ - Doc generation │                   │   in one tool    │
│ - Cloud tools   │                  ├──────────────────┤                  │
│   risk data     │                  │ HIGH-LEVEL CONCEPT│                  │
│   privacy       │                  │ "Self-hosted OBE  │                  │
│                 │                  │ grading + accred- │                  │
│                 │                  │ itation engine"   │                  │
├──────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ KEY METRICS      │                  │                   │ CHANNELS         │
│ - Exams graded   │                  │                   │ - Direct sales   │
│ - Grading hours  │                  │                   │   to colleges    │
│   saved          │                  │                   │ - Academic       │
│ - Active licences│                  │                   │   conferences    │
│ - Renewal rate   │                  │                   │ - Referrals/     │
│ - Attainment     │                  │                   │   accreditation  │
│   reports run    │                  │                   │   networks       │
├──────────────────┴──────────────────┴──────────────────┴──────────────────┤
│ CUSTOMER SEGMENTS                                                          │
│ - Primary: engineering colleges & universities under OBE/NBA/NAAC regimes  │
│ - Early adopters: autonomous institutions, tech-forward CS/IS departments  │
│ - Users: faculty, HoDs, exam cells, administrators                         │
├────────────────────────────────────┬──────────────────────────────────────┤
│ COST STRUCTURE                     │ REVENUE STREAMS                      │
│ - Development & maintenance        │ - Per-institution annual licence     │
│ - Support & onboarding             │   (tiered: Essentials → Enterprise)  │
│ - Update-server hosting (small)    │ - Optional: on-site deployment,      │
│ - Sales & marketing                │   priority support/SLA, training,    │
│ - All infra self-hosted by clients │   custom development                 │
│   → low vendor infra cost          │                                      │
└────────────────────────────────────┴──────────────────────────────────────┘
```

### 10.5 Business Model Canvas

```
┌────────────────┬────────────────┬────────────────┬────────────────┬────────────────┐
│ KEY PARTNERS   │ KEY ACTIVITIES │ VALUE          │ CUSTOMER       │ CUSTOMER       │
│ - Open-source  │ - Product dev  │ PROPOSITIONS   │ RELATIONSHIPS  │ SEGMENTS       │
│   communities  │ - AI/NLP &     │ - Automate OBE │ - Dedicated    │ - Engineering  │
│   (Judge0,     │   judge        │   grading,     │   onboarding   │   colleges &   │
│   spaCy, etc.) │   integration  │   keep faculty │ - Support/SLA  │   universities │
│ - Accreditation│ - Support &    │   in control   │ - Annual       │   (OBE/NBA/    │
│   consultants  │   training     │ - Auto CO/PO   │   renewals &   │   NAAC)        │
│ - Resellers/   │ - Sales &      │   attainment   │   updates      │ - Autonomous   │
│   channel      │   onboarding   │   for accredi- │ - Training     │   institutions │
│   partners     │ - Maintaining  │   tation       │   workshops    │ - Depts: CS,   │
│ - Cloud/infra  │   update       │ - Self-hosted, ├────────────────┤   IS, ECE etc. │
│   vendors (for │   channel      │   data-on-     │ CHANNELS       │                │
│   clients who  ├────────────────┤   campus       │ - Direct sales │                │
│   want hosting)│ KEY RESOURCES  │ - Essay + code │ - Conferences  │                │
│                │ - The platform │   in one tool  │   & academic   │                │
│                │   (IP/codebase)│ - Predictable  │   networks     │                │
│                │ - AI models    │   flat pricing │ - Website/demo │                │
│                │ - Domain       │ - Full audit   │ - Referrals    │                │
│                │   expertise    │   trail        │                │                │
│                │ - Brand/docs   │                │                │                │
├────────────────┴────────────────┴────────────────┴────────────────┴────────────────┤
│ COST STRUCTURE                              │ REVENUE STREAMS                        │
│ - R&D / engineering (largest)               │ - Per-institution ANNUAL LICENCE       │
│ - Support, onboarding, training             │   (Essentials / Institution /          │
│ - Sales & marketing                         │   University / Enterprise tiers)       │
│ - Update-server + minimal vendor infra      │ - Add-ons: on-site deployment, priority│
│   (clients self-host the app → low infra)   │   support/SLA, training, custom dev     │
│ - Documentation & legal                     │ - Renewals (recurring) tied to updates  │
│                                             │   + support                            │
└─────────────────────────────────────────────┴────────────────────────────────────────┘

Note: Pricing figures are commercial decisions to be set per market; the
licence-key system enforces the tier and term technically, while the licence
agreement enforces them contractually, and update-gating ties ongoing value to
active renewals.
```

---

## 11. CONCLUSION

This OBE exam evaluation system provides:

### **Key Innovations**
1. **Automated yet auditable scoring** — AI provides baseline, faculty retains control
2. **OBE-native design** — CO-PO mapping built in, not bolted on
3. **Transparent workflows** — every action logged with timestamp and approver
4. **Program-level outcomes** — aggregate CO/PO attainment for accreditation
5. **Zero vendor lock-in** — open-source tech stack, deployable anywhere

### **Impact**
- **Faculty:** 80% reduction in clerical grading time
- **Students:** instant feedback with appeal mechanism
- **Institution:** compliance evidence for accreditation bodies (NBA, NAAC)

### **Limitations & Future Work**
1. **Current:** Students can upload a photo/scan of a handwritten answer, which is stored and OCR'd (Tesseract); the extracted text pre-fills the answer box for the student to review, and faculty see the original image alongside the editable text during review. However, OCR accuracy on genuine handwriting is limited, since Tesseract is optimised for printed text — the stored image (not the OCR text) is therefore treated as the source of truth, and faculty reconcile the two manually.
   → Future: Replace Tesseract with a handwriting-specific model (e.g. TrOCR) for higher OCR accuracy; add diagram/figure detection.
2. **Current:** Single exam type (point-in-time)
   → Future: Portfolio assessment, continuous feedback
3. **Current:** Manual CO-PO mapping
   → Future: ML-assisted mapping recommendation
4. **Current:** Exam-level attainment
   → Future: Longitudinal tracking across semesters
5. **Current:** Scan images stored in GridFS on the application database
   → Future: Retention/cleanup policy and optional offload to object storage as volume grows

### **Project Artifacts**
- 63 backend files (models, controllers, routes, services, middleware, tests)
- 18 frontend files (pages, components, utilities)
- Dockerfiles for all services
- MongoDB schemas with indexes
- 6 integration tests (all passing)
- Comprehensive error logging & audit trails
- Free-platform deployment guide

**Total lines of code:** ~4500 backend JS + 2000 frontend JSX + 800 Python AI + 200 shell/config

---

**Report prepared by:** Course Outcome Based Education Assessment System Team
**Date:** 31 May 2026
**Version:** 1.0 Final

---


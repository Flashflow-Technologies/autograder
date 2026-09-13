# EvalAI — Transparency & Accountability Features (implementation status)

All ten features from the TAR-AI analysis are implemented, wired end-to-end, and
validated (syntax + logic tests + isolated logic tests where runnable). Honest
note on validation: the sandbox cannot run MongoDB or the Python embedder, so
the *integration* (real scoring → DB → UI) must be verified by you after
`docker compose up --build`. What was provable here is marked.

## Transparency

**#1 Per-answer score-contribution breakdown** — `transparencyService.js`
converts the scorer's component data into student-readable percentages (meaning
match, concepts covered, structure, grammar), shown as bars on the student Result
page. *Logic tested in isolation.*

**#2 Missing-concept feedback** — concept coverage ("3 of 5 covered") with found
and missing concepts listed, on the Result page. *Logic tested.*

**#3 Natural-language feedback** — rule-based strengths / to-improve / suggestions
generated from component scores (no LLM), on the Result page. *Logic tested.*

**#4 Highlighted answer spans** — the AI service now scores each answer sentence
against the model answer (`sentence_spans`), and the Result page highlights each
span green/amber/red by match strength. *Python compiles; needs the running
embedder to verify output.*

**#5 Confidence indicator** — the AI's confidence is shown as an honest band
(High / Moderate / Low) badge on each student answer, noting faculty reviewed all
scores. *Logic tested.*

## Accountability

**#6 Model & rubric version stamping** — every Score now records
`scoringProvenance` (AI model, AI-service version, app version, scheme version,
timestamp); exposed to faculty in the review detail. Reproducibility/accreditation
evidence.

**#7 Tamper-evident audit log** — `auditService.js` rewritten to hash-chain every
entry (SHA-256 over content + prevHash) with a `verifyAuditChain()` verifier and a
`/admin/audit/verify` endpoint + UI button. *Tamper detection tested in isolation
(an altered entry is caught at its exact position).*

**#8 Score-change provenance for students** — when faculty change an AI draft, the
student sees "AI suggested X, faculty set it to Y — reason"; backed by a new
`adjustReason` field.

**#9 Bias-monitoring dashboard** — `accountabilityAnalytics.js#biasMonitor` compares
score distributions across cohorts and flags notable disparities **for human
review** (explicitly framed as "worth a look," not proof of bias). On the new
Accountability dashboard.

**#10 AI-vs-human agreement reporting** — `agreementReport` shows how often faculty
accept vs. adjust AI drafts, broken down by Bloom level, surfacing where the AI is
weakest. On the Accountability dashboard.

## Where to find it
- **Students:** Result page now shows breakdown, concepts, confidence, NL feedback,
  highlighted spans, and score-change provenance.
- **Faculty:** review detail includes scoring provenance (#6).
- **Admin:** new **Accountability** dashboard (`/admin/accountability`) — audit
  integrity check (#7), AI-vs-faculty agreement (#10), and cohort bias monitor (#9).

## New/changed files
- `server/src/services/transparencyService.js` (new) — #1/#2/#3/#5
- `server/src/services/accountabilityAnalytics.js` (new) — #9/#10
- `server/src/services/auditService.js` (rewritten) — #7
- `server/src/services/scoringService.js` — #6 provenance + #4 spans storage
- `server/src/controllers/evaluationController.js` — student result enrichment, #8, #6 exposure
- `server/src/controllers/adminController.js` + `routes/adminRoutes.js` — #7/#9/#10 endpoints
- `server/src/models/index.js` — provenance, hash-chain, adjustReason, spans fields
- `ai-service/app/main.py` — `sentence_spans` for #4
- `client/src/pages/student/Result.jsx` — full transparency display
- `client/src/pages/admin/AccountabilityDashboard.jsx` (new) + routing/link

## Honest caveats
- **Bias monitor (#9)** uses a simple heuristic (group mean vs overall ± 0.5 SD).
  It flags disparities for humans; it does NOT prove bias and must not be presented
  as doing so. The UI text reflects this.
- **#4 spans** add one extra embedding pass per answer at scoring time — fine for
  exam volumes, but it does add latency; verify acceptable on your hardware.
- Integration (real DB + embedder) is unverified here — run the stack and confirm.

# Setup & Operation Manual
## EvalAI — OBE-Compliant Automated Exam Evaluation System (MERN)

This manual walks you from a clean machine to a running system, two ways:
**A) Docker (easiest)** and **B) Manual (full control)**. Everything uses
free, open-source tools — no paid services or API keys.

---

## 0. What you are installing

| Service | Port | Purpose |
|---------|------|---------|
| client (React) | 5173 (dev) / 8080 (Docker) | The web UI |
| server (Express) | 5000 | REST API + Swagger docs |
| worker (BullMQ) | — | Background scoring + email |
| ai-service (FastAPI) | 8000 | NLP scoring + OCR |
| mongo | 27017 | Database |
| redis | 6379 | Job queue |

---

## A) Run with Docker (recommended)

### Prerequisites
- Install **Docker Desktop** (Windows/Mac) or **Docker Engine + Compose** (Linux).
  Free from https://www.docker.com/products/docker-desktop

### Steps

1. **Unzip** the project and open a terminal in the `exam-eval-system` folder.

2. **Create the server env file:**
   ```bash
   cp server/.env.example server/.env
   ```
   Open `server/.env` and set a strong `JWT_SECRET` (any long random string).
   Email is optional — leave SMTP blank and emails are just logged.

3. **Build and start everything:**
   ```bash
   docker compose up --build
   ```
   First run downloads images and the ~80 MB NLP model — give it a few minutes.
   You'll see logs from all six services.

4. **Seed demo data** (in a second terminal, once `server` is up):
   ```bash
   docker compose exec server npm run seed
   ```
   This creates the demo course and three logins.

5. **Open the app:**
   - Web UI:       http://localhost:8080
   - API docs:     http://localhost:5000/api-docs
   - Health check: http://localhost:5000/health

6. **Stop:** `Ctrl+C`, then `docker compose down` (add `-v` to wipe the database).

---

## B) Run manually (no Docker)

### Prerequisites
- **Node.js 18+** — https://nodejs.org
- **Python 3.10+** — https://python.org
- **MongoDB Community** — https://www.mongodb.com/try/download/community
- **Redis** — https://redis.io/download (optional; see note in step 4)
- **Tesseract OCR** — https://github.com/tesseract-ocr/tesseract
  (Ubuntu: `sudo apt install tesseract-ocr default-jre`)
- **Java runtime** (for grammar checking) — usually `default-jre`

### Steps

1. **Start MongoDB and Redis** (each in its own terminal, or as services):
   ```bash
   mongod --dbpath /your/data/path
   redis-server
   ```

2. **AI service** (terminal 1):
   ```bash
   cd ai-service
   python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   uvicorn app.main:app --port 8000
   ```
   First scoring call downloads the embedding model once, then caches it.

3. **Backend API** (terminal 2):
   ```bash
   cd server
   npm install
   cp .env.example .env        # edit JWT_SECRET
   npm run seed                # create demo data (run once)
   npm run dev                 # starts on http://localhost:5000
   ```

4. **Background worker** (terminal 3):
   ```bash
   cd server
   npm run worker
   ```
   > **No Redis?** Set `REDIS_DISABLED=true` in `server/.env`. The API then
   > scores inline and you can skip this worker entirely.

5. **Frontend** (terminal 4):
   ```bash
   cd client
   npm install
   npm run dev                 # starts on http://localhost:5173
   ```

6. **Open** http://localhost:5173

---

## 1. First login

Use the seeded accounts:

| Role | Email | Password |
|------|-------|----------|
| Institute admin | admin@demo.edu | admin123 |
| Department admin (HOD) | hod@demo.edu | hod123 |
| Faculty | faculty@demo.edu | faculty123 |
| Student | student@demo.edu | student123 |

### Roles & governance hierarchy

- **Institute admin** — sets institute vision/mission; creates departments; creates any user.
- **Department admin (HOD)** — for their own department only: sets department
  vision/mission, PEOs, and the POs/PSOs; approves course outcomes (COs)
  submitted by faculty; bulk-uploads students/faculty; sees the department
  CO/PO attainment dashboard.
- **Faculty** — define course COs and the CO-PO matrix, then **submit COs for
  department-admin approval**. Exams can only be built on courses whose COs are
  approved.
- **Student** — takes time-gated exams, views results, files appeals.

### Bulk upload (CSV/Excel)

Admin and department admins can upload students and faculty in bulk under the
**Users / Bulk upload** tab. Columns are flexible (case/spacing-insensitive):
- Students: `name, email, rollNo, department, cohort`
- Faculty: `name, email, department`
A per-row report shows exactly which rows succeeded and which failed and why.
Department admins' uploads are auto-scoped to their own department.

---

## 2. End-to-end walkthrough (try the full flow)

**As Admin**
1. Sign in → **Users** tab → create more students if you like.
2. **Courses** tab → the demo course `CS401` already exists with 5 COs and a
   CO-PO-PSO matrix. Create your own with **+ New course** if desired.

**As Faculty**
1. Sign in → **+ New exam** → pick the course, set type (CIE 1), date, start
   time (set it to *now* for testing), duration, max marks → **Create exam**.
2. Click **Build** on the exam:
   - **Paper** tab → **+ Question** or **+ OR group**. Tag each sub-question
     with a CO, RBTL and marks. For OR groups, the live check confirms each
     CO·RBTL carries equal marks on both sides. **Save paper**.
   - **Scheme** tab → entries are pre-filled from the paper. Add a model
     answer + mandatory keywords per sub-question. Weights default by RBTL and
     must total 100. **Publish scheme**.
   - **Publish** tab → **Publish exam** (students get notified).

**As Student**
1. Sign in → the exam shows **open now** if you're inside the window →
   **Start exam**.
2. Answer questions (OR groups have tabs; you may attempt both). The timer
   counts down and auto-submits at zero. **Submit exam**.

**As Faculty**
1. Open the exam → **Review** → clear the **Mandatory** queue (L5/L6 and
   low-confidence items): Accept / Adjust / Flag. Then **Publish results**.
2. **Attainment** → view CO/PO/PSO charts; drag the threshold sliders.

**As Student**
1. **Result** on the exam → see score, per-question NLP breakdown, feedback,
   and matched/missing keywords. **Appeal** any question if needed.

---

## 3. Where the logs are

- Backend: `server/logs/app-*.log`, `error-*.log`, `exceptions-*.log`,
  `rejections-*.log` (daily-rotated by Winston).
- AI service: `ai-service/ai-service.log`.
- Docker: `docker compose logs -f server` (or `worker`, `ai-service`, `client`).

---

## 4. Common issues

| Symptom | Fix |
|---------|-----|
| "Exam has not started yet" | Start time is in the future — set it to now. |
| Scoring never completes | Ensure the worker is running, or set `REDIS_DISABLED=true`. |
| OCR returns empty text | Install Tesseract; typed answers always work. |
| Grammar score always 0.7 | Java/LanguageTool not installed — install `default-jre`. |
| Emails not sending | Expected if SMTP is blank; they're logged instead. |
| 401 on every call | Token expired — sign in again. |
| Model download slow | One-time ~80 MB download for sentence-transformers. |

---

## 5. Production notes (still free)

- Run on a single college server/laptop with `docker compose up -d` — no
  cloud cost, no storage caps, no cold-starts during exams.
- For the free cloud tiers (Render/Railway/Vercel), warm services before an
  exam window and prefer typed answers to stay within free storage limits.
- Always change `JWT_SECRET` and create real admin accounts before going live.

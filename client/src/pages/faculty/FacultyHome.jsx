import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client.js';
import { Layout, Card, PageHead, Banner, Loading } from '../../components/ui.jsx';

export default function FacultyHome() {
  const [exams, setExams] = useState(null);
  const [courses, setCourses] = useState([]);
  const [creating, setCreating] = useState(false);

  const load = () => api.get('/exams').then((r) => setExams(r.data.data)).catch(() => setExams([]));
  useEffect(() => { load(); api.get('/courses').then((r) => setCourses(r.data.data)).catch(()=>{}); }, []);

  if (!exams) return <Layout><Loading /></Layout>;
  return (
    <Layout>
      <PageHead title="Exams" sub="Schedule exams, build question papers, auto-grade, review and publish results."
        action={<button className="primary" onClick={() => setCreating((v)=>!v)}>{creating ? 'Close' : '+ New exam'}</button>} />
      {creating && <ExamForm courses={courses} onSaved={() => { setCreating(false); load(); }} />}
      <div className="col">
        {exams.map((ex) => <ExamRow key={ex._id} ex={ex} onChanged={load} />)}
        {exams.length === 0 && <p className="muted">No exams yet. Create one to begin.</p>}
      </div>
    </Layout>
  );
}

function ExamRow({ ex, onChanged }) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const statusTag = { draft: 'warn', scheduled: 'ok', active: 'ok', closed: 'bad' }[ex.status] || '';
  const canEdit = ['draft', 'scheduled'].includes(ex.status);
  return (
    <Card>
      <div className="spread wrap" style={{ gap: 10 }}>
        <div>
          <div className="row" style={{ gap: 8 }}>
            <strong>{ex.title}</strong>
            <span className="tag">{ex.examType}</span>
            <span className={`tag ${statusTag}`}>{ex.status}</span>
          </div>
          <div className="muted" style={{ fontSize: '0.83rem', marginTop: 3 }}>
            {ex.subjectCode} · {new Date(ex.startTime).toLocaleString()} · {ex.durationMins}m · grace {ex.gracePeriodMins ?? 10}m · {ex.maxMarks} marks
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {canEdit && <button className="sm" onClick={() => setEditing((v) => !v)}>{editing ? 'Close' : 'Edit'}</button>}
          <button className="sm" onClick={() => navigate(`/faculty/exam/${ex._id}`)}>Build</button>
          <button className="sm" onClick={() => navigate(`/faculty/exam/${ex._id}/review`)}>Review</button>
          <button className="ghost sm" onClick={async () => {
            const warn = `Delete "${ex.title}"? This permanently removes its question paper, scheme, and any student submissions/scores. This cannot be undone.`;
            if (!window.confirm(warn)) return;
            try { await api.delete(`/exams/${ex._id}`); onChanged(); }
            catch (e) { alert(e.details?.join('; ') || e.message || 'Delete failed'); }
          }}>Delete</button>
        </div>
      </div>
      {editing && <ExamEditForm ex={ex} onSaved={() => { setEditing(false); onChanged(); }} />}
    </Card>
  );
}

// Convert a Date/ISO string to the value a datetime-local input expects
function toLocalInput(d) {
  const dt = new Date(d);
  const off = dt.getTimezoneOffset();
  return new Date(dt.getTime() - off * 60000).toISOString().slice(0, 16);
}
function toDateInput(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function ExamEditForm({ ex, onSaved }) {
  const [f, setF] = useState({
    title: ex.title, subjectCode: ex.subjectCode, examType: ex.examType,
    examDate: toDateInput(ex.examDate), startTime: toLocalInput(ex.startTime),
    durationMins: ex.durationMins, gracePeriodMins: ex.gracePeriodMins ?? 10,
    maxMarks: ex.maxMarks, venue: ex.venue || '',
  });
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const set = (k, v) => setF({ ...f, [k]: v });

  const save = async () => {
    setErr(null); setMsg(null);
    try {
      const payload = {
        ...f,
        examDate: new Date(f.examDate),
        startTime: new Date(f.startTime),
        durationMins: Number(f.durationMins),
        gracePeriodMins: Number(f.gracePeriodMins),
        maxMarks: Number(f.maxMarks),
      };
      await api.put(`/exams/${ex._id}`, payload);
      setMsg('Saved.');
      setTimeout(onSaved, 500);
    } catch (e) { setErr(e.details?.join('; ') || e.message); }
  };

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line-soft)' }}>
      <Banner kind="err">{err}</Banner>
      <Banner kind="info">{msg}</Banner>
      <div className="grid-3">
        <div><label>Title</label><input value={f.title} onChange={(e)=>set('title',e.target.value)} /></div>
        <div><label>Exam type</label>
          <select value={f.examType} onChange={(e)=>set('examType',e.target.value)}>
            {['CIE 1','CIE 2','CIE 3','SEE','Model','Supplementary'].map((t)=><option key={t}>{t}</option>)}
          </select>
        </div>
        <div><label>Max marks</label><input type="number" value={f.maxMarks} onChange={(e)=>set('maxMarks',e.target.value)} /></div>
      </div>
      <div className="grid-3" style={{ marginTop: 10 }}>
        <div><label>Exam date</label><input type="date" value={f.examDate} onChange={(e)=>set('examDate',e.target.value)} /></div>
        <div><label>Start time</label><input type="datetime-local" value={f.startTime} onChange={(e)=>set('startTime',e.target.value)} /></div>
        <div><label>Duration (min)</label><input type="number" value={f.durationMins} onChange={(e)=>set('durationMins',e.target.value)} /></div>
      </div>
      <div className="grid-3" style={{ marginTop: 10 }}>
        <div>
          <label>Grace period (min)</label>
          <input type="number" min="0" value={f.gracePeriodMins} onChange={(e)=>set('gracePeriodMins',e.target.value)} />
        </div>
        <div><label>Venue</label><input value={f.venue} onChange={(e)=>set('venue',e.target.value)} /></div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button className="primary" onClick={save}>Save changes</button>
        </div>
      </div>
      <p className="muted" style={{ fontSize: '0.78rem', marginTop: 8 }}>
        Grace period is the window after the start time during which late students may still enter. It does not add extra time — the exam still ends at start + duration.
      </p>
    </div>
  );
}

function ExamForm({ courses, onSaved }) {
  const [f, setF] = useState({
    courseId: '', title: '', subjectCode: '', examType: 'CIE 1',
    examDate: '', startTime: '', durationMins: 90, gracePeriodMins: 10, maxMarks: 50, venue: '',
  });
  const [cohorts, setCohorts] = useState([]); // exam's targeted subset
  const [err, setErr] = useState(null);
  const set = (k, v) => setF({ ...f, [k]: v });

  const selectedCourse = courses.find((c) => c._id === f.courseId);
  const courseCohorts = selectedCourse?.cohorts || [];
  const toggleCohort = (c) => setCohorts((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);

  const save = async () => {
    setErr(null);
    if (!f.courseId) { setErr('Select a course first.'); return; }
    if (cohorts.length === 0) { setErr('Select at least one cohort (batch) this exam is for.'); return; }
    try {
      const payload = { ...f, cohorts, examDate: new Date(f.examDate), startTime: new Date(f.startTime),
        durationMins: Number(f.durationMins), gracePeriodMins: Number(f.gracePeriodMins), maxMarks: Number(f.maxMarks) };
      await api.post('/exams', payload);
      onSaved();
    } catch (e) { setErr(e.details?.join('; ') || e.message); }
  };

  return (
    <Card style={{ marginBottom: 16 }}>
      <Banner kind="err">{err}</Banner>
      <div className="grid-2">
        <div><label>Course</label>
          <select value={f.courseId} onChange={(e)=>{ const c=courses.find(x=>x._id===e.target.value); set('courseId',e.target.value); setCohorts([]); if(c){ setF(s=>({...s,courseId:e.target.value,subjectCode:c.code,title:`${c.title}`})); } }}>
            <option value="">— select —</option>
            {courses.map((c) => <option key={c._id} value={c._id}>{c.code} — {c.title}</option>)}
          </select>
        </div>
        <div><label>Exam title</label><input value={f.title} onChange={(e)=>set('title',e.target.value)} /></div>
      </div>

      {f.courseId && (
        <div style={{ marginTop: 10 }}>
          <label>Assign to cohorts (batches)</label>
          {courseCohorts.length === 0 ? (
            <div className="muted" style={{ fontSize: '0.78rem' }}>This course has no cohorts set. An admin must add cohorts to the course before an exam can be created for it.</div>
          ) : (
            <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
              {courseCohorts.map((c) => (
                <button key={c} type="button" className={`sm ${cohorts.includes(c) ? 'primary' : 'ghost'}`}
                  style={{ fontSize: '0.76rem' }} onClick={() => toggleCohort(c)}>
                  {c}{cohorts.includes(c) ? ' ✓' : ''}
                </button>
              ))}
              <span className="muted" style={{ fontSize: '0.72rem', alignSelf: 'center' }}>
                {cohorts.length === 0 ? '(required — select at least one)' : `${cohorts.length} selected`}
              </span>
            </div>
          )}
        </div>
      )}
      <div className="grid-3" style={{ marginTop: 10 }}>
        <div><label>Subject code</label><input value={f.subjectCode} onChange={(e)=>set('subjectCode',e.target.value)} /></div>
        <div><label>Exam type</label>
          <select value={f.examType} onChange={(e)=>set('examType',e.target.value)}>
            {['CIE 1','CIE 2','CIE 3','SEE','Model','Supplementary'].map((t)=><option key={t}>{t}</option>)}
          </select>
        </div>
        <div><label>Max marks</label><input type="number" value={f.maxMarks} onChange={(e)=>set('maxMarks',e.target.value)} /></div>
      </div>
      <div className="grid-3" style={{ marginTop: 10 }}>
        <div><label>Exam date</label><input type="date" value={f.examDate} onChange={(e)=>set('examDate',e.target.value)} /></div>
        <div><label>Start time</label><input type="datetime-local" value={f.startTime} onChange={(e)=>set('startTime',e.target.value)} /></div>
        <div><label>Duration (min)</label><input type="number" value={f.durationMins} onChange={(e)=>set('durationMins',e.target.value)} /></div>
      </div>
      <div className="grid-2" style={{ marginTop: 10 }}>
        <div><label>Grace period (min)</label><input type="number" value={f.gracePeriodMins} onChange={(e)=>set('gracePeriodMins',e.target.value)} /></div>
        <div><label>Venue</label><input value={f.venue} onChange={(e)=>set('venue',e.target.value)} /></div>
      </div>
      <button className="primary" style={{ marginTop: 14 }} disabled={!f.courseId || cohorts.length === 0} onClick={save}>Create exam (draft)</button>
    </Card>
  );
}

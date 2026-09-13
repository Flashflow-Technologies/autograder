import { useState, useEffect } from 'react';
import api from '../../api/client.js';
import { Layout, Card, PageHead, Banner, Loading } from '../../components/ui.jsx';
import { deriveCoCeiling, RBTL_LEVELS } from '../../utils/bloom.js';

const CO_KEYS = ['CO1','CO2','CO3','CO4','CO5'];

export default function AdminHome() {
  const [tab, setTab] = useState('users');
  return (
    <Layout nav={<>
      <a href="#" onClick={(e) => { e.preventDefault(); setTab('users'); }} style={{ fontWeight: tab==='users'?600:400 }}>Users</a>
      <a href="#" onClick={(e) => { e.preventDefault(); setTab('courses'); }} style={{ fontWeight: tab==='courses'?600:400 }}>Courses</a>
    </>}>
      {tab === 'users' ? <Users /> : <Courses />}
    </Layout>
  );
}

function Users() {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'student', rollNo: '', employeeId: '', department: '', cohort: '', consentGiven: true });
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault(); setMsg(null); setErr(null);
    try {
      const res = await api.post('/auth/register', form);
      setMsg(`Created ${res.data.data.role}: ${res.data.data.email}`);
      setForm({ ...form, name: '', email: '', password: '', rollNo: '', employeeId: '' });
    } catch (e) { setErr(e.details?.join('; ') || e.message); }
  };

  return (
    <>
      <PageHead title="User management" sub="Create admin, faculty and student accounts with role-based access."
        action={<div className="row" style={{ gap: 8 }}>
          <button onClick={() => window.location.assign('/admin/users')}>Users dashboard</button>
          <button onClick={() => window.location.assign('/admin/departments')}>Departments</button>
          <button onClick={() => window.location.assign('/admin/courses')}>Courses</button>
          <button onClick={() => window.location.assign('/admin/institute')}>Institute settings</button>
          <button onClick={() => window.location.assign('/admin/audit')}>Audit logs</button>
          <button onClick={() => window.location.assign('/admin/accountability')}>Accountability</button>
          <button onClick={() => window.location.assign('/admin/license')}>Licence</button>
        </div>} />
      <Card style={{ maxWidth: 560 }}>
        <Banner kind="info">{msg}</Banner>
        <Banner kind="err">{err}</Banner>
        <form onSubmit={submit} className="col">
          <div className="grid-2">
            <div><label>Name</label><input value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} required /></div>
            <div><label>Email</label><input type="email" value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})} required /></div>
          </div>
          <div className="grid-2">
            <div><label>Password</label><input type="text" value={form.password} onChange={(e)=>setForm({...form,password:e.target.value})} required minLength={6} /></div>
            <div><label>Role</label>
              <select value={form.role} onChange={(e)=>setForm({...form,role:e.target.value})}>
                <option value="student">Student</option><option value="faculty">Faculty</option><option value="hod">HoD</option><option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div className="grid-3">
            {form.role === 'student'
              ? <div><label>Roll No</label><input value={form.rollNo} onChange={(e)=>setForm({...form,rollNo:e.target.value})} /></div>
              : <div><label>Employee ID</label><input value={form.employeeId} onChange={(e)=>setForm({...form,employeeId:e.target.value})} /></div>}
            <div><label>Department</label><input value={form.department} onChange={(e)=>setForm({...form,department:e.target.value})} /></div>
            <div><label>Cohort</label><input value={form.cohort} onChange={(e)=>setForm({...form,cohort:e.target.value})} placeholder="2021-CSE-A" /></div>
          </div>
          <button className="primary" style={{ alignSelf: 'flex-start' }}>Create user</button>
        </form>
      </Card>
    </>
  );
}

function Courses() {
  const [courses, setCourses] = useState(null);
  const [creating, setCreating] = useState(false);
  const load = () => api.get('/courses').then((r) => setCourses(r.data.data)).catch(() => setCourses([]));
  useEffect(() => { load(); }, []);

  if (!courses) return <Loading />;
  return (
    <>
      <PageHead title="Courses" sub="Create courses, define COs, and map departments & faculty. CO-PO mapping is done by faculty."
        action={<button className="primary" onClick={() => setCreating((v) => !v)}>{creating ? 'Close' : '+ New course'}</button>} />
      {creating && <CourseForm onSaved={() => { setCreating(false); load(); }} />}
      <div className="col">
        {courses.map((c) => (
          <Card key={c._id}>
            <div className="spread">
              <div><strong>{c.code}</strong> — {c.title} <span className="muted">· {c.department} · Sem {c.semester}</span></div>
              <span className="tag">{c.cos.length} COs</span>
            </div>
            <div className="row wrap" style={{ marginTop: 8, gap: 6 }}>
              {c.cos.map((co) => <span key={co.coId} className="tag co">{co.coId}: {co.description}{co.maxRbtl ? ` (≤${co.maxRbtl})` : ''}</span>)}
            </div>
          </Card>
        ))}
        {courses.length === 0 && <p className="muted">No courses yet.</p>}
      </div>
    </>
  );
}

function CourseForm({ onSaved }) {
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [semester, setSemester] = useState(4);
  const [courseType, setCourseType] = useState('PCC');
  const [aecType, setAecType] = useState('theory');
  const [cos, setCos] = useState([{ coId: 'CO1', description: '' }]);
  // Exam scheme config (SEE module count/total + strict module->CO toggle).
  // CIE-1/CIE-2 use the built-in per-CO defaults unless edited server-side.
  const [seeModules, setSeeModules] = useState(5);
  const [seeTotal, setSeeTotal] = useState(100);
  const [enforceModuleCo, setEnforceModuleCo] = useState(false);
  const [err, setErr] = useState(null);

  const addCo = () => { if (cos.length < 5) setCos([...cos, { coId: CO_KEYS[cos.length], description: '' }]); };
  const setCoDesc = (i, v) => setCos(cos.map((c, idx) => idx === i ? { ...c, description: v } : c));
  const setCoCeiling = (i, v) => setCos(cos.map((c, idx) => idx === i ? { ...c, maxRbtl: v || undefined } : c));

  const save = async () => {
    setErr(null);
    try {
      // Each CO gets a Bloom's ceiling — auto-derived from its verbs, or set
      // manually. If it can't be inferred, prompt (don't silently leave it unset,
      // since the ceiling drives the question-level check).
      const cosWithCeiling = cos.map((c) => {
        const derived = deriveCoCeiling(c.description);
        return { ...c, maxRbtl: c.maxRbtl || derived.level || undefined };
      });
      const missing = cosWithCeiling.filter((c) => !c.maxRbtl).map((c) => c.coId);
      if (missing.length) {
        setErr(`Set a Bloom's level for ${missing.join(', ')} — no recognisable action verb was found, so it can't be inferred automatically.`);
        return;
      }
      // Admin creates the course with COs but an EMPTY CO-PO matrix; the mapped
      // faculty complete the CO-PO-PSO mapping from their own dashboard.
      const coPoMatrix = cosWithCeiling.map((c) => ({ coId: c.coId, weights: {} }));
      // Build exam schemes: configurable SEE + the user's default CIE templates.
      const examSchemes = [
        { examType: 'SEE', kind: 'equal_per_module', moduleCount: Number(seeModules), totalMarks: Number(seeTotal) },
        { examType: 'CIE 1', kind: 'per_co', slots: [{ co: 'CO1', marks: 10 }, { co: 'CO2', marks: 10 }, { co: 'CO3', marks: 5 }] },
        { examType: 'CIE 2', kind: 'per_co', slots: [{ co: 'CO3', marks: 5 }, { co: 'CO4', marks: 10 }, { co: 'CO5', marks: 10 }] },
      ];
      await api.post('/courses', {
        code, title, department, semester: Number(semester),
        courseType, aecType, hasPractical: courseType === 'PCCL' || courseType === 'IPCC' || (courseType === 'AEC' && aecType === 'practical'),
        cos: cosWithCeiling, coPoMatrix, examSchemes,
        enforceModuleCoMapping: enforceModuleCo,
      });
      onSaved();
    } catch (e) { setErr(e.details?.join('; ') || e.message); }
  };

  return (
    <Card style={{ marginBottom: 16 }}>
      <Banner kind="err">{err}</Banner>
      <div className="grid-3">
        <div><label>Code</label><input value={code} onChange={(e)=>setCode(e.target.value)} placeholder="CS401" /></div>
        <div><label>Title</label><input value={title} onChange={(e)=>setTitle(e.target.value)} /></div>
        <div><label>Department</label><input value={department} onChange={(e)=>setDepartment(e.target.value)} /></div>
        <div><label>Course type</label>
          <select value={courseType} onChange={(e)=>setCourseType(e.target.value)}>
            <option value="PCC">PCC (theory: CIE + assessment)</option>
            <option value="IPCC">IPCC (theory + practical)</option>
            <option value="PCCL">PCCL (standalone lab)</option>
            <option value="AEC">AEC (ability enhancement)</option>
          </select>
        </div>
        {courseType === 'AEC' && (
          <div><label>AEC assessed as</label>
            <select value={aecType} onChange={(e)=>setAecType(e.target.value)}>
              <option value="theory">Theory (CIE + assessment)</option>
              <option value="practical">Practical (CIE + SEE test)</option>
            </select>
          </div>
        )}
      </div>
      <div style={{ marginTop: 14 }}>
        <div className="spread"><label>Course Outcomes (max 5)</label><button className="sm" onClick={addCo} disabled={cos.length>=5}>+ CO</button></div>
        <div className="col" style={{ gap: 8 }}>
          {cos.map((c, i) => {
            const derived = deriveCoCeiling(c.description);
            const effective = c.maxRbtl || derived.level; // manual override wins
            return (
              <div key={c.coId} className="col" style={{ gap: 4 }}>
                <div className="row">
                  <span className="tag co" style={{ minWidth: 44 }}>{c.coId}</span>
                  <input value={c.description} onChange={(e)=>setCoDesc(i, e.target.value)} placeholder="Outcome description (e.g. 'Apply subnetting to design IP schemes')" />
                </div>
                <div className="row" style={{ gap: 8, alignItems: 'center', paddingLeft: 50, fontSize: '0.75rem' }}>
                  <span className="muted">Bloom's ceiling:</span>
                  <select value={c.maxRbtl || ''} onChange={(e)=>setCoCeiling(i, e.target.value)} style={{ width: 130 }}>
                    <option value="">{derived.level ? `Auto (${derived.level})` : 'Select level…'}</option>
                    {RBTL_LEVELS.map(r=><option key={r} value={r}>{r}</option>)}
                  </select>
                  {!c.maxRbtl && derived.level && (
                    <span className="muted">detected from: {derived.matchedVerbs.map(m=>m.verb).join(', ')}{derived.ambiguous ? ' (multiple levels — confirm)' : ''}</span>
                  )}
                  {!c.maxRbtl && !derived.level && c.description && (
                    <span className="tag bad">No Bloom's verb found — please set the level manually</span>
                  )}
                  {effective && <span className="tag">questions ≤ {effective}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <label>Exam marks schemes</label>
        <div className="col" style={{ gap: 8, fontSize: '0.8rem' }}>
          <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="tag">SEE</span>
            <span className="muted">equal marks per module:</span>
            <input type="number" value={seeModules} onChange={(e)=>setSeeModules(e.target.value)} style={{ width: 70 }} min={1} max={12} />
            <span className="muted">modules ×</span>
            <input type="number" value={seeTotal} onChange={(e)=>setSeeTotal(e.target.value)} style={{ width: 90 }} min={1} />
            <span className="muted">total = {seeModules > 0 ? (Number(seeTotal)/Number(seeModules)).toFixed(1) : '—'} marks/module</span>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <span className="tag">CIE 1</span><span className="muted">CO1: 10m · CO2: 10m · CO3: 5m</span>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <span className="tag">CIE 2</span><span className="muted">CO3: 5m · CO4: 10m · CO5: 10m</span>
          </div>
          <span className="muted" style={{ fontSize: '0.72rem' }}>
            CIE templates give each CO a balanced 10-mark weightage across the two internal exams. (CIE marks are
            fixed to this scheme; SEE module count and total are configurable above.)
          </span>
          <label className="row" style={{ gap: 8, alignItems: 'center', cursor: 'pointer', marginTop: 4 }}>
            <input type="checkbox" checked={enforceModuleCo} onChange={(e)=>setEnforceModuleCo(e.target.checked)} />
            <span>Enforce a fixed module → CO mapping (when off, any CO may be used on any module, subject to the per-exam scheme).</span>
          </label>
        </div>
      </div>

      <div style={{ marginTop: 16, padding: 12, background: 'var(--surface-2,#f6f8fb)', borderRadius: 8 }}>
        <span className="muted" style={{ fontSize: '0.8rem' }}>
          <strong>CO-PO-PSO mapping</strong> is set by the faculty mapped to this course (from their dashboard),
          not here. As admin you create the course, define its COs, and map the department &amp; faculty; the
          mapped faculty then complete the CO-PO-PSO matrix, which is shared across all faculty of the course.
        </span>
      </div>
      <button className="primary" style={{ marginTop: 14 }} onClick={save}>Save course</button>
    </Card>
  );
}

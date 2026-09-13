import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client.js';
import { Layout, Card, PageHead, Banner, Loading } from '../../components/ui.jsx';

/**
 * Admin course management: create/delete courses, and assign each course to one
 * or more departments with a per-department faculty list (offerings). Only faculty
 * mapped here can view/create/modify/evaluate that course's exams & assessments
 * (enforced server-side).
 */
export default function Courses() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState(null);
  const [depts, setDepts] = useState([]);
  const [creating, setCreating] = useState(false);
  const [offeringsFor, setOfferingsFor] = useState(null);
  const [err, setErr] = useState(null);

  const load = () => api.get('/courses').then((r) => setCourses(r.data.data)).catch((e) => { setCourses([]); setErr(e.message); });
  useEffect(() => {
    load();
    api.get('/admin/departments').then((r) => setDepts(r.data.data)).catch(() => {});
  }, []);

  if (!courses) return <Layout><Loading /></Layout>;
  return (
    <Layout>
      <PageHead title="Courses" sub="Create courses, assign them to departments, and map faculty."
        action={<div className="row" style={{ gap: 8 }}>
          <button onClick={() => navigate('/admin')}>← Admin</button>
          <button className="primary" onClick={() => setCreating((v) => !v)}>{creating ? 'Close' : '+ New course'}</button>
        </div>} />
      <Banner kind="err">{err}</Banner>
      {creating && <CreateCourse onSaved={() => { setCreating(false); load(); }} />}
      {offeringsFor && (
        <OfferingsEditor course={offeringsFor} depts={depts}
          onClose={() => { setOfferingsFor(null); load(); }} />
      )}
      <div className="col">
        {courses.map((c) => (
          <Card key={c._id}>
            <div className="spread wrap" style={{ gap: 8 }}>
              <div>
                <div className="row" style={{ gap: 8 }}><strong>{c.code}</strong><span>{c.title}</span>{c.semester ? <span className="muted">· Sem {c.semester}</span> : null}</div>
                <div className="muted" style={{ fontSize: '0.82rem', marginTop: 3 }}>
                  {(c.offerings && c.offerings.length)
                    ? `${c.offerings.length} department offering(s), ${c.offerings.reduce((n, o) => n + (o.facultyIds?.length || 0), 0)} faculty mapped`
                    : 'No departments/faculty assigned yet'}
                </div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button className="sm" onClick={() => setOfferingsFor(c)}>Departments & faculty</button>
                <button className="ghost sm" onClick={async () => {
                  if (!window.confirm(`Delete ${c.code}? Only possible if it has no exams.`)) return;
                  try { await api.delete(`/courses/${c._id}`); load(); } catch (e) { alert(e.details?.join('; ') || e.message); }
                }}>Delete</button>
              </div>
            </div>
          </Card>
        ))}
        {courses.length === 0 && <p className="muted">No courses yet. Create one to begin.</p>}
      </div>
    </Layout>
  );
}

function CreateCourse({ onSaved }) {
  const [f, setF] = useState({ code: '', title: '', semester: '' });
  const [cos, setCos] = useState([{ coId: 'CO1', description: '' }]);
  const [cohorts, setCohorts] = useState([]);          // selected cohorts for this course
  const [availCohorts, setAvailCohorts] = useState([]); // known cohorts from students
  const [newCohort, setNewCohort] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get('/admin/users/facets').then((r) => setAvailCohorts(r.data.data.cohorts || [])).catch(() => {});
  }, []);

  const toggleCohort = (c) => setCohorts((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  const addNewCohort = () => {
    const v = newCohort.trim();
    if (v && !cohorts.includes(v)) setCohorts([...cohorts, v]);
    if (v && !availCohorts.includes(v)) setAvailCohorts([...availCohorts, v]);
    setNewCohort('');
  };

  const addCo = () => {
    if (cos.length >= 5) return;
    setCos([...cos, { coId: `CO${cos.length + 1}`, description: '' }]);
  };
  const setCo = (i, v) => setCos(cos.map((c, j) => j === i ? { ...c, description: v } : c));
  const removeCo = (i) => { if (cos.length <= 1) return; setCos(cos.filter((_, j) => j !== i).map((c, k) => ({ ...c, coId: `CO${k + 1}` }))); };

  const submit = async () => {
    setErr(null);
    if (!f.code.trim() || !f.title.trim()) { setErr('Code and title are required.'); return; }
    if (cos.some((c) => !c.description.trim())) { setErr('Every course outcome needs a description.'); return; }
    setBusy(true);
    try {
      const payload = { code: f.code.trim(), title: f.title.trim(), cos, cohorts };
      if (f.semester) payload.semester = Number(f.semester);
      await api.post('/courses', payload);
      onSaved();
    } catch (e) { setErr(e.details?.join('; ') || e.message); }
    finally { setBusy(false); }
  };

  return (
    <Card>
      <Banner kind="err">{err}</Banner>
      <div className="grid-2">
        <label>Course code<input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="e.g. BCS601" /></label>
        <label>Title<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Machine Learning" /></label>
        <label>Semester (optional)<input type="number" min="1" max="8" value={f.semester} onChange={(e) => setF({ ...f, semester: e.target.value })} /></label>
      </div>
      <div style={{ marginTop: 10 }}>
        <div className="muted" style={{ fontSize: '0.82rem', marginBottom: 4 }}>Cohorts (batches/sections) this course covers:</div>
        <div className="row wrap" style={{ gap: 6 }}>
          {availCohorts.map((c) => (
            <button key={c} type="button" className={`sm ${cohorts.includes(c) ? 'primary' : 'ghost'}`}
              style={{ fontSize: '0.74rem' }} onClick={() => toggleCohort(c)}>
              {c}{cohorts.includes(c) ? ' ✓' : ''}
            </button>
          ))}
          {availCohorts.length === 0 && <span className="muted" style={{ fontSize: '0.76rem' }}>No cohorts found yet — add students with cohorts, or type one below.</span>}
        </div>
        <div className="row" style={{ gap: 6, marginTop: 6 }}>
          <input value={newCohort} onChange={(e) => setNewCohort(e.target.value)} placeholder="e.g. 2022-CSE-A"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNewCohort(); } }} style={{ maxWidth: 200 }} />
          <button type="button" className="sm" onClick={addNewCohort}>+ Add cohort</button>
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <div className="muted" style={{ fontSize: '0.82rem', marginBottom: 4 }}>Course Outcomes (at least one; up to 5):</div>
        {cos.map((c, i) => (
          <div key={i} className="row" style={{ gap: 6, marginBottom: 4, alignItems: 'flex-start' }}>
            <span className="tag" style={{ minWidth: 42, marginTop: 6 }}>{c.coId}</span>
            <textarea rows={2} style={{ flex: 1 }} value={c.description} onChange={(e) => setCo(i, e.target.value)} placeholder="Course outcome statement" />
            {cos.length > 1 && <button className="ghost sm" onClick={() => removeCo(i)} title="Remove">✕</button>}
          </div>
        ))}
        {cos.length < 5 && <button className="sm" onClick={addCo}>+ Add CO</button>}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="primary" disabled={busy} onClick={submit}>{busy ? 'Creating…' : 'Create course'}</button>
      </div>
      <p className="muted" style={{ fontSize: '0.76rem', marginTop: 6 }}>After creating, use “Departments &amp; faculty” to assign the course to departments and map faculty.</p>
    </Card>
  );
}

function OfferingsEditor({ course, depts, onClose }) {
  // Local offerings state: [{ departmentId, facultyIds: [], facultyAllocations: [{facultyId, sections:[]}] }]
  const [offerings, setOfferings] = useState(
    (course.offerings || []).map((o) => ({
      departmentId: String(o.departmentId?._id || o.departmentId),
      facultyIds: (o.facultyIds || []).map((f) => String(f._id || f)),
      facultyAllocations: (o.facultyAllocations || []).map((a) => ({
        facultyId: String(a.facultyId?._id || a.facultyId),
        sections: [...(a.sections || [])],
      })),
    }))
  );
  const [allFaculty, setAllFaculty] = useState(null); // every mappable faculty, with home dept
  const [allSections, setAllSections] = useState([]); // known sections, e.g. ["A","B","C"]
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [addingTo, setAddingTo] = useState(null); // deptId currently showing the "add external" picker

  // Fetch all mappable faculty once (any department), plus known sections.
  useEffect(() => {
    api.get('/admin/mappable-faculty').then((r) => setAllFaculty(r.data.data)).catch(() => setAllFaculty([]));
    api.get('/admin/users/facets').then((r) => setAllSections(r.data.data.sections || [])).catch(() => {});
  }, []);

  // Sections allotted to a faculty in an offering (empty = all sections).
  const allocFor = (o, fid) => (o.facultyAllocations || []).find((a) => String(a.facultyId) === String(fid))?.sections || [];

  // Toggle one section for one faculty within one department offering.
  const toggleSection = (deptId, fid, sec) => setOfferings(offerings.map((o) => {
    if (o.departmentId !== deptId) return o;
    const allocs = [...(o.facultyAllocations || [])];
    const i = allocs.findIndex((a) => String(a.facultyId) === String(fid));
    if (i === -1) {
      allocs.push({ facultyId: String(fid), sections: [sec] });
    } else {
      const secs = allocs[i].sections || [];
      allocs[i] = { ...allocs[i], sections: secs.includes(sec) ? secs.filter((x) => x !== sec) : [...secs, sec] };
    }
    return { ...o, facultyAllocations: allocs };
  }));

  const facultyById = (id) => (allFaculty || []).find((f) => String(f._id) === String(id));

  const addDept = (deptId) => {
    if (!deptId || offerings.some((o) => o.departmentId === deptId)) return;
    setOfferings([...offerings, { departmentId: deptId, facultyIds: [], facultyAllocations: [] }]);
  };
  const removeDept = (deptId) => setOfferings(offerings.filter((o) => o.departmentId !== deptId));
  const toggleFaculty = (deptId, fid) => setOfferings(offerings.map((o) => {
    if (o.departmentId !== deptId) return o;
    const has = o.facultyIds.includes(fid);
    if (has) {
      // Unmapping: also remove any section allocation for this faculty.
      return {
        ...o,
        facultyIds: o.facultyIds.filter((x) => x !== fid),
        facultyAllocations: (o.facultyAllocations || []).filter((a) => String(a.facultyId) !== String(fid)),
      };
    }
    return { ...o, facultyIds: [...o.facultyIds, fid] };
  }));

  const save = async () => {
    setErr(null); setBusy(true);
    try {
      await api.put(`/courses/${course._id}/offerings`, { offerings });
      setMsg('Saved.'); setTimeout(() => setMsg(null), 2000);
    } catch (e) { setErr(e.details?.join('; ') || e.message); }
    finally { setBusy(false); }
  };

  const deptName = (id) => depts.find((d) => String(d._id) === String(id))?.code || 'Department';
  const availableDepts = depts.filter((d) => !offerings.some((o) => o.departmentId === String(d._id)));

  return (
    <Card style={{ border: '2px solid var(--accent,#2e5faa)' }}>
      <div className="spread">
        <strong>{course.code} — Departments &amp; faculty</strong>
        <div className="row" style={{ gap: 8 }}>
          <button className="primary sm" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
          <button className="sm" onClick={onClose}>Done</button>
        </div>
      </div>
      <Banner kind="err">{err}</Banner>
      {msg && <Banner kind="ok">{msg}</Banner>}
      <p className="muted" style={{ fontSize: '0.78rem' }}>
        Add each department that offers this course, then choose the faculty who may teach it.
        Faculty from <strong>any department</strong> can be mapped &mdash; e.g. a Maths faculty teaching a CSE batch under the CSE offering.
        Only mapped faculty can view/create/modify/evaluate this course&rsquo;s exams and assessments.
      </p>

      {offerings.length === 0 && <p className="muted" style={{ fontSize: '0.8rem' }}>No departments assigned yet.</p>}
      {!allFaculty && <p className="muted" style={{ fontSize: '0.76rem' }}>Loading faculty…</p>}

      {allFaculty && offerings.map((o) => {
        const ownDeptFaculty = allFaculty.filter((f) => String(f.departmentId) === String(o.departmentId));
        const mappedExternal = o.facultyIds
          .map(facultyById)
          .filter((f) => f && String(f.departmentId) !== String(o.departmentId));
        return (
          <div key={o.departmentId} style={{ borderTop: '1px solid var(--line-soft,#eee)', paddingTop: 10, marginTop: 10 }}>
            <div className="spread">
              <strong style={{ fontSize: '0.9rem' }}>{deptName(o.departmentId)}</strong>
              <button className="ghost sm" onClick={() => removeDept(o.departmentId)}>Remove department</button>
            </div>

            {/* Own-department faculty */}
            <div className="muted" style={{ fontSize: '0.72rem', marginTop: 8 }}>Faculty of this department:</div>
            <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
              {ownDeptFaculty.map((u) => (
                <button key={u._id} className={`sm ${o.facultyIds.includes(String(u._id)) ? 'primary' : 'ghost'}`}
                  style={{ fontSize: '0.74rem' }} onClick={() => toggleFaculty(o.departmentId, String(u._id))}>
                  {u.name} <span className="muted">({u.role})</span>{o.facultyIds.includes(String(u._id)) ? ' ✓' : ''}
                </button>
              ))}
              {ownDeptFaculty.length === 0 && <span className="muted" style={{ fontSize: '0.76rem' }}>No faculty in this department yet.</span>}
            </div>

            {/* External (other-department) faculty already mapped */}
            {mappedExternal.length > 0 && (
              <>
                <div className="muted" style={{ fontSize: '0.72rem', marginTop: 10 }}>Mapped from other departments:</div>
                <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
                  {mappedExternal.map((u) => (
                    <button key={u._id} className="sm primary" style={{ fontSize: '0.74rem', background: 'var(--amber,#c07a1e)' }}
                      onClick={() => toggleFaculty(o.departmentId, String(u._id))}>
                      {u.name} <span style={{ opacity: 0.85 }}>({u.departmentCode || 'ext'})</span> ✓
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Add faculty from another department */}
            <div style={{ marginTop: 8 }}>
              {addingTo === o.departmentId ? (
                <select autoFocus defaultValue="" style={{ fontSize: '0.78rem' }}
                  onChange={(e) => { if (e.target.value) toggleFaculty(o.departmentId, e.target.value); setAddingTo(null); }}
                  onBlur={() => setAddingTo(null)}>
                  <option value="" disabled>Choose faculty from another department…</option>
                  {allFaculty
                    .filter((f) => String(f.departmentId) !== String(o.departmentId) && !o.facultyIds.includes(String(f._id)))
                    .map((f) => (
                      <option key={f._id} value={f._id}>{f.name} — {f.departmentCode || 'no dept'} ({f.role})</option>
                    ))}
                </select>
              ) : (
                <button className="ghost sm" style={{ fontSize: '0.74rem' }} onClick={() => setAddingTo(o.departmentId)}>
                  + Add faculty from another department
                </button>
              )}
            </div>

            {/* Section allocation: which section(s) each mapped faculty teaches.
                Drives what attainment that faculty can see. */}
            {o.facultyIds.length > 0 && (
              <div style={{ marginTop: 12, borderTop: '1px dashed var(--line-soft,#e5e5e5)', paddingTop: 10 }}>
                <div className="muted" style={{ fontSize: '0.72rem', marginBottom: 6 }}>
                  Section allocation — a faculty sees attainment only for their allotted section(s).
                  Leave all unticked to give a faculty access to <em>all</em> sections.
                </div>
                {allSections.length === 0 && (
                  <div className="muted" style={{ fontSize: '0.74rem' }}>No sections found. Add students with a section (e.g. “A”) first.</div>
                )}
                {allSections.length > 0 && o.facultyIds.map((fid) => {
                  const u = facultyById(fid);
                  const mine = allocFor(o, fid);
                  return (
                    <div key={fid} className="row wrap" style={{ gap: 6, alignItems: 'center', marginBottom: 5 }}>
                      <span style={{ fontSize: '0.78rem', minWidth: 150 }}>
                        {u ? u.name : fid}
                        {u && String(u.departmentId) !== String(o.departmentId) && (
                          <span className="muted"> ({u.departmentCode || 'ext'})</span>
                        )}
                      </span>
                      {allSections.map((sec) => (
                        <button key={sec} type="button"
                          className={`sm ${mine.includes(sec) ? 'primary' : 'ghost'}`}
                          style={{ fontSize: '0.72rem', minWidth: 34 }}
                          onClick={() => toggleSection(o.departmentId, fid, sec)}>
                          {sec}
                        </button>
                      ))}
                      <span className="muted" style={{ fontSize: '0.7rem' }}>
                        {mine.length === 0 ? 'all sections' : `${mine.join(', ')}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {availableDepts.length > 0 && (
        <div className="row" style={{ gap: 8, marginTop: 12, alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: '0.8rem' }}>Add department:</span>
          <select onChange={(e) => { addDept(e.target.value); e.target.value = ''; }} defaultValue="">
            <option value="" disabled>Choose…</option>
            {availableDepts.map((d) => <option key={d._id} value={d._id}>{d.code} — {d.name}</option>)}
          </select>
        </div>
      )}
    </Card>
  );
}

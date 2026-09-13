import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client.js';
import { Layout, Card, PageHead, Banner, Loading } from '../../components/ui.jsx';

const roleColor = (r) => ({ admin: '#7c3aed', faculty: '#2563eb', hod: '#0891b2', student: '#1f9d55' }[r] || '#555');

export default function UsersDashboard() {
  const navigate = useNavigate();
  const [facets, setFacets] = useState(null);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  // filters
  const [role, setRole] = useState('');
  const [department, setDepartment] = useState('');
  const [cohort, setCohort] = useState('');
  const [active, setActive] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null); // user being edited, or null

  useEffect(() => { api.get('/admin/users/facets').then((r) => setFacets(r.data.data)).catch((e) => setErr(e.message)); }, []);

  const load = useCallback(() => {
    const params = { page, limit: 25 };
    if (role) params.role = role;
    if (department) params.department = department;
    if (cohort) params.cohort = cohort;
    if (active) params.active = active;
    if (q.trim()) params.q = q.trim();
    api.get('/admin/users', { params }).then((r) => setData(r.data.data)).catch((e) => setErr(e.message));
  }, [role, department, cohort, active, q, page]);

  useEffect(() => { load(); }, [load]);
  // reset to page 1 when a filter changes
  useEffect(() => { setPage(1); }, [role, department, cohort, active, q]);

  const clear = () => { setRole(''); setDepartment(''); setCohort(''); setActive(''); setQ(''); };

  return (
    <Layout>
      <PageHead title="Users" sub="All accounts across the institution, with filters."
        action={<div className="row" style={{ gap: 8 }}>
          <button onClick={() => navigate('/admin')}>← Admin</button>
          <button className="primary" onClick={() => navigate('/admin/users/add')}>+ Add users</button>
          <button onClick={() => navigate('/admin/audit')}>View logs →</button>
        </div>} />
      <Banner kind="err">{err}</Banner>

      {/* Summary chips */}
      {facets && (
        <Card style={{ marginBottom: 12 }}>
          <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
            <span className="tag" style={{ fontSize: '0.72rem' }}>Total: <strong>{facets.total}</strong></span>
            {Object.entries(facets.byRole).map(([r, c]) => (
              <button key={r} className="tag" onClick={() => setRole(role === r ? '' : r)}
                style={{ fontSize: '0.72rem', cursor: 'pointer', background: role === r ? roleColor(r) : undefined, color: role === r ? '#fff' : undefined, textTransform: 'capitalize' }}>
                {r}: {c}
              </button>
            ))}
            <span className="tag" style={{ fontSize: '0.72rem' }}>Active: {facets.active}</span>
            <span className="tag" style={{ fontSize: '0.72rem' }}>Inactive: {facets.inactive}</span>
          </div>
        </Card>
      )}

      {/* Filters */}
      <Card style={{ marginBottom: 12 }}>
        <div className="row wrap" style={{ gap: 10, alignItems: 'flex-end' }}>
          <div><label style={{ fontSize: '0.74rem' }}>Search</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="name, email, roll/employee no" style={{ width: 220 }} /></div>
          <div><label style={{ fontSize: '0.74rem' }}>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} style={{ width: 130 }}>
              <option value="">All roles</option>
              {['admin','faculty','hod','student'].map((r) => <option key={r} value={r}>{r}</option>)}
            </select></div>
          <div><label style={{ fontSize: '0.74rem' }}>Department</label>
            <select value={department} onChange={(e) => setDepartment(e.target.value)} style={{ width: 160 }}>
              <option value="">All departments</option>
              {(facets?.departments || []).map((d) => <option key={d} value={d}>{d}</option>)}
            </select></div>
          <div><label style={{ fontSize: '0.74rem' }}>Cohort</label>
            <select value={cohort} onChange={(e) => setCohort(e.target.value)} style={{ width: 140 }}>
              <option value="">All cohorts</option>
              {(facets?.cohorts || []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select></div>
          <div><label style={{ fontSize: '0.74rem' }}>Status</label>
            <select value={active} onChange={(e) => setActive(e.target.value)} style={{ width: 110 }}>
              <option value="">All</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select></div>
          <button className="sm" onClick={clear}>Clear</button>
        </div>
      </Card>

      {!data ? <Loading /> : (
        <Card style={{ padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--line,#ddd)', textAlign: 'left' }}>
                  {['Name','Email','Role','Roll/Emp ID','Department','Cohort','Status','Edit'].map((h) => (
                    <th key={h} style={{ padding: '8px 12px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u._id} style={{ borderBottom: '1px solid var(--line-soft,#eee)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{u.name}</td>
                    <td style={{ padding: '8px 12px' }}>{u.email}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span className="tag" style={{ background: roleColor(u.role), color: '#fff', fontSize: '0.68rem', textTransform: 'capitalize' }}>{u.role}</span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>{u.rollNo || u.employeeId || '—'}</td>
                    <td style={{ padding: '8px 12px' }}>{u.department || '—'}</td>
                    <td style={{ padding: '8px 12px' }}>{u.cohort || '—'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span className="tag" style={{ fontSize: '0.66rem', background: u.active ? 'var(--ok,#1f9d55)' : 'var(--bad,#dc2626)', color: '#fff' }}>
                        {u.active ? 'active' : 'inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <button className="sm ghost" style={{ fontSize: '0.72rem' }} onClick={() => setEditing(u)}>Edit</button>
                    </td>
                  </tr>
                ))}
                {data.users.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: 20, textAlign: 'center', color: '#888' }}>No users match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pager data={data} page={page} setPage={setPage} />
        </Card>
      )}
      {editing && (
        <EditUserModal user={editing} facets={facets}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }} />
      )}
    </Layout>
  );
}

function Pager({ data, page, setPage }) {
  if (!data || data.total === 0) return null;
  return (
    <div className="spread" style={{ padding: '10px 14px', borderTop: '1px solid var(--line-soft,#eee)', fontSize: '0.8rem' }}>
      <span className="muted">{data.total} result{data.total === 1 ? '' : 's'} · page {data.page} of {data.pages}</span>
      <div className="row" style={{ gap: 6 }}>
        <button className="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
        <button className="sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next →</button>
      </div>
    </div>
  );
}

// Admin edit-user modal: edit details and move a student to another batch/section.
function EditUserModal({ user, facets, onClose, onSaved }) {
  const [f, setF] = useState({
    name: user.name || '', email: user.email || '',
    department: user.department || '', cohort: user.cohort || '',
    section: user.section || '', rollNo: user.rollNo || '',
    employeeId: user.employeeId || '', active: user.active !== false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const isStudent = user.role === 'student';

  const save = async () => {
    setErr(null); setBusy(true);
    try {
      await api.put(`/admin/users/${user._id}`, f);
      onSaved();
    } catch (e) { setErr(e.details?.join('; ') || e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={onClose}>
      <div style={{ background: 'var(--surface,#fff)', borderRadius: 12, padding: 22, width: 'min(560px, 92vw)', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="spread" style={{ marginBottom: 12 }}>
          <strong style={{ fontSize: '1.05rem' }}>Edit {user.role}</strong>
          <button className="sm ghost" onClick={onClose}>✕</button>
        </div>
        {err && <Banner kind="err">{err}</Banner>}
        <div className="grid-2" style={{ gap: 12 }}>
          <label>Name<input value={f.name} onChange={set('name')} /></label>
          <label>Email<input value={f.email} onChange={set('email')} /></label>
          <label>Department<input value={f.department} onChange={set('department')} placeholder="e.g. CSE" /></label>
          {isStudent ? (
            <label>Roll No<input value={f.rollNo} onChange={set('rollNo')} /></label>
          ) : (
            <label>Employee ID<input value={f.employeeId} onChange={set('employeeId')} /></label>
          )}
          {isStudent && (
            <>
              <label>Batch / cohort
                <input value={f.cohort} onChange={set('cohort')} placeholder="e.g. 2021-CSE" list="cohort-list" />
                <datalist id="cohort-list">{(facets?.cohorts || []).map((c) => <option key={c} value={c} />)}</datalist>
              </label>
              <label>Section
                <input value={f.section} onChange={set('section')} placeholder="e.g. A" list="section-list" />
                <datalist id="section-list">{(facets?.sections || []).map((s) => <option key={s} value={s} />)}</datalist>
              </label>
            </>
          )}
        </div>
        <label className="row" style={{ gap: 8, alignItems: 'center', marginTop: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={f.active} onChange={set('active')} />
          <span>Active account</span>
        </label>
        <div className="row" style={{ gap: 10, marginTop: 16 }}>
          <button className="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

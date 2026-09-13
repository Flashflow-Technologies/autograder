import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client.js';
import { Layout, Card, PageHead, Banner, Loading } from '../../components/ui.jsx';

export default function Departments() {
  const navigate = useNavigate();
  const [depts, setDepts] = useState(null);
  const [creating, setCreating] = useState(false);
  const [manage, setManage] = useState(null); // dept being managed (members)
  const [err, setErr] = useState(null);

  const load = () => api.get('/admin/departments').then((r) => setDepts(r.data.data)).catch((e) => { setDepts([]); setErr(e.message); });
  useEffect(() => { load(); }, []);

  if (!depts) return <Layout><Loading /></Layout>;
  return (
    <Layout>
      <PageHead title="Departments" sub="Create departments and map faculty and students to them."
        action={<div className="row" style={{ gap: 8 }}>
          <button onClick={() => navigate('/admin')}>← Admin</button>
          <button className="primary" onClick={() => setCreating((v) => !v)}>{creating ? 'Close' : '+ New department'}</button>
        </div>} />
      <Banner kind="err">{err}</Banner>
      {creating && <CreateDept onSaved={() => { setCreating(false); load(); }} />}
      {manage && <ManageMembers dept={manage} onClose={() => { setManage(null); load(); }} />}
      <div className="col">
        {depts.map((d) => (
          <Card key={d._id}>
            <div className="spread wrap" style={{ gap: 8 }}>
              <div>
                <div className="row" style={{ gap: 8 }}><strong>{d.code}</strong><span>{d.name}</span>{!d.active && <span className="tag bad">inactive</span>}</div>
                <div className="muted" style={{ fontSize: '0.82rem', marginTop: 3 }}>{d.facultyCount} faculty · {d.studentCount} students</div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button className="sm" onClick={() => setManage(d)}>Manage members</button>
                <button className="sm" onClick={() => navigate(`/admin/department/${d._id}/settings`)}>Settings (V/M, PO, PSO, PEO, WK)</button>
                <button className="ghost sm" onClick={async () => {
                  if (!window.confirm(`Delete ${d.code}? Only possible if no users are mapped.`)) return;
                  try { await api.delete(`/admin/departments/${d._id}`); load(); } catch (e) { alert(e.message); }
                }}>Delete</button>
              </div>
            </div>
          </Card>
        ))}
        {depts.length === 0 && <p className="muted">No departments yet. Create one to begin.</p>}
      </div>
    </Layout>
  );
}

function CreateDept({ onSaved }) {
  const [f, setF] = useState({ name: '', code: '' });
  const [users, setUsers] = useState({ members: [], unassigned: [] });
  const [pick, setPick] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  // Load assignable (unassigned) users so admin can map at creation time.
  useEffect(() => {
    api.get('/admin/users', { params: { unassigned: true, limit: 200 } }).then((r) => {
      const list = (r.data.data.users || []).filter((u) => !u.departmentId);
      setUsers({ members: [], unassigned: list });
    }).catch(() => {});
  }, []);

  const toggle = (id) => { const n = new Set(pick); n.has(id) ? n.delete(id) : n.add(id); setPick(n); };

  const submit = async () => {
    setErr(null); setBusy(true);
    try {
      const ids = [...pick];
      const facultyIds = users.unassigned.filter((u) => ids.includes(String(u._id)) && u.role !== 'student').map((u) => u._id);
      const studentIds = users.unassigned.filter((u) => ids.includes(String(u._id)) && u.role === 'student').map((u) => u._id);
      await api.post('/admin/departments', { name: f.name, code: f.code, facultyIds, studentIds });
      onSaved();
    } catch (e) { setErr(e.details?.join('; ') || e.message); }
    finally { setBusy(false); }
  };

  return (
    <Card>
      <Banner kind="err">{err}</Banner>
      <div className="grid-2">
        <label>Department name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Computer Science & Engineering" /></label>
        <label>Code<input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="CSE" /></label>
      </div>
      {users.unassigned.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="muted" style={{ fontSize: '0.8rem', marginBottom: 4 }}>Optionally map unassigned users now:</div>
          <div className="row wrap" style={{ gap: 6, maxHeight: 180, overflowY: 'auto' }}>
            {users.unassigned.map((u) => (
              <button key={u._id} className={`sm ${pick.has(String(u._id)) ? 'primary' : 'ghost'}`} style={{ fontSize: '0.72rem' }} onClick={() => toggle(String(u._id))}>
                {u.name} <span className="muted">({u.role})</span>{pick.has(String(u._id)) ? ' ✓' : ''}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="row" style={{ marginTop: 10 }}>
        <button className="primary" disabled={busy || !f.name || !f.code} onClick={submit}>{busy ? 'Creating…' : `Create${pick.size ? ` & map ${pick.size}` : ''}`}</button>
      </div>
    </Card>
  );
}

function ManageMembers({ dept, onClose }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const load = () => api.get(`/admin/departments/${dept._id}/members`).then((r) => setData(r.data.data)).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [dept._id]);

  const add = async (id) => { await api.post(`/admin/departments/${dept._id}/map`, { addUserIds: [id] }); load(); };
  const remove = async (id) => { await api.post(`/admin/departments/${dept._id}/map`, { removeUserIds: [id] }); load(); };

  return (
    <Card>
      <div className="spread"><strong>Manage {dept.code} members</strong><button className="sm" onClick={onClose}>Done</button></div>
      <Banner kind="err">{err}</Banner>
      {!data ? <Loading /> : (
        <div className="grid-2" style={{ marginTop: 8 }}>
          <div>
            <div className="muted" style={{ fontSize: '0.8rem', marginBottom: 4 }}>Members ({data.members.length})</div>
            {data.members.map((u) => (
              <div key={u._id} className="row spread" style={{ gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: '0.8rem' }}>{u.name} <span className="muted">({u.role})</span></span>
                <button className="ghost sm" onClick={() => remove(u._id)}>Remove</button>
              </div>
            ))}
            {data.members.length === 0 && <p className="muted" style={{ fontSize: '0.78rem' }}>No members yet.</p>}
          </div>
          <div>
            <div className="muted" style={{ fontSize: '0.8rem', marginBottom: 4 }}>Unassigned users ({data.unassigned.length})</div>
            {data.unassigned.map((u) => (
              <div key={u._id} className="row spread" style={{ gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: '0.8rem' }}>{u.name} <span className="muted">({u.role})</span></span>
                <button className="sm" onClick={() => add(u._id)}>Add</button>
              </div>
            ))}
            {data.unassigned.length === 0 && <p className="muted" style={{ fontSize: '0.78rem' }}>No unassigned users.</p>}
          </div>
        </div>
      )}
    </Card>
  );
}

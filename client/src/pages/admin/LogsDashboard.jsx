import { useState, useEffect, useCallback, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client.js';
import { Layout, Card, PageHead, Banner, Loading } from '../../components/ui.jsx';

const roleColor = (r) => ({ admin: '#7c3aed', faculty: '#2563eb', hod: '#0891b2', student: '#1f9d55' }[r] || '#555');
const fmt = (d) => d ? new Date(d).toLocaleString() : '';

export default function LogsDashboard() {
  const navigate = useNavigate();
  const [facets, setFacets] = useState(null);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const [action, setAction] = useState('');
  const [actorRole, setActorRole] = useState('');
  const [targetType, setTargetType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { api.get('/admin/audit/facets').then((r) => setFacets(r.data.data)).catch((e) => setErr(e.message)); }, []);

  const load = useCallback(() => {
    const params = { page, limit: 30 };
    if (action) params.action = action;
    if (actorRole) params.actorRole = actorRole;
    if (targetType) params.targetType = targetType;
    if (from) params.from = from;
    if (to) params.to = to;
    if (q.trim()) params.q = q.trim();
    api.get('/admin/audit', { params }).then((r) => setData(r.data.data)).catch((e) => setErr(e.message));
  }, [action, actorRole, targetType, from, to, q, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [action, actorRole, targetType, from, to, q]);

  const clear = () => { setAction(''); setActorRole(''); setTargetType(''); setFrom(''); setTo(''); setQ(''); };

  return (
    <Layout>
      <PageHead title="Audit logs" sub="Every material action recorded across the system."
        action={<div className="row" style={{ gap: 8 }}>
          <button onClick={() => navigate('/admin')}>← Admin</button>
          <button onClick={() => navigate('/admin/users')}>View users →</button>
        </div>} />
      <Banner kind="err">{err}</Banner>

      <Card style={{ marginBottom: 12 }}>
        <div className="row wrap" style={{ gap: 10, alignItems: 'flex-end' }}>
          <div><label style={{ fontSize: '0.74rem' }}>Search</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="action, target, reason" style={{ width: 200 }} /></div>
          <div><label style={{ fontSize: '0.74rem' }}>Action</label>
            <select value={action} onChange={(e) => setAction(e.target.value)} style={{ width: 170 }}>
              <option value="">All actions</option>
              {(facets?.actions || []).map((a) => <option key={a} value={a}>{a}</option>)}
            </select></div>
          <div><label style={{ fontSize: '0.74rem' }}>Actor role</label>
            <select value={actorRole} onChange={(e) => setActorRole(e.target.value)} style={{ width: 120 }}>
              <option value="">All roles</option>
              {(facets?.actorRoles || []).map((r) => <option key={r} value={r}>{r}</option>)}
            </select></div>
          <div><label style={{ fontSize: '0.74rem' }}>Target type</label>
            <select value={targetType} onChange={(e) => setTargetType(e.target.value)} style={{ width: 140 }}>
              <option value="">All targets</option>
              {(facets?.targetTypes || []).map((t) => <option key={t} value={t}>{t}</option>)}
            </select></div>
          <div><label style={{ fontSize: '0.74rem' }}>From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} /></div>
          <div><label style={{ fontSize: '0.74rem' }}>To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} /></div>
          <button className="sm" onClick={clear}>Clear</button>
        </div>
      </Card>

      {!data ? <Loading /> : (
        <Card style={{ padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--line,#ddd)', textAlign: 'left' }}>
                  {['Time','Actor','Action','Target','Reason',''].map((h, i) => (
                    <th key={i} style={{ padding: '8px 12px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.logs.map((l) => {
                  const isOpen = expanded === l._id;
                  const hasDetail = l.before != null || l.after != null;
                  return (
                    <Fragment key={l._id}>
                      <tr style={{ borderBottom: '1px solid var(--line-soft,#eee)' }}>
                        <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{fmt(l.timestamp)}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <div>{l.actorId?.name || 'Unknown'}</div>
                          {l.actorRole && <span className="tag" style={{ background: roleColor(l.actorRole), color: '#fff', fontSize: '0.64rem', textTransform: 'capitalize' }}>{l.actorRole}</span>}
                        </td>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '0.78rem' }}>{l.action}</td>
                        <td style={{ padding: '8px 12px' }}>{l.targetType || '—'}</td>
                        <td style={{ padding: '8px 12px', maxWidth: 240, color: '#555' }}>{l.reason || '—'}</td>
                        <td style={{ padding: '8px 12px' }}>
                          {hasDetail && <button className="sm" onClick={() => setExpanded(isOpen ? null : l._id)}>{isOpen ? 'Hide' : 'Detail'}</button>}
                        </td>
                      </tr>
                      {isOpen && hasDetail && (
                        <tr>
                          <td colSpan={6} style={{ padding: '8px 16px', background: 'var(--bg-soft,#f8f9fb)' }}>
                            <div className="row wrap" style={{ gap: 20, alignItems: 'flex-start' }}>
                              <div style={{ flex: 1, minWidth: 200 }}>
                                <div className="muted" style={{ fontSize: '0.72rem', marginBottom: 4 }}>Before</div>
                                <pre style={{ fontSize: '0.72rem', whiteSpace: 'pre-wrap', margin: 0 }}>{l.before != null ? JSON.stringify(l.before, null, 2) : '—'}</pre>
                              </div>
                              <div style={{ flex: 1, minWidth: 200 }}>
                                <div className="muted" style={{ fontSize: '0.72rem', marginBottom: 4 }}>After</div>
                                <pre style={{ fontSize: '0.72rem', whiteSpace: 'pre-wrap', margin: 0 }}>{l.after != null ? JSON.stringify(l.after, null, 2) : '—'}</pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {data.logs.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#888' }}>No log entries match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {data.total > 0 && (
            <div className="spread" style={{ padding: '10px 14px', borderTop: '1px solid var(--line-soft,#eee)', fontSize: '0.8rem' }}>
              <span className="muted">{data.total} entr{data.total === 1 ? 'y' : 'ies'} · page {data.page} of {data.pages}</span>
              <div className="row" style={{ gap: 6 }}>
                <button className="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
                <button className="sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next →</button>
              </div>
            </div>
          )}
        </Card>
      )}
    </Layout>
  );
}

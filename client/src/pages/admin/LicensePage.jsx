import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client.js';
import { Layout, Card, PageHead, Banner, Loading } from '../../components/ui.jsx';

const statusColor = (s) => ({ active: '#1f9d55', expired: '#d97706', invalid: '#dc2626', unlicensed: '#dc2626' }[s] || '#555');

export default function LicensePage() {
  const navigate = useNavigate();
  const [lic, setLic] = useState(null);
  const [plans, setPlans] = useState([]);
  const [key, setKey] = useState('');
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [updates, setUpdates] = useState(null);
  const [checkingUpd, setCheckingUpd] = useState(false);

  const load = () => {
    api.get('/license/status').then((r) => setLic(r.data.data)).catch((e) => setErr(e.message));
    api.get('/license/plans').then((r) => setPlans(r.data.data)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const checkUpdates = () => {
    setCheckingUpd(true); setUpdates(null);
    api.get('/license/updates').then((r) => setUpdates(r.data.data)).catch((e) => setUpdates({ error: e.message })).finally(() => setCheckingUpd(false));
  };

  const install = async () => {
    setErr(null); setMsg(null); setBusy(true);
    try {
      const r = await api.post('/license/install', { key: key.trim() });
      setMsg(r.data.message || 'Licence activated.');
      setKey('');
      load();
    } catch (e) {
      setErr(e.details?.join('; ') || e.message || 'Could not activate licence.');
    } finally { setBusy(false); }
  };

  if (!lic) return <Layout><Loading /></Layout>;

  return (
    <Layout>
      <PageHead title="Licence" sub="Manage your EvalAI licence and plan"
        action={<button onClick={() => navigate('/admin')}>← Admin</button>} />
      <Banner kind="info">{msg}</Banner>
      <Banner kind="err">{err}</Banner>

      <Card style={{ marginBottom: 14 }}>
        <div className="spread wrap" style={{ gap: 12, alignItems: 'center' }}>
          <div>
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <strong style={{ fontSize: '0.95rem' }}>Status</strong>
              <span className="tag" style={{ background: statusColor(lic.status), color: '#fff', textTransform: 'capitalize' }}>{lic.status}</span>
              {!lic.enforced && <span className="muted" style={{ fontSize: '0.74rem' }}>(enforcement off — development mode)</span>}
            </div>
            <div className="muted" style={{ fontSize: '0.82rem', marginTop: 6 }}>
              {lic.institution && <>Licensed to <strong>{lic.institution}</strong> · </>}
              {lic.planLabel && <>Plan: <strong>{lic.planLabel}</strong> · </>}
              {lic.expiresAt
                ? <>Expires {new Date(lic.expiresAt).toLocaleDateString()} {lic.daysLeft != null && <>({lic.daysLeft} day{lic.daysLeft === 1 ? '' : 's'} left)</>}</>
                : 'No expiry'}
            </div>
          </div>
        </div>
        {lic.message && <Banner kind={lic.status === 'expired' ? 'warn' : 'err'} style={{ marginTop: 10 }}>{lic.message}</Banner>}
        {lic.status === 'expired' && (
          <p className="muted" style={{ fontSize: '0.78rem', marginTop: 8, marginBottom: 0 }}>
            Your existing data remains fully accessible. New actions (creating exams) are disabled until you install a renewed licence below.
          </p>
        )}
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <strong style={{ fontSize: '0.9rem' }}>Install / renew licence</strong>
        <p className="muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
          Paste the licence key provided by your EvalAI vendor. To keep it across server restarts, also set <code>LICENSE_KEY</code> in the server environment.
        </p>
        <textarea value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste licence key here…"
          style={{ width: '100%', minHeight: 90, fontFamily: 'monospace', fontSize: '0.78rem' }} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="primary" disabled={busy || !key.trim()} onClick={install}>{busy ? 'Activating…' : 'Activate licence'}</button>
        </div>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <div className="spread wrap" style={{ gap: 8, alignItems: 'center' }}>
          <strong style={{ fontSize: '0.9rem' }}>Software updates</strong>
          <button className="sm" onClick={checkUpdates} disabled={checkingUpd}>{checkingUpd ? 'Checking…' : 'Check for updates'}</button>
        </div>
        <p className="muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
          Updates and security patches are included with an active licence.
        </p>
        {updates && (
          <div style={{ marginTop: 6 }}>
            {updates.entitled === false ? (
              <Banner kind="warn">{updates.reason || 'Updates require an active licence.'}</Banner>
            ) : updates.error ? (
              <Banner kind="err">{updates.error}</Banner>
            ) : updates.upToDate ? (
              <Banner kind="ok">You are on the latest version ({updates.current}).</Banner>
            ) : (
              <Banner kind="info">
                Update available: <strong>{updates.latest}</strong> (you have {updates.current}).
                {updates.notes && <> — {updates.notes}</>}
                {updates.downloadUrl && <> Contact your provider or see the release at the supplied link.</>}
              </Banner>
            )}
          </div>
        )}
      </Card>

      {plans.length > 0 && (
        <Card>
          <strong style={{ fontSize: '0.9rem' }}>Plans</strong>
          <div className="col" style={{ gap: 8, marginTop: 8 }}>
            {plans.map((p) => (
              <div key={p.key} style={{ borderLeft: `3px solid ${lic.plan === p.key ? '#2e5faa' : 'var(--line-soft,#ddd)'}`, paddingLeft: 10 }}>
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <strong style={{ fontSize: '0.85rem' }}>{p.label}</strong>
                  {lic.plan === p.key && <span className="tag" style={{ fontSize: '0.66rem' }}>current</span>}
                </div>
                <div className="muted" style={{ fontSize: '0.76rem' }}>
                  Students: {p.limits.maxStudents ?? 'unlimited'} · Programming questions: {p.features.programmingQuestions ? 'yes' : 'no'} · HoD dashboard: {p.features.hodDashboard ? 'yes' : 'no'}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </Layout>
  );
}

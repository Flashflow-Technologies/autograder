import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client.js';
import { Layout, Card, PageHead, Banner, Loading } from '../../components/ui.jsx';

/**
 * Accountability dashboard (admin):
 *   #7 audit-chain integrity check
 *   #9 bias monitoring across cohorts
 *   #10 AI-vs-human agreement by Bloom level
 */
export default function AccountabilityDashboard() {
  const navigate = useNavigate();
  const [bias, setBias] = useState(null);
  const [agreement, setAgreement] = useState(null);
  const [verify, setVerify] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get('/admin/analytics/bias').then((r) => setBias(r.data.data)).catch((e) => setErr(e.message));
    api.get('/admin/analytics/agreement').then((r) => setAgreement(r.data.data)).catch((e) => setErr(e.message));
  }, []);

  const runVerify = () => {
    setVerifying(true); setVerify(null);
    api.get('/admin/audit/verify').then((r) => setVerify(r.data.data)).catch((e) => setVerify({ error: e.message })).finally(() => setVerifying(false));
  };

  return (
    <Layout>
      <PageHead title="Accountability & fairness" sub="Audit integrity, bias monitoring, and AI-vs-human oversight."
        action={<div className="row" style={{ gap: 8 }}>
          <button onClick={() => navigate('/admin')}>← Admin</button>
          <button onClick={() => navigate('/admin/audit')}>Audit logs</button>
        </div>} />
      <Banner kind="err">{err}</Banner>

      {/* #7 Tamper-evidence */}
      <Card style={{ marginBottom: 14 }}>
        <div className="spread wrap" style={{ gap: 8, alignItems: 'center' }}>
          <strong style={{ fontSize: '0.9rem' }}>Audit log integrity</strong>
          <button className="sm" onClick={runVerify} disabled={verifying}>{verifying ? 'Verifying…' : 'Verify audit chain'}</button>
        </div>
        <p className="muted" style={{ fontSize: '0.78rem', marginTop: 4 }}>
          Each audit entry is cryptographically hash-chained to the previous one. This check recomputes the chain to detect any tampering with past records.
        </p>
        {verify && (verify.error
          ? <Banner kind="err">{verify.error}</Banner>
          : verify.ok
            ? <Banner kind="ok">Audit chain intact — verified {verify.checked} of {verify.total} entries.</Banner>
            : <Banner kind="err">Integrity check FAILED — chain breaks at entry #{verify.brokenAt}. Records may have been tampered with.</Banner>
        )}
      </Card>

      {/* #10 AI-vs-human agreement */}
      <Card style={{ marginBottom: 14 }}>
        <strong style={{ fontSize: '0.9rem' }}>AI-vs-faculty agreement</strong>
        {!agreement ? <Loading /> : agreement.total === 0 ? (
          <p className="muted" style={{ fontSize: '0.8rem', marginTop: 6 }}>No reviewed descriptive scores yet.</p>
        ) : (
          <div style={{ marginTop: 8 }}>
            <div className="row wrap" style={{ gap: 16, marginBottom: 10 }}>
              <span className="tag ok" style={{ fontSize: '0.74rem' }}>Accepted unchanged: <strong>{agreement.acceptedPct}%</strong></span>
              <span className="tag warn" style={{ fontSize: '0.74rem' }}>Adjusted by faculty: <strong>{agreement.adjustedPct}%</strong></span>
              {agreement.avgAdjustMagnitude != null && <span className="tag" style={{ fontSize: '0.74rem' }}>Avg adjustment: <strong>{agreement.avgAdjustMagnitude} marks</strong></span>}
              <span className="muted" style={{ fontSize: '0.74rem' }}>across {agreement.total} scores</span>
            </div>
            <div className="muted" style={{ fontSize: '0.76rem', marginBottom: 4 }}>By Bloom level (where the AI is adjusted most):</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid var(--line,#ddd)' }}>
                <th style={{ padding: '4px 8px' }}>RBTL</th><th style={{ padding: '4px 8px' }}>Scores</th>
                <th style={{ padding: '4px 8px' }}>Accepted</th><th style={{ padding: '4px 8px' }}>Adjusted</th>
              </tr></thead>
              <tbody>
                {agreement.byRbtl.map((r) => (
                  <tr key={r.rbtl} style={{ borderBottom: '1px solid var(--line-soft,#eee)' }}>
                    <td style={{ padding: '4px 8px' }}>{r.rbtl}</td>
                    <td style={{ padding: '4px 8px' }}>{r.total}</td>
                    <td style={{ padding: '4px 8px' }}>{r.acceptedPct}%</td>
                    <td style={{ padding: '4px 8px', fontWeight: r.adjustedPct > 40 ? 700 : 400, color: r.adjustedPct > 40 ? '#d97706' : undefined }}>{r.adjustedPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: '0.72rem', marginTop: 8, marginBottom: 0 }}>{agreement.note}</p>
          </div>
        )}
      </Card>

      {/* #9 Bias monitoring */}
      <Card>
        <strong style={{ fontSize: '0.9rem' }}>Score distribution across cohorts</strong>
        {!bias ? <Loading /> : !bias.overall ? (
          <p className="muted" style={{ fontSize: '0.8rem', marginTop: 6 }}>{bias.note}</p>
        ) : (
          <div style={{ marginTop: 8 }}>
            <div className="muted" style={{ fontSize: '0.78rem', marginBottom: 8 }}>
              Overall mean: <strong>{bias.overall.meanPct}%</strong> (± {bias.overall.stdev}, n={bias.overall.students})
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid var(--line,#ddd)' }}>
                <th style={{ padding: '4px 8px' }}>Cohort</th><th style={{ padding: '4px 8px' }}>Students</th>
                <th style={{ padding: '4px 8px' }}>Mean %</th><th style={{ padding: '4px 8px' }}>vs overall</th><th style={{ padding: '4px 8px' }}></th>
              </tr></thead>
              <tbody>
                {bias.groups.map((g) => (
                  <tr key={g.cohort} style={{ borderBottom: '1px solid var(--line-soft,#eee)', background: g.flagged ? 'rgba(217,119,6,0.07)' : undefined }}>
                    <td style={{ padding: '4px 8px' }}>{g.cohort}</td>
                    <td style={{ padding: '4px 8px' }}>{g.count}</td>
                    <td style={{ padding: '4px 8px' }}>{g.meanPct}%</td>
                    <td style={{ padding: '4px 8px', color: g.deltaFromOverall < 0 ? 'var(--bad,#dc2626)' : 'var(--ok,#1f9d55)' }}>
                      {g.deltaFromOverall > 0 ? '+' : ''}{g.deltaFromOverall}
                    </td>
                    <td style={{ padding: '4px 8px' }}>{g.flagged && <span className="tag warn" style={{ fontSize: '0.66rem' }}>review</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Banner kind="info" style={{ marginTop: 10 }}>{bias.note}</Banner>
          </div>
        )}
      </Card>
    </Layout>
  );
}

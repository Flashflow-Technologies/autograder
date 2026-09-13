import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client.js';
import { Layout, Card, PageHead, Loading, Banner } from '../../components/ui.jsx';

export default function StudentHome() {
  const [exams, setExams] = useState(null);

  useEffect(() => {
    api.get('/exams', { params: { status: 'scheduled' } }).then((r) => setExams(r.data.data)).catch(() => setExams([]));
  }, []);

  if (!exams) return <Layout><Loading /></Layout>;

  return (
    <Layout>
      <PageHead title="My exams" sub="Access exams during their scheduled window; view results once published."
/>
      <div className="col">
        {exams.map((ex) => <ExamCard key={ex._id} ex={ex} />)}
        {exams.length === 0 && <p className="muted">No scheduled exams.</p>}
      </div>
    </Layout>
  );
}

function ExamCard({ ex }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null); // { status, reAccess, reAccessNote }
  const [reason, setReason] = useState('');
  const [asking, setAsking] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const load = () => api.get(`/submissions/${ex._id}/my-status`).then((r) => setStatus(r.data.data)).catch(() => setStatus({ status: 'not_started' }));
  useEffect(() => { load(); }, [ex._id]);

  const now = new Date();
  const start = new Date(ex.startTime);
  const end = new Date(start.getTime() + ex.durationMins * 60000);
  const open = now >= start && now < end;
  const before = now < start;

  const submitted = status && (status.status === 'submitted' || status.status === 'scored');
  const reAccess = status?.reAccess || 'none';
  // Trust the server's computed flags (handles the single-use grant correctly).
  const canResume = !!status?.canResume;
  const canRequest = !!status?.canRequest;

  const requestReAccess = async () => {
    setErr(null); setMsg(null);
    try {
      await api.post(`/submissions/${ex._id}/request-reaccess`, { reason });
      setMsg('Re-access request sent. Your faculty will review it.');
      setAsking(false); setReason(''); load();
    } catch (e) { setErr(e.details?.join('; ') || e.message); }
  };

  return (
    <Card>
      {msg && <Banner kind="success">{msg}</Banner>}
      {err && <Banner kind="error">{err}</Banner>}
      <div className="spread wrap" style={{ gap: 10 }}>
        <div>
          <div className="row" style={{ gap: 8 }}>
            <strong>{ex.title}</strong><span className="tag">{ex.examType}</span>
            {open ? <span className="tag ok">open now</span> : before ? <span className="tag warn">upcoming</span> : <span className="tag bad">closed</span>}
            {submitted && <span className="tag">submitted</span>}
            {reAccess === 'requested' && <span className="tag warn">re-access pending</span>}
            {canResume && <span className="tag ok">re-access approved</span>}
            {reAccess === 'rejected' && <span className="tag bad">re-access rejected</span>}
          </div>
          <div className="muted" style={{ fontSize: '0.83rem', marginTop: 3 }}>
            {ex.subjectCode} · {start.toLocaleString()} · {ex.durationMins}m · {ex.maxMarks} marks
          </div>
          {reAccess === 'rejected' && status?.reAccessNote && (
            <div className="muted" style={{ fontSize: '0.78rem', marginTop: 4 }}>Faculty note: {status.reAccessNote}</div>
          )}
        </div>
        <div className="row" style={{ gap: 8 }}>
          {/* Not yet submitted: normal entry while open */}
          {!submitted && (
            <button className={open ? 'accent sm' : 'sm'} disabled={!open} onClick={() => navigate(`/student/exam/${ex._id}`)}>
              {open ? (status?.status === 'in_progress' ? 'Resume exam' : 'Start exam') : before ? 'Not yet open' : 'Closed'}
            </button>
          )}
          {/* Submitted + approved re-access + window open: resume */}
          {canResume && open && (
            <button className="accent sm" onClick={() => navigate(`/student/exam/${ex._id}`)}>Reopen exam</button>
          )}
          {/* Submitted, no usable/pending grant: offer to request (while open) */}
          {canRequest && open && (
            <button className="sm" onClick={() => setAsking((v) => !v)}>Request re-access</button>
          )}
          {/* Submitted but window closed: re-access can't help */}
          {submitted && !canResume && open === false && now >= end && (
            <span className="muted" style={{ fontSize: '0.75rem', alignSelf: 'center' }}>window closed</span>
          )}
          <button className="sm" onClick={() => navigate(`/student/result/${ex._id}`)}>Result</button>
        </div>
      </div>

      {asking && (
        <div className="row wrap" style={{ gap: 8, alignItems: 'flex-end', marginTop: 10 }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label>Reason for re-access (required)</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. submitted by mistake / technical issue" />
          </div>
          <button className="primary sm" disabled={!reason} onClick={requestReAccess}>Send request</button>
          <button className="sm" onClick={() => setAsking(false)}>Cancel</button>
        </div>
      )}
    </Card>
  );
}

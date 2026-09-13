import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/client.js';
import { Layout, Card, PageHead, Banner, Loading, Tags } from '../../components/ui.jsx';

export default function ReviewQueue() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [students, setStudents] = useState(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [detail, setDetail] = useState(null);
  const [evaluating, setEvaluating] = useState([]);
  const [counts, setCounts] = useState(null);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const loadStudents = () => api.get(`/review/${examId}/students`).then((r) => {
    // Endpoint now returns { students, evaluating, counts }.
    const d = r.data.data;
    setStudents(d.students || []);
    setEvaluating(d.evaluating || []);
    setCounts(d.counts || null);
  }).catch((e) => setErr(e.message));
  useEffect(() => { loadStudents(); }, [examId]);

  // While submissions are still being evaluated in the background (e.g. Judge0
  // running programming tests), poll periodically so they appear as they finish
  // — instead of leaving faculty staring at an unchanging screen.
  useEffect(() => {
    if (!evaluating || evaluating.length === 0) return undefined;
    const t = setInterval(loadStudents, 5000);
    return () => clearInterval(t);
  }, [evaluating, examId]);

  // Load the active student's detail whenever selection changes
  useEffect(() => {
    if (!students || students.length === 0) return;
    const s = students[activeIdx];
    if (!s) return;
    setDetail(null);
    api.get(`/review/student/${s.scoreId}`).then((r) => setDetail(r.data.data)).catch((e) => setErr(e.message));
  }, [students, activeIdx]);

  const reloadDetail = () => {
    const s = students[activeIdx];
    api.get(`/review/student/${s.scoreId}`).then((r) => setDetail(r.data.data)).catch((e) => setErr(e.message));
    loadStudents();
  };

  const act = async (item, action, newScore, reason) => {
    setErr(null); setMsg(null);
    try {
      await api.post(`/review/${detail.scoreId}/subscore`, {
        questionNo: item.questionNo, subLabel: item.subLabel, action,
        newScore: newScore != null ? Number(newScore) : undefined, reason,
      });
      // mark student in-progress on first action
      if (detail.reviewState === 'not_started') {
        await api.post(`/review/student/${detail.scoreId}/state`, { reviewState: 'in_progress' });
      }
      setMsg(`Q${item.questionNo}${item.subLabel}: ${action} saved.`);
      reloadDetail();
    } catch (e) { setErr(e.details?.join('; ') || e.message); }
  };

  // Switch which OR side counts toward the total (faculty override).
  const selectOrSide = async (item, reason) => {
    setErr(null); setMsg(null);
    try {
      await api.post(`/review/${detail.scoreId}/or-select`, {
        groupIndex: item.groupIndex, selectedQuestionNo: item.questionNo, reason,
      });
      setMsg(`Q${item.questionNo} is now the counted answer for its OR group.`);
      reloadDetail();
    } catch (e) { setErr(e.details?.join('; ') || e.message); }
  };

  const saveState = async (state) => {
    setErr(null); setMsg(null);
    try {
      await api.post(`/review/student/${detail.scoreId}/state`, { reviewState: state });
      setMsg(state === 'completed' ? 'Marked this student as reviewed.' : 'Progress saved.');
      loadStudents();
    } catch (e) { setErr(e.message); }
  };

  const publish = async () => {
    setErr(null); setMsg(null);
    try { await api.post(`/review/${examId}/publish`); setMsg('Results published to students.'); loadStudents(); }
    catch (e) { setErr(e.details?.join('; ') || e.message); }
  };

  // Fetch a CSV as a blob (auth header required) and trigger a browser download
  const downloadCsv = async (url, fallbackName) => {
    setErr(null);
    try {
      const res = await api.get(url, { responseType: 'blob' });
      const disposition = res.headers['content-disposition'] || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : fallbackName;
      const objUrl = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = objUrl; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(objUrl);
    } catch (e) { setErr(e.message || 'Download failed'); }
  };
  const downloadReport = () => downloadCsv(`/review/${examId}/export`, 'scores.csv');
  const downloadAudit = () => downloadCsv(`/audit/export?examId=${examId}`, 'audit_trail.csv');

  if (!students) return <Layout><Loading /></Layout>;
  if (students.length === 0) return (
    <Layout>
      <PageHead title="Review" action={<button onClick={() => navigate('/faculty')}>← Exams</button>} />
      {evaluating.length > 0
        ? <EvaluationProgress counts={counts} evaluating={evaluating} />
        : <Banner kind="warn">No submissions to review yet.</Banner>}
    </Layout>
  );

  const active = students[activeIdx];

  return (
    <Layout>
      <PageHead title="Review submissions" sub="One student per page. Approve or modify each AI score, then save and continue."
        action={<div className="row" style={{ gap: 8 }}>
          <button onClick={() => navigate('/faculty')}>← Exams</button>
          <button onClick={downloadReport}>Download report (CSV)</button>
          <button onClick={downloadAudit}>Audit trail (CSV)</button>
          <button className="accent" onClick={publish}>Publish results</button>
        </div>} />
      <Banner kind="info">{msg}</Banner>
      <Banner kind="err">{err}</Banner>

      {evaluating.length > 0 && <EvaluationProgress counts={counts} evaluating={evaluating} />}

      <ReAccessPanel examId={examId} onChange={() => setMsg('Re-access decision saved.')} />
      <AppealsPanel examId={examId} onChange={() => { setMsg('Appeal resolved.'); reloadDetail(); }} />

      <div style={{ display: 'grid', gridTemplateColumns: '230px 1fr', gap: 18, alignItems: 'start' }}>
        {/* Student list sidebar */}
        <Card style={{ padding: 0, position: 'sticky', top: 16 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', fontWeight: 600, fontSize: '0.85rem' }}>
            Students ({students.length})
          </div>
          <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {students.map((s, i) => (
              <div key={s.scoreId} onClick={() => setActiveIdx(i)}
                style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--line-soft)',
                  background: i === activeIdx ? 'var(--accent-soft)' : 'transparent' }}>
                <div className="spread">
                  <strong style={{ fontSize: '0.85rem' }}>{s.rollNo || s.name}</strong>
                  <StatusDot state={s.reviewState} pending={s.pendingCount} />
                </div>
                <div className="muted" style={{ fontSize: '0.72rem', marginTop: 2 }}>{s.name}</div>
                {s.coWise?.length > 0 && (
                  <div className="row wrap" style={{ gap: 4, marginTop: 6 }}>
                    {s.coWise.map((c) => (
                      <span key={c.co} className="tag co" style={{ fontSize: '0.65rem' }}>
                        {c.co}: {c.scored}/{c.max}
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: '0.78rem', marginTop: 6, fontWeight: 600 }}>
                  Total: {s.totalScoreCeiled}
                  {s.totalScoreCeiled !== s.totalScore && (
                    <span className="muted" style={{ fontWeight: 400 }}> (raw {s.totalScore})</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Active student detail */}
        <div>
          {!detail ? <Loading label="Loading student…" /> : (
            <>
              <div className="spread wrap" style={{ marginBottom: 14, gap: 10 }}>
                <div>
                  <h2 style={{ marginBottom: 2 }}>{detail.student.rollNo || detail.student.name}</h2>
                  <span className="muted">{detail.student.name} · total {Math.ceil(detail.totalScore)} marks · {labelState(detail.reviewState)}</span>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button disabled={activeIdx === 0} onClick={() => setActiveIdx((i) => Math.max(0, i - 1))}>← Prev</button>
                  <button disabled={activeIdx === students.length - 1} onClick={() => setActiveIdx((i) => Math.min(students.length - 1, i + 1))}>Next →</button>
                </div>
              </div>

              <div className="col">
                {detail.items.map((it, i) => (
                  <AnswerCard key={i} item={it} onAct={act} onSelectOr={selectOrSide} />
                ))}
              </div>

              <Card style={{ marginTop: 16 }}>
                <div className="spread wrap" style={{ gap: 10 }}>
                  <span className="muted" style={{ fontSize: '0.85rem' }}>
                    Save your progress and move on, or mark this student fully reviewed.
                  </span>
                  <div className="row" style={{ gap: 8 }}>
                    <button onClick={() => saveState('in_progress')}>Save & continue later</button>
                    <button className="primary" onClick={() => { saveState('completed'); if (activeIdx < students.length - 1) setActiveIdx(activeIdx + 1); }}>
                      Mark reviewed & next →
                    </button>
                  </div>
                </div>
              </Card>

              {detail.published && detail.publishedByName && (
                <div className="banner ok" style={{ marginTop: 12 }}>
                  Results published by <strong>{detail.publishedByName}</strong>
                  {detail.publishedAt ? ` on ${new Date(detail.publishedAt).toLocaleString()}` : ''}.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}

function StatusDot({ state, pending }) {
  if (state === 'completed') return <span className="tag ok" style={{ fontSize: '0.65rem' }}>done</span>;
  if (pending > 0) return <span className="tag bad" style={{ fontSize: '0.65rem' }}>{pending} pending</span>;
  if (state === 'in_progress') return <span className="tag warn" style={{ fontSize: '0.65rem' }}>in progress</span>;
  return <span className="tag" style={{ fontSize: '0.65rem' }}>new</span>;
}

function labelState(s) {
  return { not_started: 'not started', in_progress: 'in progress', completed: 'reviewed' }[s] || s;
}

function AnswerCard({ item, onAct, onSelectOr }) {
  const [mode, setMode] = useState(null); // 'adjust' | null
  const [newScore, setNewScore] = useState(item.finalScore);
  const [reason, setReason] = useState('');
  const [orReason, setOrReason] = useState('');
  const [orMode, setOrMode] = useState(false);

  const statusTag = {
    approved: <span className="tag ok">approved</span>,
    adjusted: <span className="tag warn">adjusted</span>,
    flagged: <span className="tag bad">flagged</span>,
    pending: <span className="tag bad">pending review</span>,
    auto: <span className="tag">auto-scored</span>,
  }[item.reviewStatus];

  // The non-counted OR side is visually de-emphasised, but its scoring controls
  // remain available so faculty can adjust/approve either side and switch which
  // one counts (e.g. after lowering the auto-selected side below the other).
  const notCounted = item.isOrGroup && !item.isSelectedOrSide;

  return (
    <Card style={{ opacity: notCounted ? 0.75 : 1, borderColor: notCounted ? 'var(--line-soft)' : undefined }}>
      <div className="spread wrap" style={{ gap: 8, marginBottom: 8 }}>
        <div className="row" style={{ gap: 8 }}>
          <strong>Q{item.questionNo}{item.subLabel}</strong>
          <Tags co={item.co} rbtl={item.rbtl} marks={item.maxMarks} />
          {item.isOrGroup && (item.isSelectedOrSide
            ? <span className="tag ok">OR — counted</span>
            : <span className="tag">OR — not counted</span>)}
          {['L5', 'L6'].includes(item.rbtl) && <span className="tag bad">mandatory review</span>}
          {item.reviewReason === 'borderline' && <span className="tag" style={{ background: '#fff3cd', color: '#856404' }} title="Score is near the pass mark — a small error would flip pass/fail, so a human decides.">borderline</span>}
          {item.reviewReason === 'low_confidence' && <span className="tag" style={{ background: '#f8d7da', color: '#721c24' }} title="The grader's confidence was below threshold.">low confidence</span>}
        </div>
        {statusTag}
      </div>
      {item.reviewedByName && (
        <div className="muted" style={{ fontSize: '0.72rem', marginTop: -2, marginBottom: 6 }}>
          Reviewed by {item.reviewedByName}{item.reviewedAt ? ` · ${new Date(item.reviewedAt).toLocaleString()}` : ''}
        </div>
      )}

      {item.questionText && <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', marginBottom: 8 }}>{item.questionText}</p>}

      <div className="grid-2" style={{ gap: 14, alignItems: 'start' }}>
        {/* Student answer */}
        <div>
          <label>Student answer {item.programming && <span className="tag" style={{ marginLeft: 6 }}>{item.programming.language}</span>}{item.inputMode === 'scanned' && <span className="tag" style={{ marginLeft: 6 }}>scanned · OCR</span>}</label>
          <div style={{ background: 'var(--paper)', border: '1px solid var(--line-soft)', borderRadius: 4, padding: 10, fontSize: item.programming ? '0.8rem' : '0.86rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', minHeight: 80, fontFamily: item.programming ? 'monospace' : 'inherit', overflowX: 'auto' }}>
            {item.answerText}
          </div>
          {item.inputMode === 'scanned' && item.scanFileId && (
            <ScanImage fileId={item.scanFileId} />
          )}
        </div>

        {/* AI scoring + justification */}
        <div>
          <label>AI score & justification</label>
          <div style={{ background: 'var(--paper)', border: '1px solid var(--line-soft)', borderRadius: 4, padding: 10 }}>
            <div className="spread" style={{ marginBottom: 6 }}>
              <span className="row" style={{ gap: 6 }}>
                <strong style={{ fontSize: '1.1rem' }}>{item.finalScore}</strong>
                <span className="muted">/ {item.maxMarks}</span>
                {item.finalScore !== item.aiScore && <span className="muted" style={{ fontSize: '0.75rem' }}>(AI: {item.aiScore})</span>}
              </span>
              <span className="muted" style={{ fontSize: '0.75rem' }}>confidence {Number(item.confidence).toFixed(2)}</span>
            </div>
            {item.components && (
              <div className="row wrap" style={{ gap: 10, fontSize: '0.76rem', marginBottom: 6 }}>
                {Object.entries(item.components).map(([k, v]) => (
                  <span key={k} className="muted" style={{ textTransform: 'capitalize' }}>{k}: <strong>{Number(v).toFixed(2)}</strong></span>
                ))}
              </div>
            )}
            {item.aiFeedback && <p style={{ fontSize: '0.82rem', lineHeight: 1.55 }}>{item.aiFeedback}</p>}
            {item.programming && <ProgrammingResult prog={item.programming} maxMarks={item.maxMarks} />}
            <div style={{ marginTop: 6 }}>
              {item.foundKeywords?.map((k) => <span key={k} className="tag ok" style={{ marginRight: 4, fontSize: '0.68rem' }}>{k}</span>)}
              {item.missingKeywords?.map((k) => <span key={k} className="tag bad" style={{ marginRight: 4, fontSize: '0.68rem' }}>{k}</span>)}
            </div>
          </div>
        </div>
      </div>

      {/* Actions — available on BOTH OR sides so either can be scored/approved */}
      <div style={{ marginTop: 10 }}>
        {mode !== 'adjust' ? (
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="sm" onClick={() => onAct(item, 'accept')}>Approve AI score</button>
            <button className="sm" onClick={() => { setMode('adjust'); setNewScore(item.finalScore); }}>Modify score</button>
            <button className="ghost sm" onClick={() => onAct(item, 'flag')}>Flag</button>
            {notCounted && !orMode && (
              <button className="accent sm" onClick={() => setOrMode(true)}>Make this the counted answer</button>
            )}
          </div>
        ) : (
          <div className="row wrap" style={{ gap: 8, alignItems: 'flex-end' }}>
            <div style={{ width: 90 }}>
              <label>New score</label>
              <input type="number" min="0" max={item.maxMarks} step="0.5" value={newScore} onChange={(e) => setNewScore(e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label>Justification (required)</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you changing the score?" />
            </div>
            <button className="primary sm" disabled={!reason} onClick={() => { onAct(item, 'adjust', newScore, reason); setMode(null); setReason(''); }}>Save</button>
            <button className="sm" onClick={() => setMode(null)}>Cancel</button>
          </div>
        )}

        {orMode && (
          <div className="row wrap" style={{ gap: 8, alignItems: 'flex-end', marginTop: 8 }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label>Reason for switching the counted OR answer (required)</label>
              <input value={orReason} onChange={(e) => setOrReason(e.target.value)} placeholder="e.g. this attempt is stronger / scored higher after review" />
            </div>
            <button className="primary sm" disabled={!orReason} onClick={() => { onSelectOr(item, orReason); setOrMode(false); setOrReason(''); }}>Confirm</button>
            <button className="sm" onClick={() => { setOrMode(false); setOrReason(''); }}>Cancel</button>
          </div>
        )}
      </div>
    </Card>
  );
}

// Fetches a protected scan image as a blob (JWT required) and renders it.
// Plain <img src> can't send the auth header, so we fetch and use an object URL.
function ScanImage({ fileId }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let objUrl;
    let cancelled = false;
    api.get(`/review/scan/${fileId}`, { responseType: 'blob' })
      .then((r) => {
        if (cancelled) return;
        objUrl = window.URL.createObjectURL(new Blob([r.data]));
        setUrl(objUrl);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; if (objUrl) window.URL.revokeObjectURL(objUrl); };
  }, [fileId]);

  if (failed) return <p className="muted" style={{ fontSize: '0.72rem', marginTop: 6 }}>Scan image could not be loaded.</p>;
  if (!url) return <p className="muted" style={{ fontSize: '0.72rem', marginTop: 6 }}>Loading scan…</p>;

  return (
    <div style={{ marginTop: 8 }}>
      <label style={{ fontSize: '0.72rem' }}>Original scan (tap to enlarge)</label>
      <img src={url} alt="Scanned answer" onClick={() => setOpen((o) => !o)}
        style={{ display: 'block', maxWidth: '100%', maxHeight: open ? 'none' : 180, border: '1px solid var(--line-soft)', borderRadius: 4, cursor: 'zoom-in', objectFit: 'contain' }} />
    </div>
  );
}

// Faculty panel: list and decide student re-access requests for this exam.
function ReAccessPanel({ examId, onChange }) {
  const [reqs, setReqs] = useState([]);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState({});

  const load = () => api.get(`/reaccess/${examId}`).then((r) => setReqs(r.data.data)).catch(() => setReqs([]));
  useEffect(() => { load(); }, [examId]);

  const pending = reqs.filter((r) => r.reAccess.status === 'requested');
  if (!reqs.length) return null;

  const decide = async (submissionId, decision) => {
    try {
      await api.post(`/reaccess/decide/${submissionId}`, { decision, note: note[submissionId] || '' });
      load(); onChange && onChange();
    } catch (e) { alert(e.details?.join('; ') || e.message); }
  };

  return (
    <Card style={{ marginBottom: 14, borderColor: pending.length ? 'var(--warn)' : undefined }}>
      <div className="spread" style={{ cursor: 'pointer' }} onClick={() => setOpen((v) => !v)}>
        <strong style={{ fontSize: '0.9rem' }}>
          Re-access requests {pending.length > 0 && <span className="tag warn" style={{ marginLeft: 6 }}>{pending.length} pending</span>}
        </strong>
        <button className="sm">{open ? 'Hide' : 'Show'}</button>
      </div>
      {open && (
        <div className="col" style={{ gap: 8, marginTop: 10 }}>
          {reqs.map((r) => (
            <div key={r.submissionId} className="row wrap" style={{ gap: 8, alignItems: 'center', borderBottom: '1px solid var(--line-soft)', paddingBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <strong style={{ fontSize: '0.85rem' }}>{r.student?.name || 'Student'}</strong>
                {r.student?.rollNo && <span className="muted" style={{ fontSize: '0.75rem' }}> · {r.student.rollNo}</span>}
                <div className="muted" style={{ fontSize: '0.78rem' }}>Reason: {r.reAccess.reason || '—'}</div>
                <span className={`tag ${r.reAccess.status === 'requested' ? 'warn' : r.reAccess.status === 'approved' ? 'ok' : 'bad'}`} style={{ fontSize: '0.68rem' }}>
                  {r.reAccess.status}{r.reAccess.used ? ' · used' : ''}
                </span>
              </div>
              {r.reAccess.status === 'requested' && (
                <div className="row wrap" style={{ gap: 6, alignItems: 'center' }}>
                  <input placeholder="note (optional)" value={note[r.submissionId] || ''} onChange={(e) => setNote({ ...note, [r.submissionId]: e.target.value })} style={{ width: 160 }} />
                  <button className="accent sm" onClick={() => decide(r.submissionId, 'approve')}>Approve</button>
                  <button className="ghost sm" onClick={() => decide(r.submissionId, 'reject')}>Reject</button>
                </div>
              )}
            </div>
          ))}
          <span className="muted" style={{ fontSize: '0.72rem' }}>
            Approving lets the student resume their existing answers — but only while the exam window is still open.
          </span>
        </div>
      )}
    </Card>
  );
}

// Faculty panel: view and resolve student appeals for this exam.
function AppealsPanel({ examId, onChange }) {
  const [appeals, setAppeals] = useState([]);
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(null); // appeal id being resolved
  const [form, setForm] = useState({}); // id -> { revisedScore, reason }

  const load = () => api.get('/appeals', { params: { examId } }).then((r) => setAppeals(r.data.data)).catch(() => setAppeals([]));
  useEffect(() => { load(); }, [examId]);

  const pending = appeals.filter((a) => a.status !== 'resolved');
  if (!appeals.length) return null;

  const setF = (id, field, val) => setForm((f) => ({ ...f, [id]: { ...f[id], [field]: val } }));

  const resolve = async (a, outcome) => {
    const f = form[a.id] || {};
    if (!f.reason) { alert('A reason is required to resolve an appeal.'); return; }
    if (outcome === 'revised' && (f.revisedScore === undefined || f.revisedScore === '')) {
      alert('Enter the revised score for a revised outcome.'); return;
    }
    setWorking(a.id);
    try {
      await api.post(`/results/appeal/${a.id}/resolve`, {
        outcome,
        revisedScore: outcome === 'revised' ? Number(f.revisedScore) : undefined,
        reason: f.reason,
      });
      load(); onChange && onChange();
    } catch (e) { alert(e.details?.join('; ') || e.message); }
    finally { setWorking(null); }
  };

  return (
    <Card style={{ marginBottom: 14, borderColor: pending.length ? 'var(--warn)' : undefined }}>
      <div className="spread" style={{ cursor: 'pointer' }} onClick={() => setOpen((v) => !v)}>
        <strong style={{ fontSize: '0.9rem' }}>
          Student appeals {pending.length > 0 && <span className="tag warn" style={{ marginLeft: 6 }}>{pending.length} open</span>}
        </strong>
        <button className="sm">{open ? 'Hide' : 'Show'}</button>
      </div>
      {open && (
        <div className="col" style={{ gap: 10, marginTop: 10 }}>
          {appeals.map((a) => (
            <div key={a.id} style={{ borderBottom: '1px solid var(--line-soft)', paddingBottom: 10 }}>
              <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
                <strong style={{ fontSize: '0.85rem' }}>{a.student?.name || 'Student'}</strong>
                {a.student?.rollNo && <span className="muted" style={{ fontSize: '0.75rem' }}>{a.student.rollNo}</span>}
                <span className="tag" style={{ fontSize: '0.7rem' }}>Q{a.questionNo}{a.subLabel}</span>
                <span className={`tag ${a.status === 'resolved' ? 'ok' : 'warn'}`} style={{ fontSize: '0.7rem' }}>
                  {a.status}{a.outcome ? ` · ${a.outcome}` : ''}{a.revisedScore != null ? ` · ${a.revisedScore}` : ''}
                </span>
              </div>
              <div className="muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
                <strong>Grounds:</strong> {a.grounds}<br />
                <strong>Explanation:</strong> {a.explanation}
              </div>
              {a.status !== 'resolved' && (
                <div className="row wrap" style={{ gap: 6, alignItems: 'flex-end', marginTop: 8 }}>
                  <div style={{ width: 110 }}>
                    <label style={{ fontSize: '0.72rem' }}>Revised score</label>
                    <input type="number" min="0" step="0.5" placeholder="if revising"
                      value={form[a.id]?.revisedScore ?? ''} onChange={(e) => setF(a.id, 'revisedScore', e.target.value)} />
                  </div>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <label style={{ fontSize: '0.72rem' }}>Reason (required)</label>
                    <input value={form[a.id]?.reason ?? ''} onChange={(e) => setF(a.id, 'reason', e.target.value)} placeholder="Decision rationale" />
                  </div>
                  <button className="accent sm" disabled={working === a.id} onClick={() => resolve(a, 'revised')}>Revise score</button>
                  <button className="sm" disabled={working === a.id} onClick={() => resolve(a, 'upheld')}>Uphold original</button>
                </div>
              )}
            </div>
          ))}
          <span className="muted" style={{ fontSize: '0.72rem' }}>
            "Revise score" updates the student's mark and recomputes attainment; "Uphold original" keeps the existing score. The student is notified of the outcome.
          </span>
        </div>
      )}
    </Card>
  );
}

// Renders the execution + quality breakdown for a programming answer.
function ProgrammingResult({ prog, maxMarks }) {
  const tests = prog.testResults || [];
  const passed = tests.filter((t) => t.passed).length;
  const statusLabel = (id) => ({
    3: 'passed', 4: 'wrong output', 5: 'time limit', 6: 'compile error',
    '-1': 'judge timeout', '-2': 'run error',
  }[id] || `status ${id}`);

  return (
    <div style={{ marginTop: 8, borderTop: '1px solid var(--line-soft)', paddingTop: 8 }}>
      <div className="row wrap" style={{ gap: 8, marginBottom: 6, fontSize: '0.76rem' }}>
        <span className={`tag ${prog.compiled ? 'ok' : 'bad'}`} style={{ fontSize: '0.68rem' }}>
          {prog.compiled ? 'compiled' : 'did not compile'}
        </span>
        <span className="muted">Tests: <strong>{passed}/{tests.length}</strong> passed</span>
        <span className="muted">Correctness <strong>{Math.round((prog.correctnessFrac || 0) * 100)}%</strong></span>
        <span className="muted">Complexity <strong>{prog.complexity}</strong></span>
        <span className="muted">Style issues <strong>{prog.styleViolations}</strong></span>
      </div>
      <div className="row wrap" style={{ gap: 4 }}>
        {tests.map((t, i) => (
          <span key={i} className={`tag ${t.passed ? 'ok' : 'bad'}`} style={{ fontSize: '0.66rem' }}
            title={t.hidden ? 'hidden test' : (t.stderr || statusLabel(t.statusId))}>
            T{t.index + 1}{t.hidden ? '·H' : ''}: {t.passed ? '✓' : '✗'}
          </span>
        ))}
      </div>
      {tests.some((t) => t.statusId === 6 && t.compileOutput) && (
        <pre style={{ fontSize: '0.72rem', color: 'var(--bad, #c0392b)', whiteSpace: 'pre-wrap', marginTop: 6, maxHeight: 120, overflow: 'auto' }}>
          {tests.find((t) => t.compileOutput)?.compileOutput}
        </pre>
      )}
      <p className="muted" style={{ fontSize: '0.68rem', marginTop: 4 }}>
        Hidden tests (·H) are not shown to students. Style/complexity are automated indicators — adjust the score if your judgement differs.
      </p>
    </div>
  );
}

// Shows live evaluation progress while the background worker scores submissions
// (programming questions run through Judge0 and take longer). The parent polls
// every few seconds, so this updates on its own until everything is scored.
function EvaluationProgress({ counts, evaluating }) {
  const total = counts?.total || ((counts?.scored || 0) + (evaluating?.length || 0));
  const scored = counts?.scored || 0;
  const pct = total > 0 ? Math.round((scored / total) * 100) : 0;
  return (
    <Card style={{ marginBottom: 14, borderLeft: '4px solid var(--accent, #2e5faa)' }}>
      <div className="spread wrap" style={{ gap: 10, alignItems: 'center', marginBottom: 8 }}>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <span className="spinner" aria-hidden="true" />
          <strong style={{ fontSize: '0.9rem' }}>Evaluating submissions…</strong>
          <span className="muted" style={{ fontSize: '0.8rem' }}>{scored} of {total} scored</span>
        </div>
        <span className="muted" style={{ fontSize: '0.74rem' }}>auto-refreshing every few seconds</span>
      </div>
      <div style={{ height: 10, background: 'var(--line-soft, #e5e9ef)', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent, #2e5faa)', transition: 'width 0.4s ease' }} />
      </div>
      <p className="muted" style={{ fontSize: '0.74rem', marginTop: 8, marginBottom: evaluating.length ? 6 : 0 }}>
        Programming answers are compiled and run against their test cases in the background, which takes longer than text answers. Submissions appear here automatically as each finishes.
      </p>
      {evaluating.length > 0 && (
        <div className="row wrap" style={{ gap: 6 }}>
          {evaluating.slice(0, 12).map((e) => (
            <span key={e.submissionId} className="tag" style={{ fontSize: '0.68rem' }}>
              {e.rollNo || e.name || 'student'} · scoring…
            </span>
          ))}
          {evaluating.length > 12 && <span className="muted" style={{ fontSize: '0.7rem' }}>+{evaluating.length - 12} more</span>}
        </div>
      )}
    </Card>
  );
}

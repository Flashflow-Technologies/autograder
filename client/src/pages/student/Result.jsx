import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/client.js';
import { Layout, Card, PageHead, Banner, Loading, Tags } from '../../components/ui.jsx';

export default function Result() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const [appealFor, setAppealFor] = useState(null);

  const load = () => api.get(`/results/${examId}/me`).then((r) => setResult(r.data.data)).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [examId]);

  if (err) return <Layout><PageHead title="Result" action={<button onClick={()=>navigate('/student')}>← Back</button>} /><Banner kind="warn">{err}</Banner></Layout>;
  if (!result) return <Layout><Loading /></Layout>;

  const max = result.subScores.reduce((s, x) => s + x.maxMarks, 0);
  // Marks are stored as whole numbers, so per-question parts already sum to the
  // total exactly — display the stored values directly.
  const totalScore = result.totalScore;
  const pct = max ? Math.round((totalScore / max) * 100) : 0;

  return (
    <Layout>
      <PageHead title="Your result" action={<button onClick={() => navigate('/student')}>← Back</button>} />
      <Card style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 20 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.4rem', fontWeight: 700 }}>{totalScore}<span className="muted" style={{ fontSize: '1.2rem' }}> / {max}</span></div>
            <div className="muted">Total score</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ height: 10, background: 'var(--line-soft)', borderRadius: 5, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: pct >= 60 ? 'var(--green)' : 'var(--amber)' }} />
            </div>
            <div className="muted" style={{ fontSize: '0.82rem', marginTop: 4 }}>{pct}%</div>
          </div>
        </div>
      </Card>

      <div className="col">
        {result.subScores.map((s, i) => (
          <Card key={i}>
            <div className="spread wrap" style={{ gap: 8 }}>
              <div className="row" style={{ gap: 8 }}>
                <strong>Q{s.questionNo}{s.subLabel}</strong><Tags co={s.co} rbtl={s.rbtl} />
                {s.adjusted && <span className="tag warn">faculty reviewed</span>}
                {s.transparency?.confidence?.pct != null && (
                  <span className={`tag ${({high:'ok',medium:'',low:'bad'})[s.transparency.confidence.level] || ''}`} style={{ fontSize: '0.68rem' }}
                    title="How confident the AI was in its draft score (faculty reviewed all scores).">
                    AI {s.transparency.confidence.label} ({s.transparency.confidence.pct}%)
                  </span>
                )}
              </div>
              <strong>{s.finalScore} / {s.maxMarks}</strong>
            </div>

            {/* #1 Score-contribution breakdown */}
            {s.transparency?.breakdown?.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div className="muted" style={{ fontSize: '0.76rem', marginBottom: 4 }}>How this answer was assessed:</div>
                {s.transparency.breakdown.map((b) => (
                  <div key={b.key} className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 3 }}>
                    <span style={{ fontSize: '0.76rem', minWidth: 200 }}>{b.label}</span>
                    <div style={{ flex: 1, height: 7, background: 'var(--line-soft,#e5e9ef)', borderRadius: 4, overflow: 'hidden', maxWidth: 220 }}>
                      <div style={{ width: `${b.value}%`, height: '100%', background: b.value >= 70 ? 'var(--ok,#1f9d55)' : b.value >= 40 ? '#d97706' : 'var(--bad,#dc2626)' }} />
                    </div>
                    <span style={{ fontSize: '0.74rem', minWidth: 34 }}>{b.value}%</span>
                  </div>
                ))}
              </div>
            )}

            {/* #2 Concept coverage */}
            {s.transparency?.coverage?.total > 0 && (
              <div style={{ marginTop: 10 }}>
                <span className="muted" style={{ fontSize: '0.78rem' }}>
                  Key concepts covered: <strong>{s.transparency.coverage.covered} of {s.transparency.coverage.total}</strong>
                </span>
                {s.transparency.coverage.found.length > 0 && (
                  <div style={{ marginTop: 4 }}>{s.transparency.coverage.found.map((k) => <span key={k} className="tag ok" style={{ marginRight: 4, fontSize: '0.68rem' }}>{k}</span>)}</div>
                )}
                {s.transparency.coverage.missing.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <span className="muted" style={{ fontSize: '0.72rem' }}>Missing: </span>
                    {s.transparency.coverage.missing.map((k) => <span key={k} className="tag bad" style={{ marginRight: 4, fontSize: '0.68rem' }}>{k}</span>)}
                  </div>
                )}
              </div>
            )}

            {/* #3 Natural-language feedback */}
            {s.transparency?.feedback && (s.transparency.feedback.strengths.length > 0 || s.transparency.feedback.weaknesses.length > 0 || s.transparency.feedback.suggestions.length > 0) && (
              <div style={{ marginTop: 10, fontSize: '0.78rem' }}>
                {s.transparency.feedback.strengths.length > 0 && (
                  <div style={{ marginBottom: 3 }}><strong style={{ color: 'var(--ok,#1f9d55)' }}>Strengths: </strong>{s.transparency.feedback.strengths.join(' ')}</div>
                )}
                {s.transparency.feedback.weaknesses.length > 0 && (
                  <div style={{ marginBottom: 3 }}><strong style={{ color: '#d97706' }}>To improve: </strong>{s.transparency.feedback.weaknesses.join(' ')}</div>
                )}
                {s.transparency.feedback.suggestions.length > 0 && (
                  <div><strong style={{ color: 'var(--accent,#2e5faa)' }}>Suggestions: </strong>{s.transparency.feedback.suggestions.join(' ')}</div>
                )}
              </div>
            )}

            {/* #4 Highlighted answer spans */}
            {s.spans?.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div className="muted" style={{ fontSize: '0.76rem', marginBottom: 4 }}>Your answer, by how well each part matched (green = strong, red = weak):</div>
                <div style={{ fontSize: '0.82rem', lineHeight: 1.7 }}>
                  {s.spans.map((sp, j) => (
                    <span key={j} title={`match: ${Math.round(sp.score * 100)}%`} style={{
                      background: sp.score >= 0.7 ? 'rgba(31,157,85,0.18)' : sp.score >= 0.4 ? 'rgba(217,119,6,0.16)' : 'rgba(220,38,38,0.14)',
                      padding: '1px 3px', borderRadius: 3, marginRight: 3,
                    }}>{sp.text}</span>
                  ))}
                </div>
              </div>
            )}

            {/* #8 Score-change provenance */}
            {s.provenance && (
              <div className="banner" style={{ marginTop: 10, marginBottom: 0, fontSize: '0.76rem', background: 'var(--bg-soft,#f8f9fb)', borderLeft: '3px solid var(--accent,#2e5faa)', padding: '8px 10px' }}>
                <strong>How your score was decided:</strong> AI suggested {s.provenance.aiDraft}, {s.provenance.changedBy} set it to {s.provenance.finalScore}
                {s.provenance.reason ? ` — ${s.provenance.reason}` : '.'}
              </div>
            )}

            {s.aiFeedback && !s.transparency && <div className="banner info" style={{ marginTop: 10, marginBottom: 0 }}>{s.aiFeedback}</div>}
            <button className="ghost sm" style={{ marginTop: 8 }} onClick={() => setAppealFor(s)}>Appeal this question</button>
          </Card>
        ))}
      </div>

      {result.publishedByName && (
        <div className="banner ok" style={{ marginTop: 16 }}>
          These results were reviewed and approved by <strong>{result.publishedByName}</strong>
          {result.publishedAt ? ` on ${new Date(result.publishedAt).toLocaleString()}` : ''}.
        </div>
      )}

      {appealFor && <AppealModal examId={examId} sub={appealFor} onClose={() => setAppealFor(null)} />}
    </Layout>
  );
}

function AppealModal({ examId, sub, onClose }) {
  const [grounds, setGrounds] = useState('');
  const [explanation, setExplanation] = useState('');
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const submit = async () => {
    setErr(null);
    try {
      const res = await api.post('/results/appeal', { examId, questionNo: sub.questionNo, subLabel: sub.subLabel, grounds, explanation });
      setMsg(`Appeal submitted. Reference: ${res.data.data.reference}`);
    } catch (e) { setErr(e.details?.join('; ') || e.message); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,26,23,0.45)', display: 'grid', placeItems: 'center', padding: 20, zIndex: 50 }} onClick={onClose}>
      <div className="card" style={{ padding: 22, maxWidth: 480, width: '100%' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 4 }}>Appeal Q{sub.questionNo}{sub.subLabel}</h3>
        <p className="muted" style={{ fontSize: '0.83rem', marginBottom: 14 }}>Re-evaluation requests are reviewed by faculty. The decision is final.</p>
        <Banner kind="info">{msg}</Banner>
        <Banner kind="err">{err}</Banner>
        {!msg && (
          <div className="col">
            <div>
              <label>Grounds</label>
              <select value={grounds} onChange={(e) => setGrounds(e.target.value)}>
                <option value="">— select —</option>
                <option>My answer is correct but uses different terminology</option>
                <option>My answer includes additional valid points</option>
                <option>Scoring does not reflect the depth of my analysis</option>
                <option>OCR may have misread my handwritten answer</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label>Explanation (min 20 chars)</label>
              <textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="Explain why the score should be revised…" />
            </div>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={onClose}>Cancel</button>
              <button className="primary" disabled={!grounds || explanation.length < 20} onClick={submit}>Submit appeal</button>
            </div>
          </div>
        )}
        {msg && <div className="row" style={{ justifyContent: 'flex-end' }}><button className="primary" onClick={onClose}>Done</button></div>}
      </div>
    </div>
  );
}

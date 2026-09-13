import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/client.js';
import { Layout, Card, PageHead, Banner, Loading, Tags } from '../../components/ui.jsx';
import AuthImage from '../../components/AuthImage.jsx';

export default function TakeExam() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [answers, setAnswers] = useState({}); // key -> { rawText }
  const [remaining, setRemaining] = useState(0);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    api.get(`/submissions/${examId}/paper`)
      .then((r) => {
        const d = r.data.data;
        setData(d); setRemaining(d.remainingSeconds);
        // Resume: rebuild the answers map from any previously-saved answers.
        if (Array.isArray(d.savedAnswers) && d.savedAnswers.length) {
          const restored = {};
          for (const a of d.savedAnswers) {
            const k = `${a.groupIndex}-${a.questionNo}-${a.subLabel}`;
            restored[k] = {
              groupIndex: a.groupIndex, questionNo: a.questionNo, subLabel: a.subLabel,
              inputMode: a.inputMode || 'typed',
              rawText: a.rawText || '',
              ocrText: a.ocrText || '',
              scanFileId: a.scanFileId,
            };
          }
          setAnswers(restored);
        }
      })
      .catch((e) => setErr(e.message));
  }, [examId]);

  // Countdown + auto-submit
  useEffect(() => {
    if (!data) return;
    const t = setInterval(() => {
      setRemaining((s) => {
        if (s <= 1) { clearInterval(t); autoSubmit(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [data]);

  // Auto-save every 30s
  useEffect(() => {
    if (!data) return;
    const t = setInterval(() => { save(false); }, 30000);
    return () => clearInterval(t);
  }, [data, answers]);

  const key = (gi, qno, label) => `${gi}-${qno}-${label}`;
  // Typing sets inputMode 'typed' unless this answer was already backed by a
  // scan — in that case we keep it 'scanned' (with its scanFileId) so faculty
  // still see the original image even after the student edits the OCR text.
  const setAns = (gi, qno, label, text) => setAnswers((a) => {
    const k = key(gi, qno, label);
    const prev = a[k] || {};
    const scanned = prev.inputMode === 'scanned' && prev.scanFileId;
    return {
      ...a,
      [k]: {
        groupIndex: gi, questionNo: qno, subLabel: label,
        inputMode: scanned ? 'scanned' : 'typed',
        rawText: scanned ? '' : text,
        ocrText: scanned ? text : '',
        ...(scanned ? { scanFileId: prev.scanFileId } : {}),
      },
    };
  });

  // After an OCR upload: fill the box with extracted text and attach the scan.
  const setScannedAns = (gi, qno, label, text, scanFileId) => setAnswers((a) => ({
    ...a,
    [key(gi, qno, label)]: {
      groupIndex: gi, questionNo: qno, subLabel: label,
      inputMode: 'scanned', scanFileId, ocrText: text, rawText: '',
    },
  }));

  // Text shown in a textbox regardless of mode.
  const ansText = (k) => {
    const a = answers[k];
    if (!a) return '';
    return a.inputMode === 'scanned' ? (a.ocrText || '') : (a.rawText || '');
  };

  // Keep answers that have text in either field.
  const buildPayload = () => Object.values(answers).filter((a) => ((a.rawText || a.ocrText || '').trim()));

  const save = async (notify = true) => {
    try {
      await api.put(`/submissions/${examId}/save`, { answers: buildPayload() });
      if (notify) setMsg('Saved.');
    } catch (e) { if (notify) setErr(e.message); }
  };

  const submit = async (mode = 'manual') => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    try {
      await api.post(`/submissions/${examId}/submit`, { answers: buildPayload(), submitMode: mode });
      navigate('/student');
    } catch (e) { setErr(e.message); submittedRef.current = false; }
  };
  const autoSubmit = () => submit('auto_timeout');

  // Upload a photo/scan of a handwritten answer → OCR → fill the textbox.
  const [scanning, setScanning] = useState(null); // key currently uploading
  const uploadScan = async (gi, qno, label, file) => {
    if (!file) return;
    const k = key(gi, qno, label);
    setErr(null); setMsg(null); setScanning(k);
    try {
      const form = new FormData();
      form.append('image', file);
      const r = await api.post(`/submissions/${examId}/ocr`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const { text, scanFileId, warning } = r.data.data;
      setScannedAns(gi, qno, label, text || '', scanFileId);
      setMsg(warning || 'Scan uploaded and text extracted — please review and edit if needed.');
    } catch (e) {
      setErr(e.message || 'Scan upload failed');
    } finally {
      setScanning(null);
    }
  };

  if (err && !data) return <Layout><PageHead title="Exam" /><Banner kind="err">{err}</Banner><button onClick={() => navigate('/student')}>← Back</button></Layout>;
  if (!data) return <Layout><Loading label="Opening exam…" /></Layout>;

  const mm = Math.floor(remaining / 60), ss = remaining % 60;
  const low = remaining < 300;

  return (
    <Layout>
      <div className="spread wrap" style={{ marginBottom: 18, gap: 10 }}>
        <div><h1>{data.exam.title}</h1><p className="muted">{data.exam.subjectCode} · {data.exam.examType} · {data.exam.maxMarks} marks</p></div>
        <div style={{ textAlign: 'right' }}>
          <div className="mono" style={{ fontSize: '1.8rem', fontWeight: 500, color: low ? 'var(--red)' : 'var(--ink)' }}>
            {String(mm).padStart(2,'0')}:{String(ss).padStart(2,'0')}
          </div>
          <div className="muted" style={{ fontSize: '0.75rem' }}>time remaining</div>
        </div>
      </div>
      {low && <Banner kind="err">Less than 5 minutes remaining — the exam will auto-submit at zero.</Banner>}
      <Banner kind="info">{msg}</Banner>
      <Banner kind="err">{data ? err : null}</Banner>

      <div className="col">
        {data.paper.groups.map((g, gi) => <GroupBlock key={gi} g={g} gi={gi} examId={examId} answers={answers} setAns={setAns} ansText={ansText} uploadScan={uploadScan} scanning={scanning} />)}
      </div>

      <div className="row" style={{ marginTop: 20, gap: 10 }}>
        <button onClick={() => save(true)}>Save</button>
        <div style={{ flex: 1 }} />
        <button className="accent" onClick={() => submit('manual')}>Submit exam</button>
      </div>
    </Layout>
  );
}

function GroupBlock({ g, gi, examId, answers, setAns, ansText, uploadScan, scanning }) {
  const isOr = g.groupType === 'or_pair';
  const [side, setSide] = useState(0);
  const qs = isOr ? [g.questions[side]] : g.questions;
  return (
    <Card>
      <div className="spread" style={{ marginBottom: 10 }}>
        <strong>{isOr ? `Q${g.questions[0].questionNo} or Q${g.questions[1].questionNo}` : `Q${g.questions[0].questionNo}`}</strong>
        {isOr && (
          <div className="row" style={{ gap: 6 }}>
            {g.questions.map((q, i) => (
              <button key={i} className={side===i?'primary sm':'sm'} onClick={() => setSide(i)}>Q{q.questionNo}</button>
            ))}
          </div>
        )}
      </div>
      {isOr && <p className="muted" style={{ fontSize: '0.8rem', marginBottom: 10 }}>You may answer either question (or both — the higher score counts).</p>}
      {qs.map((q) => (
        <div key={q.questionNo}>
          {q.subQuestions.map((s) => {
            const k = `${gi}-${q.questionNo}-${s.label}`;
            const isScanned = answers[k]?.inputMode === 'scanned';
            const isBusy = scanning === k;
            return (
              <div key={k} style={{ marginBottom: 14 }}>
                <div className="row" style={{ gap: 8, marginBottom: 6 }}>
                  <strong>{s.label})</strong><span>{s.text}</span><Tags co={s.co} rbtl={s.rbtl} marks={s.marks} />
                </div>
                {s.imageFileId && (
                  <div style={{ marginBottom: 8 }}>
                    <AuthImage path={`/submissions/${examId}/question-image/${s.imageFileId}`} alt={`Figure for ${s.label}`}
                      style={{ maxWidth: '100%', maxHeight: 320, border: '1px solid var(--line-soft)', borderRadius: 4 }} />
                  </div>
                )}
                {s.questionType === 'programming' ? (
                  <div>
                    <div className="row" style={{ gap: 8, marginBottom: 4, alignItems: 'center' }}>
                      <span className="tag" style={{ fontSize: '0.7rem' }}>{({python:'Python',java:'Java',c:'C',cpp:'C++'})[s.language] || s.language}</span>
                      <span className="muted" style={{ fontSize: '0.72rem' }}>Write your complete program below. After you submit, it is compiled and run against the test cases and scored automatically.</span>
                    </div>
                    <CodeInput value={ansText(k) || ''} starter={s.starterCode || ''} k={k}
                      onChange={(v) => setAns(gi, q.questionNo, s.label, v)} marks={s.marks} />
                  </div>
                ) : (
                  <>
                    <textarea value={ansText(k)} onChange={(e) => setAns(gi, q.questionNo, s.label, e.target.value)}
                      placeholder="Type your answer, or upload a photo of a handwritten answer below…"
                      style={{ minHeight: s.marks > 8 ? 130 : 80 }} />
                    <div className="row" style={{ gap: 10, marginTop: 4, alignItems: 'center' }}>
                      <label className="sm" style={{ cursor: isBusy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, opacity: isBusy ? 0.6 : 1 }}>
                        <input type="file" accept="image/*" capture="environment" disabled={isBusy}
                          style={{ display: 'none' }}
                          onChange={(e) => { uploadScan(gi, q.questionNo, s.label, e.target.files?.[0]); e.target.value = ''; }} />
                        {isBusy ? 'Reading scan…' : '📷 Upload scan of answer'}
                      </label>
                      {isScanned && !isBusy && (
                        <span className="muted" style={{ fontSize: '0.72rem' }}>
                          Scanned answer attached — extracted text shown above; edit if the OCR misread anything.
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </Card>
  );
}

// Code input for programming questions: monospace, Tab inserts spaces, and the
// starter code pre-fills once if the student hasn't written anything yet (so
// resumed answers are never overwritten).
function CodeInput({ value, starter, onChange, marks }) {
  const seeded = useRef(false);
  useEffect(() => {
    if (!seeded.current && !value && starter) { onChange(starter); }
    seeded.current = true;
  }, []);
  const handleKey = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.target;
      const start = el.selectionStart, end = el.selectionEnd;
      const next = value.slice(0, start) + '    ' + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 4; });
    }
  };
  return (
    <textarea value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={handleKey} spellCheck={false}
      placeholder="Write your program here…"
      style={{ fontFamily: 'monospace', fontSize: '0.85rem', whiteSpace: 'pre', overflowX: 'auto', width: '100%', minHeight: marks > 8 ? 240 : 160 }} />
  );
}


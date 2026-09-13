import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/client.js';
import { Layout, Card, PageHead, Banner, Loading, Tags } from '../../components/ui.jsx';
import { checkOrEquivalence, questionTotal } from '../../utils/obe.js';
import { detectRbtl, BLOOM_VERBS } from '../../utils/bloom.js';
import AuthImage from '../../components/AuthImage.jsx';

const CO_KEYS = ['CO1','CO2','CO3','CO4','CO5'];
const RBTL_KEYS = ['L1','L2','L3','L4','L5','L6'];
const RBTL_DEFAULT_WEIGHTS = {
  L1: { cosine:30,keywords:50,style:10,grammar:10 }, L2: { cosine:30,keywords:50,style:10,grammar:10 },
  L3: { cosine:35,keywords:35,style:20,grammar:10 }, L4: { cosine:35,keywords:35,style:20,grammar:10 },
  L5: { cosine:25,keywords:25,style:30,grammar:20 }, L6: { cosine:25,keywords:25,style:30,grammar:20 },
};

export default function ExamBuilder() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState(null);
  const [course, setCourse] = useState(null);
  const [layout, setLayout] = useState(null); // marks scheme + expected modules
  const [tab, setTab] = useState('paper');
  const [studentFacing, setStudentFacing] = useState(false); // QP without CO/RBTL columns
  const [groups, setGroups] = useState([]);
  const [scheme, setScheme] = useState([]);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get(`/exams/${examId}`).then((r) => {
      setExam(r.data.data);
      const cid = r.data.data.courseId?._id || r.data.data.courseId;
      if (cid) api.get(`/courses/${cid}`).then((c) => setCourse(c.data.data)).catch(()=>{});
    }).catch((e)=>setErr(e.message));
    api.get(`/exams/${examId}/scheme-layout`).then((r) => setLayout(r.data.data)).catch(()=>{});
    api.get(`/exams/${examId}/paper`).then((r) => setGroups(r.data.data.groups || [])).catch(()=>{});
    api.get(`/exams/${examId}/scheme`).then((r) => setScheme(r.data.data.entries || [])).catch(()=>{});
  }, [examId]);

  if (!exam) return <Layout><Loading /></Layout>;

  // Map of CO -> ceiling level (e.g. {CO1:'L3'}); constrains question RBTL so a
  // question can't exceed the cognitive level of the CO it assesses.
  const coCeilings = {};
  (course?.cos || []).forEach((co) => { if (co.maxRbtl) coCeilings[co.coId] = co.maxRbtl; });

  return (
    <Layout>
      <PageHead title={exam.title} sub={`${exam.subjectCode} · ${exam.examType} · ${exam.maxMarks} marks · status: ${exam.status}`}
        action={<button onClick={() => navigate('/faculty')}>← Exams</button>} />
      <Banner kind="info">{msg}</Banner>
      <Banner kind="err">{err}</Banner>
      <div className="spread wrap" style={{ marginBottom: 18, gap: 10 }}>
        <div className="row" style={{ gap: 10 }}>
          {['paper','scheme','publish'].map((t) => (
            <button key={t} className={tab===t ? 'primary sm' : 'sm'} onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>{t}</button>
          ))}
        </div>
        <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
          <label className="row" style={{ gap: 5, alignItems: 'center', fontSize: '0.78rem', cursor: 'pointer' }}
            title="Student-facing papers omit the CO and RBTL columns (clean version for distribution to students)">
            <input type="checkbox" checked={studentFacing} onChange={(e) => setStudentFacing(e.target.checked)} />
            Student-facing (hide CO/RBTL)
          </label>
          <button className="sm" onClick={() => downloadDoc(
            `/exams/${examId}/download/paper${studentFacing ? '?coRbtl=false' : ''}`,
            `${exam.subjectCode||'paper'}_QP${studentFacing ? '_student' : ''}.docx`, setErr)}>
            ⬇ Question paper
          </button>
          <button className="sm" onClick={() => downloadDoc(`/exams/${examId}/download/scheme`, `${exam.subjectCode||'scheme'}_Scheme.docx`, setErr)}>⬇ Scheme</button>
        </div>
      </div>
      {tab === 'paper' && <PaperBuilder groups={groups} setGroups={setGroups} examId={examId} setMsg={setMsg} setErr={setErr} coCeilings={coCeilings} layout={layout} />}
      {tab === 'scheme' && <SchemeBuilder groups={groups} scheme={scheme} setScheme={setScheme} examId={examId} setMsg={setMsg} setErr={setErr} />}
      {tab === 'publish' && <PublishTab examId={examId} setMsg={setMsg} setErr={setErr} reload={() => api.get(`/exams/${examId}`).then((r)=>setExam(r.data.data))} />}
    </Layout>
  );
}

/* ---------- Paper builder ---------- */
function PaperBuilder({ groups, setGroups, examId, setMsg, setErr, coCeilings = {}, layout = null }) {
  const rank = (l) => RBTL_KEYS.indexOf(l) + 1;
  const allowedRbtl = (co) => {
    const ceil = coCeilings[co];
    if (!ceil) return RBTL_KEYS;
    return RBTL_KEYS.slice(0, rank(ceil));
  };
  const modules = layout?.modules || null; // [{moduleNo, co|null, marks}] or null
  const isStructured = !!modules;

  // Sum of a question's sub-question marks.
  const qMarks = (q) => (q.subQuestions || []).reduce((s, x) => s + (Number(x.marks) || 0), 0);
  // The marks budget for a module from the scheme.
  const moduleBudget = (mod) => modules?.find((m) => m.moduleNo === mod)?.marks ?? null;
  const moduleCo = (mod) => modules?.find((m) => m.moduleNo === mod)?.co ?? null;
  // Next module number not yet used by a group.
  const usedModules = () => new Set(groups.map((g) => g.questions[0]?.moduleNo).filter(Boolean));
  const nextModule = () => {
    if (!modules) return undefined;
    const used = usedModules();
    const free = modules.find((m) => !used.has(m.moduleNo));
    return free?.moduleNo;
  };

  // Assign a module to a whole group (both OR sides share it); pre-fill the
  // slot CO when the scheme pins one for that module.
  const setGroupModule = (gi, val) => {
    const mod = val ? Number(val) : undefined;
    const copy = structuredClone(groups);
    const co = mod ? moduleCo(mod) : null;
    copy[gi].questions.forEach((q) => {
      q.moduleNo = mod;
      if (co) q.subQuestions.forEach((s) => { s.co = co; if (s.rbtl && rank(s.rbtl) > rank(coCeilings[co] || 'L6')) s.rbtl = ''; });
    });
    setGroups(copy);
  };

  const addSolo = () => {
    const n = totalQuestions(groups) + 1;
    const mod = nextModule();
    const q = mkQ(n); if (mod) q.moduleNo = mod;
    setGroups([...groups, { groupType: 'solo', questions: [q] }]);
  };
  const addOr = () => {
    const n = totalQuestions(groups) + 1;
    const mod = nextModule();
    const qA = mkQ(n), qB = mkQ(n + 1);
    if (mod) { qA.moduleNo = mod; qB.moduleNo = mod; }
    // Pre-fill the slot CO if the scheme pins one for this module.
    const co = moduleCo(mod);
    if (co) { qA.subQuestions[0].co = co; qB.subQuestions[0].co = co; }
    setGroups([...groups, { groupType: 'or_pair', questions: [qA, qB] }]);
  };
  const update = (gi, qi, si, field, val) => {
    const copy = structuredClone(groups);
    const sub = copy[gi].questions[qi].subQuestions[si];
    sub[field] = val;
    // If the CO changed and the existing RBTL now exceeds the new CO's ceiling,
    // clear it so the faculty must pick a valid level.
    if (field === 'co') {
      const ceil = coCeilings[val];
      if (ceil && sub.rbtl && rank(sub.rbtl) > rank(ceil)) sub.rbtl = '';
    }
    // When the question text changes, auto-detect RBTL from its action verbs.
    // Only auto-FILL when the field is empty (never overwrite a faculty choice),
    // AND only when the detected level is at or below the CO ceiling. If the verb
    // implies a level ABOVE the ceiling, leave RBTL empty so the faculty must
    // consciously resolve the mismatch (the hint flags it) — we never silently
    // record a lower level than the question's verb actually implies.
    if (field === 'text' && !sub.rbtl) {
      const { level } = detectRbtl(val);
      if (level) {
        const ceil = sub.co ? coCeilings[sub.co] : null;
        if (!ceil || rank(level) <= rank(ceil)) sub.rbtl = level;
      }
    }
    setGroups(copy);
  };
  const addSub = (gi, qi) => {
    const copy = structuredClone(groups);
    const q = copy[gi].questions[qi];
    const label = String.fromCharCode(97 + q.subQuestions.length);
    q.subQuestions.push({ label, text: '', co: '', rbtl: '', marks: '', expectedLength: 'short' });
    setGroups(copy);
  };

  // Remove one sub-question; keep at least one, and re-label the rest a, b, c…
  const removeSub = (gi, qi, si) => {
    const copy = structuredClone(groups);
    const q = copy[gi].questions[qi];
    if (q.subQuestions.length <= 1) return; // a question must keep at least one sub-question
    q.subQuestions.splice(si, 1);
    q.subQuestions.forEach((s, idx) => { s.label = String.fromCharCode(97 + idx); });
    setGroups(copy);
  };

  // Toggle a sub-question between descriptive and programming, seeding sensible
  // defaults for programming so faculty have something to edit.
  const setQuestionType = (gi, qi, si, type) => {
    const copy = structuredClone(groups);
    const s = copy[gi].questions[qi].subQuestions[si];
    s.questionType = type;
    if (type === 'programming') {
      s.language = s.language || 'python';
      s.starterCode = s.starterCode || '';
      s.testCases = s.testCases || [{ stdin: '', expectedStdout: '', hidden: false, weight: 1 }];
      s.timeLimitSec = s.timeLimitSec || 5;
      s.memoryLimitMb = s.memoryLimitMb || 128;
      s.rubric = s.rubric || { correctness: 65, style: 15, complexity: 20 };
      s.complexityThreshold = s.complexityThreshold || 10;
    }
    setGroups(copy);
  };
  const removeGroup = (gi) => setGroups(groups.filter((_, i) => i !== gi));

  // Upload an image for a sub-question; store its GridFS id on the sub-question.
  const [imgBusy, setImgBusy] = useState(null); // "gi-qi-si" currently uploading
  const uploadImage = async (gi, qi, si, file) => {
    if (!file) return;
    const key = `${gi}-${qi}-${si}`;
    setErr(null); setImgBusy(key);
    try {
      const form = new FormData();
      form.append('image', file);
      const r = await api.post(`/exams/${examId}/question-image`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      update(gi, qi, si, 'imageFileId', r.data.data.imageFileId);
      setMsg('Image attached. Save the paper to keep it.');
    } catch (e) {
      setErr(e.details?.join('; ') || e.message || 'Image upload failed');
    } finally { setImgBusy(null); }
  };
  const removeImage = (gi, qi, si) => update(gi, qi, si, 'imageFileId', '');

  const save = async () => {
    setErr(null); setMsg(null);
    // client-side OR check first
    for (let i = 0; i < groups.length; i++) {
      const eq = checkOrEquivalence(groups[i]);
      if (!eq.ok) { setErr(`Group ${i+1} OR equivalence failed: ${eq.errors.join('; ')}`); return; }
    }
    // CO ceiling check (server enforces too, but fail fast). Only flags a real
    // exceedance — a CO with no ceiling, or a question with no RBTL, is allowed.
    for (const g of groups) {
      for (const q of g.questions) {
        for (const s of q.subQuestions) {
          if (!s.co || !s.rbtl) continue;
          const ceil = coCeilings[s.co];
          if (ceil && rank(s.rbtl) > rank(ceil)) {
            setErr(`Q${q.questionNo}${s.label}: ${s.rbtl} exceeds ${s.co}'s ceiling (${ceil}). Lower the level or remap the CO.`); return;
          }
        }
      }
    }
    try {
      const clean = groups.map((g) => ({ groupType: g.groupType, questions: g.questions.map((q) => ({
        questionNo: q.questionNo, moduleNo: q.moduleNo, instruction: q.instruction || '',
        subQuestions: q.subQuestions.map((s) => ({ ...s, marks: Number(s.marks) })),
      })) }));
      await api.put(`/exams/${examId}/paper`, { groups: clean });
      setMsg('Question paper saved.');
    } catch (e) { setErr(e.details?.join('; ') || e.message); }
  };

  // ---- Optional: generate draft questions from uploaded notes ----
  const [genOpen, setGenOpen] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  // Upload notes for ONE module (per-module generation) or the whole document.
  const generateFromNotes = async (file, moduleNo = null) => {
    if (!file) return;
    setErr(null); setMsg(null); setGenBusy(moduleNo || 'all');
    try {
      const form = new FormData();
      form.append('file', file);
      if (moduleNo) form.append('moduleNo', String(moduleNo));

      const r = await api.post(`/exams/${examId}/generate-questions`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const { pairs, adjustments, warning, bankInfo } = r.data.data;
      if (!pairs?.length) {
        setErr(warning || 'No draft questions could be generated from that file.');
        return;
      }
      // Append each generated pair as an OR group with two editable questions.
      // Both sides share the same CO/RBTL/marks, so they pass OR equivalence.
      // moduleNo comes from the scheme-aware generator.
      let n = totalQuestions(groups);
      const newGroups = pairs.map((p) => {
        const qA = n + 1, qB = n + 2; n += 2;
        return { groupType: 'or_pair', questions: [
          { questionNo: qA, moduleNo: p.moduleNo, instruction: '', subQuestions: [
            { label: 'a', text: p.optionA.text, co: p.co, rbtl: p.rbtl, marks: p.marks, expectedLength: 'medium' },
          ] },
          { questionNo: qB, moduleNo: p.moduleNo, instruction: '', subQuestions: [
            { label: 'a', text: p.optionB.text, co: p.co, rbtl: p.rbtl, marks: p.marks, expectedLength: 'medium' },
          ] },
        ] };
      });
      setGroups([...groups, ...newGroups]);
      const adj = adjustments?.length ? ` (${adjustments.join(' ')})` : '';
      const freshness = bankInfo ? ` ${bankInfo.newCount} new, ${bankInfo.repeatCount} reused from this course's bank.` : '';
      setMsg(`Added ${pairs.length} draft OR group(s)${moduleNo ? ` for Module ${moduleNo}` : ''}.${freshness} Review and edit before saving.${adj}`);
      // Keep the panel open when uploading per-module (so you can do the next
      // module); close it after a whole-document upload.
      if (!moduleNo) setGenOpen(false);
    } catch (e) {
      setErr(e.details?.join('; ') || e.message || 'Generation failed');
    } finally { setGenBusy(false); }
  };

  return (
    <div className="col">
      <div className="row"><button className="sm" onClick={addSolo}>+ Question</button><button className="sm" onClick={addOr}>+ OR group</button>
        <button className="sm" onClick={() => setGenOpen((o) => !o)}>✨ Generate from notes</button>
        <div style={{ flex: 1 }} /><button className="primary" onClick={save}>Save paper</button></div>

      {isStructured && (
        <Card style={{ background: 'var(--paper)' }}>
          <div className="col" style={{ gap: 6 }}>
            <strong style={{ fontSize: '0.85rem' }}>
              {layout.examType} structure — {layout.kind === 'per_co' ? 'fixed CO marks' : 'equal marks per module'}
            </strong>
            <div className="row wrap" style={{ gap: 6 }}>
              {modules.map((m) => {
                const used = groups.find((g) => g.questions[0]?.moduleNo === m.moduleNo);
                return (
                  <span key={m.moduleNo} className={`tag ${used ? 'ok' : ''}`} style={{ fontSize: '0.72rem' }}>
                    Module {m.moduleNo}: {m.co ? `${m.co} · ` : ''}{m.marks}m{used ? ' ✓' : ''}
                  </span>
                );
              })}
            </div>
            <span className="muted" style={{ fontSize: '0.72rem' }}>
              Each module is an OR pair; both sides must total the module's marks. You may split a module's
              marks across sub-questions{layout.kind === 'per_co' ? ', but the CO is fixed for that module.' : '.'}
            </span>
          </div>
        </Card>
      )}

      {genOpen && (
        <Card style={{ background: 'var(--paper)' }}>
          <div className="col" style={{ gap: 10 }}>
            <strong style={{ fontSize: '0.9rem' }}>Generate draft questions from notes (optional)</strong>
            <p className="muted" style={{ fontSize: '0.78rem', margin: 0 }}>
              Upload notes as a PDF or DOCX. The system drafts <strong>module-wise OR pairs</strong> matched to this
              exam's marks scheme — both alternatives share the same CO, RBTL and marks (passing OR equivalence), and
              the level is capped at the CO's Bloom's ceiling. The uploaded notes are also stored so you can later
              draft answers from them in the Scheme tab. Drafts are added below to edit; nothing saves until you click
              "Save paper".
            </p>

            {isStructured ? (
              <div className="col" style={{ gap: 6 }}>
                <span className="muted" style={{ fontSize: '0.75rem' }}>Upload notes per module (recommended — more relevant questions &amp; answers):</span>
                {modules.map((m) => {
                  const busy = genBusy === m.moduleNo;
                  return (
                    <div key={m.moduleNo} className="row" style={{ gap: 8, alignItems: 'center' }}>
                      <span className="tag" style={{ minWidth: 90, fontSize: '0.72rem' }}>Module {m.moduleNo}{m.co ? ` · ${m.co}` : ''} · {m.marks}m</span>
                      <label className="sm" style={{ cursor: busy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, opacity: genBusy && !busy ? 0.5 : 1 }}>
                        <input type="file" accept=".pdf,.docx" disabled={!!genBusy} style={{ display: 'none' }}
                          onChange={(e) => { generateFromNotes(e.target.files?.[0], m.moduleNo); e.target.value = ''; }} />
                        {busy ? 'Generating…' : `📄 Notes for Module ${m.moduleNo}`}
                      </label>
                    </div>
                  );
                })}
                <span className="muted" style={{ fontSize: '0.72rem', marginTop: 4 }}>…or upload one document covering all modules:</span>
                <label className="sm" style={{ cursor: genBusy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, opacity: genBusy ? 0.6 : 1 }}>
                  <input type="file" accept=".pdf,.docx" disabled={!!genBusy} style={{ display: 'none' }}
                    onChange={(e) => { generateFromNotes(e.target.files?.[0]); e.target.value = ''; }} />
                  {genBusy === 'all' ? 'Generating…' : '📄 Whole-syllabus notes'}
                </label>
              </div>
            ) : (
              <label className="sm" style={{ cursor: genBusy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, opacity: genBusy ? 0.6 : 1 }}>
                <input type="file" accept=".pdf,.docx" disabled={!!genBusy} style={{ display: 'none' }}
                  onChange={(e) => { generateFromNotes(e.target.files?.[0]); e.target.value = ''; }} />
                {genBusy ? 'Generating…' : '📄 Choose notes file (PDF/DOCX)'}
              </label>
            )}
          </div>
        </Card>
      )}

      {groups.map((g, gi) => (
        <Card key={gi}>
          <div className="spread" style={{ marginBottom: 10 }}>
            <strong>{g.groupType === 'or_pair' ? `Q${g.questions[0].questionNo} or Q${g.questions[1].questionNo}` : `Q${g.questions[0].questionNo}`}
              {g.groupType === 'or_pair' && <span className="tag warn" style={{ marginLeft: 8 }}>OR group</span>}
              {(() => {
                // Module number is always faculty-selectable (1-5). When the exam
                // has a structured scheme, we also show the per-module marks budget
                // and OK/over indicator; otherwise just the selector.
                const mod = g.questions[0]?.moduleNo;
                const budget = (isStructured && mod) ? moduleBudget(mod) : null;
                const sideMarks = qMarks(g.questions[0]);
                const ok = budget != null && sideMarks === budget;
                return (
                  <span className="row" style={{ display: 'inline-flex', gap: 6, marginLeft: 8, alignItems: 'center' }}>
                    <select value={mod || ''} onChange={(e)=>setGroupModule(gi, e.target.value)} style={{ width: 120, fontSize: '0.75rem' }}>
                      <option value="">Module…</option>
                      {[1,2,3,4,5].map((n)=>{
                        const schemeCo = isStructured ? moduleCo(n) : null;
                        return <option key={n} value={n}>Module {n}{schemeCo?` (${schemeCo})`:''}</option>;
                      })}
                    </select>
                    {budget != null && <span className={`tag ${ok ? 'ok' : 'bad'}`} style={{ fontSize: '0.72rem' }}>{sideMarks}/{budget}m</span>}
                  </span>
                );
              })()}
            </strong>
            <button className="ghost sm" onClick={() => removeGroup(gi)}>Remove</button>
          </div>
          <div className={g.groupType === 'or_pair' ? 'grid-2' : ''}>
            {g.questions.map((q, qi) => (
              <div key={qi} style={{ border: g.groupType==='or_pair' ? '1px solid var(--line-soft)' : 'none', borderRadius: 6, padding: g.groupType==='or_pair'?10:0, minWidth: 0 }}>
                <div className="muted" style={{ fontSize: '0.8rem', marginBottom: 6 }}>Q{q.questionNo} {g.groupType==='or_pair' && qi===1 && '(alternative)'} · total {questionTotal(q)}m</div>
                {q.subQuestions.map((s, si) => (
                  <div key={si} className="col" style={{ gap: 6, marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--line-soft)' }}>
                    <div className="row" style={{ gap: 6 }}>
                      <span className="tag" style={{ minWidth: 26 }}>{s.label})</span>
                      <input placeholder="Sub-question text" value={s.text} onChange={(e)=>update(gi,qi,si,'text',e.target.value)} style={{ flex: 1, minWidth: 0 }} />
                      {q.subQuestions.length > 1 && (
                        <button className="ghost sm" title="Remove this sub-question" onClick={() => removeSub(gi, qi, si)}>✕</button>
                      )}
                    </div>
                    <div className="row wrap" style={{ gap: 6, alignItems: 'center' }}>
                      <select value={s.co} onChange={(e)=>update(gi,qi,si,'co',e.target.value)} style={{ width: 80 }}>
                        <option value="">CO</option>{CO_KEYS.map(c=><option key={c}>{c}</option>)}
                      </select>
                      {s.co && (
                        <div className="row wrap" style={{ gap: 3, alignItems: 'center' }} title="Extra COs this question also assesses (marks split equally)">
                          <span className="muted" style={{ fontSize: '0.66rem' }}>+CO</span>
                          {CO_KEYS.filter(c=>c!==s.co).map(c=>{
                            const on=(s.additionalCos||[]).includes(c);
                            return <button key={c} type="button" className={`sm ${on?'primary':'ghost'}`} style={{ fontSize: '0.62rem', padding: '1px 5px' }}
                              onClick={()=>{ const set=new Set(s.additionalCos||[]); on?set.delete(c):set.add(c); update(gi,qi,si,'additionalCos',[...set]); }}>{c.replace('CO','')}</button>;
                          })}
                        </div>
                      )}
                      <select value={s.rbtl} onChange={(e)=>update(gi,qi,si,'rbtl',e.target.value)} style={{ width: 70 }}>
                        <option value="">RBTL</option>{(s.co && coCeilings[s.co] ? allowedRbtl(s.co) : RBTL_KEYS).map(r=><option key={r}>{r}</option>)}
                      </select>
                      {s.co && coCeilings[s.co] && <span className="muted" style={{ fontSize: '0.68rem' }}>≤ {coCeilings[s.co]}</span>}
                      <RbtlHint text={s.text} co={s.co} currentRbtl={s.rbtl}
                        ceiling={s.co ? coCeilings[s.co] : null} rank={rank}
                        onApply={(lvl) => update(gi, qi, si, 'rbtl', lvl)} />
                      <input type="number" placeholder="marks" value={s.marks} onChange={(e)=>update(gi,qi,si,'marks',e.target.value)} style={{ width: 80 }} />
                      <select value={s.questionType || 'descriptive'} onChange={(e)=>setQuestionType(gi,qi,si,e.target.value)} style={{ width: 130 }}>
                        <option value="descriptive">Descriptive</option>
                        <option value="programming">Programming</option>
                      </select>
                      {(s.questionType || 'descriptive') === 'descriptive' && (
                        <select value={s.expectedLength} onChange={(e)=>update(gi,qi,si,'expectedLength',e.target.value)} style={{ width: 110 }}>
                          {['brief','short','medium','long'].map(l=><option key={l}>{l}</option>)}
                        </select>
                      )}
                    </div>
                    {s.questionType === 'programming' && (
                      <ProgrammingEditor s={s} onChange={(field, val) => update(gi, qi, si, field, val)} />
                    )}
                    <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                      {s.imageFileId ? (
                        <>
                          <AuthImage path={`/question-image/${s.imageFileId}`} alt="question figure"
                            style={{ maxHeight: 90, maxWidth: 160, border: '1px solid var(--line-soft)', borderRadius: 4 }} />
                          <button className="ghost sm" onClick={() => removeImage(gi, qi, si)}>Remove image</button>
                        </>
                      ) : (
                        <label className="sm" style={{ cursor: imgBusy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, opacity: imgBusy ? 0.6 : 1 }}>
                          <input type="file" accept="image/*" disabled={!!imgBusy} style={{ display: 'none' }}
                            onChange={(e) => { uploadImage(gi, qi, si, e.target.files?.[0]); e.target.value = ''; }} />
                          {imgBusy === `${gi}-${qi}-${si}` ? 'Uploading…' : '🖼️ Attach image (optional)'}
                        </label>
                      )}
                    </div>
                  </div>
                ))}
                <button className="ghost sm" onClick={() => addSub(gi, qi)}>+ sub-question</button>
              </div>
            ))}
          </div>
          {g.groupType === 'or_pair' && <OrCheck group={g} />}
        </Card>
      ))}
      {groups.length === 0 && <p className="muted">Add questions to build the paper.</p>}
    </div>
  );
}

function OrCheck({ group }) {
  const eq = checkOrEquivalence(group);
  return (
    <div className={`banner ${eq.ok ? 'info' : 'err'}`} style={{ marginTop: 10, marginBottom: 0 }}>
      {eq.ok ? 'OR equivalence OK — each CO·RBTL carries equal marks on both sides.'
             : <>OR equivalence failed:<br />{eq.errors.map((e,i)=><div key={i}>· {e}</div>)}</>}
    </div>
  );
}

/* ---------- Scheme builder ---------- */
function SchemeBuilder({ groups, scheme, setScheme, examId, setMsg, setErr }) {
  // Build entry skeletons from the paper if scheme is empty
  useEffect(() => {
    if (scheme.length > 0 || groups.length === 0) return;
    const entries = [];
    groups.forEach((g, gi) => {
      g.questions.forEach((q) => {
        q.subQuestions.forEach((s) => {
          entries.push({
            groupIndex: gi, questionNo: q.questionNo, subLabel: s.label, co: s.co, additionalCos: s.additionalCos || [], rbtl: s.rbtl,
            maxMarks: Number(s.marks), questionType: s.questionType || 'descriptive',
            modelAnswer: '', mandatoryKeywords: [], bonusKeywords: [],
            weights: RBTL_DEFAULT_WEIGHTS[s.rbtl] || RBTL_DEFAULT_WEIGHTS.L3,
          });
        });
      });
    });
    setScheme(entries);
  }, [groups]);

  const upd = (i, field, val) => setScheme(scheme.map((e, idx) => idx===i ? { ...e, [field]: val } : e));
  const updKw = (i, field, val) => upd(i, field, val.split(',').map((s)=>s.trim()).filter(Boolean));
  const updW = (i, dim, val) => setScheme(scheme.map((e, idx) => idx===i ? { ...e, weights: { ...e.weights, [dim]: Number(val) } } : e));

  // Reuse the generic question-image endpoint to store a model-answer figure.
  const [schemeImgBusy, setSchemeImgBusy] = useState(null);
  const uploadSchemeImage = async (i, file) => {
    if (!file) return;
    setErr(null); setSchemeImgBusy(i);
    try {
      const form = new FormData();
      form.append('image', file);
      const r = await api.post(`/exams/${examId}/question-image`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      upd(i, 'imageFileId', r.data.data.fileId);
    } catch (e) { setErr(e.details?.join('; ') || e.message); }
    finally { setSchemeImgBusy(null); }
  };

  const save = async (publish) => {
    setErr(null); setMsg(null);
    try {
      await api.put(`/exams/${examId}/scheme`, { entries: scheme, published: publish });
      setMsg(publish ? 'Scheme published.' : 'Scheme draft saved.');
    } catch (e) { setErr(e.details?.join('; ') || e.message); }
  };

  if (groups.length === 0) return <Banner kind="warn">Build the question paper first.</Banner>;
  return (
    <div className="col">
      <div className="row"><div style={{ flex:1 }} />
        <button onClick={() => save(false)}>Save draft</button>
        <button className="primary" onClick={() => save(true)}>Publish scheme</button></div>
      {scheme.map((e, i) => {
        // Determine if this entry is a programming question — prefer the entry's
        // own flag, but fall back to looking it up on the paper (so existing
        // schemes built before this field also render correctly).
        const paperSub = groups[e.groupIndex]?.questions?.find((q)=>q.questionNo===e.questionNo)?.subQuestions?.find((s)=>s.label===e.subLabel);
        const isProgramming = (e.questionType || paperSub?.questionType) === 'programming';
        if (isProgramming) {
          return (
            <Card key={i}>
              <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                <strong>Q{e.questionNo}{e.subLabel}</strong><Tags co={e.co} rbtl={e.rbtl} marks={e.maxMarks} />
                <span className="tag">programming</span>
              </div>
              <Banner kind="ok">
                This is a programming question — it is scored automatically from its <strong>test cases</strong> and code-quality rubric (set on the <strong>Paper</strong> tab). No model answer or keywords are needed here.
              </Banner>
            </Card>
          );
        }
        const wsum = e.weights.cosine + e.weights.keywords + e.weights.style + e.weights.grammar;
        return (
          <Card key={i}>
            <div className="row" style={{ gap: 8, marginBottom: 8 }}>
              <strong>Q{e.questionNo}{e.subLabel}</strong><Tags co={e.co} rbtl={e.rbtl} marks={e.maxMarks} />
              {['L5','L6'].includes(e.rbtl) && <span className="tag bad">mandatory review</span>}
            </div>
            <label>Model answer</label>
            <textarea value={e.modelAnswer} onChange={(ev)=>upd(i,'modelAnswer',ev.target.value)} placeholder="Ideal complete answer used for scoring. Enter the model answer for this question." />
            <div className="row" style={{ gap: 8, alignItems: 'center', marginTop: 6 }}>
              {e.imageFileId ? (
                <>
                  <AuthImage path={`/question-image/${e.imageFileId}`} alt="model answer figure"
                    style={{ maxHeight: 90, maxWidth: 160, border: '1px solid var(--line-soft)', borderRadius: 4 }} />
                  <button className="ghost sm" onClick={() => upd(i, 'imageFileId', null)}>Remove image</button>
                </>
              ) : (
                <label className="sm" style={{ cursor: schemeImgBusy!=null ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, opacity: schemeImgBusy===i ? 0.6 : 1 }}>
                  <input type="file" accept="image/*" disabled={schemeImgBusy!=null} style={{ display: 'none' }}
                    onChange={(ev) => { uploadSchemeImage(i, ev.target.files?.[0]); ev.target.value = ''; }} />
                  {schemeImgBusy===i ? 'Uploading…' : '🖼️ Attach figure to model answer (optional)'}
                </label>
              )}
            </div>
            <div className="grid-2" style={{ marginTop: 8 }}>
              <div><label>Mandatory keywords (comma-separated)</label>
                <input value={(e.mandatoryKeywords||[]).join(', ')} onChange={(ev)=>updKw(i,'mandatoryKeywords',ev.target.value)} /></div>
              <div><label>Bonus keywords</label>
                <input value={(e.bonusKeywords||[]).join(', ')} onChange={(ev)=>updKw(i,'bonusKeywords',ev.target.value)} /></div>
            </div>
            <div style={{ marginTop: 8 }}>
              <label>NLP weights (must total 100) — <span style={{ color: wsum===100?'var(--green)':'var(--red)' }}>{wsum}%</span></label>
              <div className="row wrap" style={{ gap: 10 }}>
                {['cosine','keywords','style','grammar'].map((dim) => (
                  <div key={dim} className="row" style={{ gap: 4 }}>
                    <span className="muted" style={{ fontSize: '0.8rem', width: 64, textTransform:'capitalize' }}>{dim}</span>
                    <input type="number" value={e.weights[dim]} onChange={(ev)=>updW(i,dim,ev.target.value)} style={{ width: 64 }} />
                  </div>
                ))}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ---------- Publish ---------- */
function PublishTab({ examId, setMsg, setErr, reload }) {
  const publish = async () => {
    setErr(null); setMsg(null);
    try {
      await api.post(`/exams/${examId}/publish`);
      setMsg('Exam published and students notified. Students can now access it during the scheduled window.');
      reload();
    } catch (e) { setErr(e.details?.join('; ') || e.message); }
  };
  return (
    <Card style={{ maxWidth: 560 }}>
      <h3>Publish exam</h3>
      <p className="muted" style={{ margin: '8px 0 16px' }}>
        Publishing requires a saved question paper and a published marking scheme. Once published, students in the
        department are notified by email and the exam becomes accessible only during its scheduled time window.
      </p>
      <button className="accent" onClick={publish}>Publish exam</button>
    </Card>
  );
}

/* helpers */
// Fetch an authenticated .docx (api client attaches JWT) as a blob and trigger
// a browser download. A plain <a href> can't send the auth header.
async function downloadDoc(path, filename, setErr) {
  try {
    const res = await api.get(path, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    // Error responses come back as a Blob (because responseType is blob), so the
    // interceptor can't read the JSON message — pull it out of the blob here.
    let detail = e.message || 'Download failed';
    const blob = e.response?.data;
    if (blob && typeof blob.text === 'function') {
      try { const j = JSON.parse(await blob.text()); detail = j?.error?.message || detail; } catch { /* keep default */ }
    }
    if (setErr) setErr(detail); else alert(detail);
  }
}

function totalQuestions(groups) { return groups.reduce((n, g) => n + g.questions.length, 0); }
function mkQ(n) { return { questionNo: n, instruction: '', subQuestions: [{ label: 'a', text: '', co: '', rbtl: '', marks: '', expectedLength: 'short' }] }; }

// A simple dependency-free code input: monospace textarea with Tab support.
// (A full editor like CodeMirror would be nicer but adds a heavy dependency;
// this keeps the self-hosted build light and works offline.)
function CodeArea({ value, onChange, placeholder, rows = 6 }) {
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
    <textarea value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={handleKey}
      placeholder={placeholder} rows={rows} spellCheck={false}
      style={{ fontFamily: 'monospace', fontSize: '0.82rem', whiteSpace: 'pre', overflowX: 'auto', width: '100%' }} />
  );
}

// Faculty authoring panel for a programming sub-question.
function ProgrammingEditor({ s, onChange }) {
  const rubric = s.rubric || { correctness: 65, style: 15, complexity: 20 };
  const rubricSum = (Number(rubric.correctness) || 0) + (Number(rubric.style) || 0) + (Number(rubric.complexity) || 0);
  const testCases = s.testCases || [];

  const setRubric = (field, val) => onChange('rubric', { ...rubric, [field]: Number(val) });
  const setTC = (i, field, val) => {
    const next = testCases.map((t, idx) => idx === i ? { ...t, [field]: val } : t);
    onChange('testCases', next);
  };
  const addTC = () => onChange('testCases', [...testCases, { stdin: '', expectedStdout: '', hidden: false, weight: 1 }]);
  const removeTC = (i) => onChange('testCases', testCases.filter((_, idx) => idx !== i));

  return (
    <div style={{ border: '1px solid var(--line-soft)', borderRadius: 6, padding: 10, marginTop: 8, background: 'var(--bg-soft, #fafafa)' }}>
      <div className="row wrap" style={{ gap: 10, alignItems: 'center', marginBottom: 8 }}>
        <div>
          <label style={{ fontSize: '0.72rem' }}>Language</label>
          <select value={s.language || 'python'} onChange={(e) => onChange('language', e.target.value)} style={{ width: 120 }}>
            <option value="python">Python</option>
            <option value="java">Java</option>
            <option value="c">C</option>
            <option value="cpp">C++</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.72rem' }}>Time limit (s)</label>
          <input type="number" min="1" max="15" value={s.timeLimitSec || 5} onChange={(e) => onChange('timeLimitSec', Number(e.target.value))} style={{ width: 90 }} />
        </div>
        <div>
          <label style={{ fontSize: '0.72rem' }}>Memory (MB)</label>
          <input type="number" min="16" max="512" value={s.memoryLimitMb || 128} onChange={(e) => onChange('memoryLimitMb', Number(e.target.value))} style={{ width: 90 }} />
        </div>
        <div>
          <label style={{ fontSize: '0.72rem' }}>Complexity ceiling</label>
          <input type="number" min="1" value={s.complexityThreshold || 10} onChange={(e) => onChange('complexityThreshold', Number(e.target.value))} style={{ width: 90 }} />
        </div>
      </div>

      <label style={{ fontSize: '0.72rem' }}>Starter code (optional, shown to student)</label>
      <CodeArea value={s.starterCode || ''} onChange={(v) => onChange('starterCode', v)} placeholder="# optional starter code" rows={4} />

      <div className="spread" style={{ marginTop: 10, marginBottom: 4 }}>
        <strong style={{ fontSize: '0.8rem' }}>Test cases</strong>
        <button className="ghost sm" onClick={addTC}>+ test case</button>
      </div>
      {testCases.map((t, i) => (
        <div key={i} style={{ border: '1px solid var(--line-soft)', borderRadius: 4, padding: 8, marginBottom: 6 }}>
          <div className="row wrap" style={{ gap: 8, alignItems: 'center', marginBottom: 4 }}>
            <span className="tag" style={{ fontSize: '0.68rem' }}>Test {i + 1}</span>
            <label style={{ fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={!!t.hidden} onChange={(e) => setTC(i, 'hidden', e.target.checked)} /> hidden from student
            </label>
            <label style={{ fontSize: '0.72rem' }}>weight
              <input type="number" min="0" step="0.5" value={t.weight ?? 1} onChange={(e) => setTC(i, 'weight', Number(e.target.value))} style={{ width: 60, marginLeft: 4 }} />
            </label>
            <button className="ghost sm" onClick={() => removeTC(i)}>remove</button>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ fontSize: '0.7rem' }}>Input (stdin)</label>
              <CodeArea value={t.stdin || ''} onChange={(v) => setTC(i, 'stdin', v)} placeholder="(input fed to the program)" rows={3} />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ fontSize: '0.7rem' }}>Expected output (stdout)</label>
              <CodeArea value={t.expectedStdout || ''} onChange={(v) => setTC(i, 'expectedStdout', v)} placeholder="(exact expected output)" rows={3} />
            </div>
          </div>
        </div>
      ))}

      <div className="row wrap" style={{ gap: 10, alignItems: 'center', marginTop: 8 }}>
        <strong style={{ fontSize: '0.78rem' }}>Rubric weights</strong>
        <label style={{ fontSize: '0.72rem' }}>Correctness
          <input type="number" min="0" max="100" value={rubric.correctness} onChange={(e) => setRubric('correctness', e.target.value)} style={{ width: 60, marginLeft: 4 }} />%
        </label>
        <label style={{ fontSize: '0.72rem' }}>Style
          <input type="number" min="0" max="100" value={rubric.style} onChange={(e) => setRubric('style', e.target.value)} style={{ width: 60, marginLeft: 4 }} />%
        </label>
        <label style={{ fontSize: '0.72rem' }}>Complexity
          <input type="number" min="0" max="100" value={rubric.complexity} onChange={(e) => setRubric('complexity', e.target.value)} style={{ width: 60, marginLeft: 4 }} />%
        </label>
        <span className={`tag ${rubricSum === 100 ? 'ok' : 'bad'}`} style={{ fontSize: '0.7rem' }}>
          sum {rubricSum}{rubricSum === 100 ? '' : ' (must be 100)'}
        </span>
      </div>
      <p className="muted" style={{ fontSize: '0.7rem', marginTop: 6, marginBottom: 0 }}>
        Correctness = % of test weight passed. Style and complexity are automated indicators; faculty review remains the final say.
      </p>
    </div>
  );
}

// RBTL hint shown next to the RBTL dropdown. Two modes:
//  - a recognised RBT verb is present -> show the detected level (apply/confirm)
//  - substantive text but NO recognised RBT verb -> prompt the faculty to use a
//    measurable action verb, with examples (capped to the CO's Bloom ceiling).
const LEVEL_NAMES = { L1: 'Remember', L2: 'Understand', L3: 'Apply', L4: 'Analyse', L5: 'Evaluate', L6: 'Create' };
function RbtlHint({ text, co, currentRbtl, ceiling, rank, onApply }) {
  const [open, setOpen] = useState(false);
  const det = detectRbtl(text || '').level;

  // Detected verb present.
  if (det) {
    // If the question's verb implies a level ABOVE the CO's Bloom ceiling, do
    // NOT silently lower it — show the actual detected level and warn, so the
    // faculty can fix the verb (or reconsider the CO/question), rather than
    // hiding a real outcome-alignment mismatch.
    if (ceiling && rank(det) > rank(ceiling)) {
      return (
        <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
          <span className="tag bad" style={{ fontSize: '0.66rem' }}
            title={`The question's action verb implies ${det}, which is above ${co}'s maximum level (${ceiling}). Reword the question with an action verb at or below ${ceiling}, or revisit the CO mapping.`}>
            verb implies {det} &gt; {co} max {ceiling}
          </span>
          <button type="button" className="ghost sm" style={{ fontSize: '0.66rem', padding: '2px 6px' }}
            onClick={() => setOpen((v) => !v)}>
            suggest verbs
          </button>
          {open && (
            <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, fontSize: '0.66rem', maxWidth: 360 }}>
              <span className="muted">Use a verb at or below <strong>{ceiling} {LEVEL_NAMES[ceiling]}</strong>:</span>
              {['L1','L2','L3','L4','L5','L6'].filter((l) => rank(l) <= rank(ceiling)).map((l) => (
                <span key={l} className="muted"><strong>{l}:</strong> {BLOOM_VERBS[l].slice(0, 4).join(', ')}</span>
              ))}
            </span>
          )}
        </span>
      );
    }
    // Within the ceiling: detected level is the suggestion.
    const suggested = det;
    if (currentRbtl === suggested) {
      return <span className="tag ok" style={{ fontSize: '0.66rem' }} title="Auto-detected from the question's action verb">auto: {suggested}</span>;
    }
    return (
      <button type="button" className="ghost sm" style={{ fontSize: '0.66rem', padding: '2px 6px' }}
        title="Detected from the question's action verb — click to apply"
        onClick={() => onApply(suggested)}>
        detected: {suggested} ✓ use
      </button>
    );
  }

  // No recognised verb. Only prompt once there's substantive text (avoid nagging
  // on empty/short fragments) — a few words in.
  const wordCount = (text || '').trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 3) return null;

  // Levels allowed under the CO ceiling (or all if no ceiling set yet).
  const levels = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'].filter((l) => !ceiling || rank(l) <= rank(ceiling));

  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
      <button type="button" className="ghost sm" style={{ fontSize: '0.66rem', padding: '2px 6px', color: 'var(--warn, #b45309)' }}
        title="This question has no standard RBT action verb. OBE guidance recommends starting with a measurable verb so the cognitive level is clear."
        onClick={() => setOpen((v) => !v)}>
        ⚠ no RBT verb — suggest
      </button>
      {open && (
        <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, fontSize: '0.66rem', maxWidth: 360 }}>
          {levels.map((l) => (
            <span key={l} className="muted" title={`Level ${l} action verbs`}>
              <strong>{l} {LEVEL_NAMES[l]}:</strong> {BLOOM_VERBS[l].slice(0, 4).join(', ')}
            </span>
          ))}
          <span className="muted" style={{ fontStyle: 'italic' }}>Rephrase the question to begin with one of these, then the level is detected automatically.</span>
        </span>
      )}
    </span>
  );
}

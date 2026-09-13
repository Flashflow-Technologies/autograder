import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/client.js';
import { Layout, Card, PageHead, Banner, Loading } from '../../components/ui.jsx';
import { StatementList, OutcomeList, Section } from './InstituteSettings.jsx';

/**
 * Department settings — the program-level accreditation statements live here:
 * Vision, Mission, PO, PSO, PEO, WK, and Academic Objectives. Each block saves
 * independently; a single "Seed from document" fills empty blocks from the
 * institution reference content.
 */
export default function DepartmentSettings() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [importData, setImportData] = useState(null); // parsed sections awaiting review
  const [importing, setImporting] = useState(false);

  const load = () => api.get('/admin/departments').then((r) => {
    const full = r.data.data.find((x) => String(x._id) === String(id));
    if (full) setD(full); else setErr('Department not found.');
  }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [id]);

  if (!d) return <Layout>{err ? <Banner kind="err">{err}</Banner> : <Loading />}</Layout>;

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(null), 2500); };
  const patch = async (payload, label) => {
    setErr(null); setSaving(true);
    try { const r = await api.patch(`/admin/departments/${id}`, payload); setD(r.data.data); flash(`${label} saved.`); }
    catch (e) { setErr(e.details?.join('; ') || e.message); }
    finally { setSaving(false); }
  };
  const set = (field) => (val) => setD({ ...d, [field]: val });

  const seed = async () => {
    if (!window.confirm('Fill empty statements for this department from the built-in reference content? Existing entries are kept.')) return;
    setErr(null); setSaving(true);
    try { const r = await api.post(`/admin/departments/${id}/seed`); setD(r.data.data); flash('Seeded from built-in content.'); }
    catch (e) { setErr(e.message); } finally { setSaving(false); }
  };

  // Upload a reference doc -> get detected sections for review (nothing applied yet).
  const onUpload = async (file) => {
    if (!file) return;
    setErr(null); setImporting(true); setImportData(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await api.post('/admin/parse-reference', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportData(r.data.data);
      if (r.data.data.warning) setErr(r.data.data.warning);
    } catch (e) { setErr(e.details?.join('; ') || e.message); }
    finally { setImporting(false); }
  };

  return (
    <Layout>
      <PageHead title={`${d.code} — Department settings`} sub={d.name}
        action={<div className="row" style={{ gap: 8 }}>
          <button onClick={() => navigate('/admin/departments')}>← Departments</button>
          <input id="orgDocFile" type="file" accept=".pdf,.docx" style={{ display: 'none' }}
            onChange={(e) => { onUpload(e.target.files?.[0]); e.target.value = ''; }} />
          <button onClick={() => document.getElementById('orgDocFile')?.click()} disabled={importing}>
            {importing ? 'Parsing…' : 'Import from document'}
          </button>
          <button onClick={seed} disabled={saving}>Use built-in content</button>
        </div>} />
      <Banner kind="err">{err}</Banner>
      {msg && <Banner kind="ok">{msg}</Banner>}

      {importData && (
        <ImportReview
          data={importData}
          onCancel={() => setImportData(null)}
          onApply={async (applied) => {
            setSaving(true); setErr(null);
            try {
              // Merge applied sections into the department (append to existing).
              const payload = {};
              const merge = (field, items) => { payload[field] = [ ...(d[field] || []), ...items.map((t, i) => ({ text: t, order: (d[field]?.length || 0) + i })) ]; };
              if (applied.vision?.length) merge('vision', applied.vision);
              if (applied.mission?.length) merge('mission', applied.mission);
              if (applied.peos?.length) merge('peos', applied.peos);
              if (applied.wks?.length) merge('wks', applied.wks);
              if (applied.academicObjectives?.length) merge('academicObjectives', applied.academicObjectives);
              // PO/PSO: map applied items onto stable keys in order.
              if (applied.programOutcomes?.length) {
                payload.programOutcomes = (d.programOutcomes || []).map((o, i) => ({ key: o.key, statement: applied.programOutcomes[i] ?? o.statement }));
              }
              if (applied.programSpecificOutcomes?.length) {
                payload.programSpecificOutcomes = (d.programSpecificOutcomes || []).map((o, i) => ({ key: o.key, statement: applied.programSpecificOutcomes[i] ?? o.statement }));
              }
              const r = await api.patch(`/admin/departments/${id}`, payload);
              setD(r.data.data); setImportData(null); flash('Imported from document.');
            } catch (e) { setErr(e.details?.join('; ') || e.message); }
            finally { setSaving(false); }
          }}
        />
      )}

      <Section title="Department Vision" onSave={() => patch({ vision: d.vision }, 'Vision')} saving={saving}>
        <StatementList items={d.vision} onChange={set('vision')} />
      </Section>

      <Section title="Department Mission" onSave={() => patch({ mission: d.mission }, 'Mission')} saving={saving}>
        <StatementList items={d.mission} onChange={set('mission')} />
      </Section>

      <Section title="Program Outcomes (PO)" onSave={() => patch({ programOutcomes: d.programOutcomes }, 'POs')} saving={saving}
        hint="Edit the statement text; PO identifiers are fixed (used by attainment).">
        <OutcomeList items={d.programOutcomes} onChange={set('programOutcomes')} />
      </Section>

      <Section title="Program Specific Outcomes (PSO)" onSave={() => patch({ programSpecificOutcomes: d.programSpecificOutcomes }, 'PSOs')} saving={saving}>
        <OutcomeList items={d.programSpecificOutcomes} onChange={set('programSpecificOutcomes')} />
      </Section>

      <Section title="Program Educational Objectives (PEO)" onSave={() => patch({ peos: d.peos }, 'PEOs')} saving={saving}>
        <StatementList items={d.peos} onChange={set('peos')} />
      </Section>

      <Section title="Knowledge & Attitude Profile (WK)" onSave={() => patch({ wks: d.wks }, 'WK')} saving={saving}>
        <StatementList items={d.wks} onChange={set('wks')} />
      </Section>

      <Section title="Academic Objectives" onSave={() => patch({ academicObjectives: d.academicObjectives }, 'Academic Objectives')} saving={saving}>
        <StatementList items={d.academicObjectives} onChange={set('academicObjectives')} />
      </Section>
    </Layout>
  );
}

/**
 * ImportReview — shows the parser's detected sections and lets the admin
 * confirm/edit/remove items before applying. Detection is imperfect by design,
 * so this human-review step is the safety net (nothing is applied without it).
 *
 * The parser emits keys: instituteVision/instituteMission (ignored here — this
 * is a department screen), vision, mission, programOutcomes,
 * programSpecificOutcomes, peos, wks, academicObjectives, plus 'unmatched'.
 */
const FIELD_LABELS = {
  vision: 'Department Vision', mission: 'Department Mission',
  programOutcomes: 'Program Outcomes (PO)', programSpecificOutcomes: 'Program Specific Outcomes (PSO)',
  peos: 'PEOs', wks: 'Knowledge & Attitude Profile (WK)', academicObjectives: 'Academic Objectives',
};
const DEPT_FIELDS = Object.keys(FIELD_LABELS);

function ImportReview({ data, onApply, onCancel }) {
  // Build editable local copy: only department-relevant detected sections.
  const initial = {};
  DEPT_FIELDS.forEach((f) => { if (data.sections?.[f]?.length) initial[f] = { include: true, items: [...data.sections[f]] }; });
  const [state, setState] = useState(initial);

  const detectedDeptKeys = Object.keys(initial);
  const instituteDetected = (data.sections?.instituteVision?.length || data.sections?.instituteMission?.length);

  const setItem = (field, i, v) => setState({ ...state, [field]: { ...state[field], items: state[field].items.map((x, j) => j === i ? v : x) } });
  const removeItem = (field, i) => setState({ ...state, [field]: { ...state[field], items: state[field].items.filter((_, j) => j !== i) } });
  const toggle = (field) => setState({ ...state, [field]: { ...state[field], include: !state[field].include } });

  const apply = () => {
    const applied = {};
    for (const f of DEPT_FIELDS) {
      if (state[f]?.include && state[f].items.length) applied[f] = state[f].items.filter((t) => t.trim());
    }
    onApply(applied);
  };

  return (
    <Card style={{ border: '2px solid var(--accent,#2e5faa)' }}>
      <div className="spread">
        <strong>Review detected sections</strong>
        <div className="row" style={{ gap: 8 }}>
          <button className="primary sm" onClick={apply}>Apply selected</button>
          <button className="sm" onClick={onCancel}>Cancel</button>
        </div>
      </div>
      <p className="muted" style={{ fontSize: '0.78rem' }}>
        Detection is automatic and may be imperfect — review each section, edit or remove items, and untick anything you don’t want. Applying appends to existing entries (PO/PSO map onto their fixed IDs in order).
      </p>
      {instituteDetected ? <Banner kind="info">Institute Vision/Mission were also detected — set those on the Institute settings page (this screen is for the department).</Banner> : null}

      {detectedDeptKeys.length === 0 && <Banner kind="warn">No department-level sections were detected in this document. You can still enter statements manually below, or try a document with clearer headings.</Banner>}

      {detectedDeptKeys.map((f) => (
        <div key={f} style={{ borderTop: '1px solid var(--line-soft,#eee)', paddingTop: 10, marginTop: 10 }}>
          <label className="row" style={{ gap: 8, marginBottom: 6 }}>
            <input type="checkbox" checked={state[f].include} onChange={() => toggle(f)} />
            <strong>{FIELD_LABELS[f]}</strong>
            <span className="muted" style={{ fontSize: '0.74rem' }}>({state[f].items.length} detected)</span>
          </label>
          {state[f].include && state[f].items.map((it, i) => (
            <div key={i} className="row" style={{ gap: 6, marginBottom: 4, alignItems: 'flex-start' }}>
              <span className="muted" style={{ fontSize: '0.72rem', minWidth: 20, paddingTop: 8 }}>{i + 1}.</span>
              <textarea rows={2} style={{ flex: 1 }} value={it} onChange={(e) => setItem(f, i, e.target.value)} />
              <button className="ghost sm" onClick={() => removeItem(f, i)} title="Remove">✕</button>
            </div>
          ))}
          {f.startsWith('program') && state[f].include && (
            <p className="muted" style={{ fontSize: '0.72rem' }}>These will fill PO/PSO IDs in order (1st item → {f === 'programOutcomes' ? 'PO1' : 'PSO1'}, etc.). Make sure the order and count are right.</p>
          )}
        </div>
      ))}
    </Card>
  );
}

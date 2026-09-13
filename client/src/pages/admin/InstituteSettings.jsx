import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client.js';
import { Layout, Card, PageHead, Banner, Loading } from '../../components/ui.jsx';

/* Reusable editor for a list of free-text statements (add / edit / remove / reorder). */
export function StatementList({ items, onChange }) {
  const list = items || [];
  const setText = (i, v) => onChange(list.map((s, j) => j === i ? { ...s, text: v } : s));
  const add = () => onChange([...list, { text: '', order: list.length }]);
  const remove = (i) => onChange(list.filter((_, j) => j !== i).map((s, k) => ({ ...s, order: k })));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const copy = [...list];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    onChange(copy.map((s, k) => ({ ...s, order: k })));
  };
  return (
    <div>
      {list.map((s, i) => (
        <div key={i} className="row" style={{ gap: 6, marginBottom: 6, alignItems: 'flex-start' }}>
          <span className="muted" style={{ fontSize: '0.72rem', minWidth: 20, paddingTop: 8 }}>{i + 1}.</span>
          <textarea rows={2} style={{ flex: 1 }} value={s.text} onChange={(e) => setText(i, e.target.value)} />
          <div className="col" style={{ gap: 2 }}>
            <button className="ghost sm" onClick={() => move(i, -1)} disabled={i === 0} title="Move up">↑</button>
            <button className="ghost sm" onClick={() => move(i, 1)} disabled={i === list.length - 1} title="Move down">↓</button>
            <button className="ghost sm" onClick={() => remove(i)} title="Remove">✕</button>
          </div>
        </div>
      ))}
      <button className="sm" onClick={add}>+ Add</button>
      {list.length === 0 && <span className="muted" style={{ fontSize: '0.78rem', marginLeft: 8 }}>None yet.</span>}
    </div>
  );
}

/* Editor for stable-ID outcomes (PO/PSO) — edit text, IDs fixed. */
export function OutcomeList({ items, onChange }) {
  const list = items || [];
  const setText = (i, v) => onChange(list.map((o, j) => j === i ? { ...o, statement: v } : o));
  return (
    <div>
      {list.map((o, i) => (
        <div key={o.key} className="row" style={{ gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
          <span className="tag" style={{ minWidth: 48, marginTop: 6 }}>{o.key}</span>
          <textarea rows={2} style={{ flex: 1 }} value={o.statement} onChange={(e) => setText(i, e.target.value)} />
        </div>
      ))}
      {list.length === 0 && <span className="muted" style={{ fontSize: '0.78rem' }}>None.</span>}
    </div>
  );
}

export function Section({ title, children, onSave, saving, hint }) {
  return (
    <Card>
      <div className="spread" style={{ marginBottom: 8 }}>
        <strong>{title}</strong>
        {onSave && <button className="primary sm" disabled={saving} onClick={onSave}>{saving ? 'Saving…' : 'Save'}</button>}
      </div>
      {hint && <p className="muted" style={{ fontSize: '0.76rem', marginTop: 0 }}>{hint}</p>}
      {children}
    </Card>
  );
}

export default function InstituteSettings() {
  const navigate = useNavigate();
  const [inst, setInst] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => api.get('/admin/institute').then((r) => setInst(r.data.data)).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  if (!inst) return <Layout><Loading /></Layout>;

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(null), 2500); };
  const patch = async (payload, label) => {
    setErr(null); setSaving(true);
    try { const r = await api.patch('/admin/institute', payload); setInst(r.data.data); flash(`${label} saved.`); }
    catch (e) { setErr(e.details?.join('; ') || e.message); }
    finally { setSaving(false); }
  };
  const set = (field) => (val) => setInst({ ...inst, [field]: val });

  const seed = async () => {
    if (!window.confirm('Fill empty institute Vision/Mission from the reference document? Existing entries are kept.')) return;
    setErr(null); setSaving(true);
    try { const r = await api.post('/admin/institute/seed'); setInst(r.data.data); flash('Seeded from reference document.'); }
    catch (e) { setErr(e.message); } finally { setSaving(false); }
  };

  return (
    <Layout>
      <PageHead title="Institute settings" sub="Institution-wide details. Program outcomes (PO/PSO/PEO/WK) are under each Department."
        action={<div className="row" style={{ gap: 8 }}>
          <button onClick={() => navigate('/admin')}>← Admin</button>
          <button onClick={() => navigate('/admin/departments')}>Departments →</button>
          <button onClick={seed} disabled={saving}>Seed V/M from document</button>
        </div>} />
      <Banner kind="err">{err}</Banner>
      {msg && <Banner kind="ok">{msg}</Banner>}

      <Section title="Institute name" onSave={() => patch({ name: inst.name }, 'Name')} saving={saving}>
        <input value={inst.name || ''} onChange={(e) => setInst({ ...inst, name: e.target.value })} placeholder="e.g. Canara Engineering College" />
      </Section>

      <Section title="Institute Vision" onSave={() => patch({ vision: inst.vision }, 'Vision')} saving={saving}>
        <StatementList items={inst.vision} onChange={set('vision')} />
      </Section>

      <Section title="Institute Mission" onSave={() => patch({ mission: inst.mission }, 'Mission')} saving={saving}>
        <StatementList items={inst.mission} onChange={set('mission')} />
      </Section>
    </Layout>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client.js';
import { Layout, Card, PageHead, Banner, Loading } from '../../components/ui.jsx';

export default function UserImport() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('bulk');
  return (
    <Layout>
      <PageHead title="Add users" sub="Bulk-import a class list from CSV/Excel, or add a single user."
        action={<button onClick={() => navigate('/admin/users')}>← Users</button>} />
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <button className={tab === 'bulk' ? 'primary' : ''} onClick={() => setTab('bulk')}>Bulk import</button>
        <button className={tab === 'single' ? 'primary' : ''} onClick={() => setTab('single')}>Single add</button>
      </div>
      {tab === 'bulk' ? <BulkImport /> : <SingleAdd />}
    </Layout>
  );
}

/* ================= Bulk import ================= */
function BulkImport() {
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [result, setResult] = useState(null);

  const downloadTemplate = async () => {
    setErr(null);
    try {
      const r = await api.get('/admin/users/import/template', { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url; a.download = 'user_import_template.xlsx';
      a.click(); URL.revokeObjectURL(url);
    } catch (e) { setErr('Could not download template: ' + (e.message || 'error')); }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null); setResult(null); setBusy(true); setPreview(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await api.post('/admin/users/import/preview', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPreview(r.data.data);
    } catch (e2) { setErr(e2.details?.join('; ') || e2.message); }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    if (!preview) return;
    const okRows = preview.rows.filter((r) => r.status === 'ok').map((r) => r.normalized);
    if (!okRows.length) { setErr('No valid rows to import.'); return; }
    setBusy(true); setErr(null);
    try {
      const r = await api.post('/admin/users/import/confirm', { rows: okRows });
      setResult(r.data.data);
      setPreview(null);
      if (r.data.data.credentialsFileBase64) downloadCredentials(r.data.data);
    } catch (e2) { setErr(e2.details?.join('; ') || e2.message); }
    finally { setBusy(false); }
  };

  const downloadCredentials = (data) => {
    const bytes = atob(data.credentialsFileBase64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const blob = new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = data.credentialsFilename || 'credentials.xlsx';
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <div className="row wrap" style={{ gap: 10, marginBottom: 8 }}>
        <button className="sm" onClick={downloadTemplate}>⤓ Download template</button>
        <input id="userImportFile" type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={onFile} />
        <button className="sm primary" onClick={() => document.getElementById('userImportFile')?.click()}>Choose CSV / Excel file</button>
      </div>
      <p className="muted" style={{ fontSize: '0.78rem' }}>
        Columns: name, email, role, department, cohort, and <strong>register number</strong> (students) or
        <strong> employee ID</strong> (faculty/HOD/admin). Passwords are generated automatically — you'll get a credentials sheet after import.
      </p>
      <Banner kind="err">{err}</Banner>
      {busy && <Loading />}

      {preview && (
        <>
          <div className="row wrap" style={{ gap: 12, margin: '10px 0' }}>
            <span className="tag ok">{preview.okCount} ready</span>
            {preview.errorCount > 0 && <span className="tag bad">{preview.errorCount} with errors</span>}
            <span className="muted" style={{ fontSize: '0.8rem' }}>{preview.total} rows parsed</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid var(--line,#ddd)' }}>
                <th style={{ padding: '4px 6px' }}>#</th><th style={{ padding: '4px 6px' }}>Name</th>
                <th style={{ padding: '4px 6px' }}>Email</th><th style={{ padding: '4px 6px' }}>Role</th>
                <th style={{ padding: '4px 6px' }}>Dept</th><th style={{ padding: '4px 6px' }}>Cohort</th>
                <th style={{ padding: '4px 6px' }}>ID</th><th style={{ padding: '4px 6px' }}>Status</th>
              </tr></thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.rowNumber} style={{ borderBottom: '1px solid var(--line-soft,#eee)', background: r.status === 'error' ? 'rgba(220,38,38,0.07)' : undefined }}>
                    <td style={{ padding: '4px 6px' }}>{r.rowNumber}</td>
                    <td style={{ padding: '4px 6px' }}>{r.data.name}</td>
                    <td style={{ padding: '4px 6px' }}>{r.data.email}</td>
                    <td style={{ padding: '4px 6px' }}>{r.data.role}</td>
                    <td style={{ padding: '4px 6px' }}>{r.data.department}</td>
                    <td style={{ padding: '4px 6px' }}>{r.data.cohort}</td>
                    <td style={{ padding: '4px 6px' }}>{r.data.rollNo || r.data.employeeId}</td>
                    <td style={{ padding: '4px 6px' }}>
                      {r.status === 'ok'
                        ? <span className="tag ok" style={{ fontSize: '0.66rem' }}>{r.warnings?.length ? 'ok*' : 'ok'}</span>
                        : <span className="tag bad" style={{ fontSize: '0.66rem' }} title={r.errors.join(' ')}>error</span>}
                      {(r.errors?.length > 0 || r.warnings?.length > 0) && (
                        <div className="muted" style={{ fontSize: '0.68rem', marginTop: 2 }}>{[...r.errors, ...(r.warnings || [])].join(' ')}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <button className="primary" disabled={busy || preview.okCount === 0} onClick={confirm}>
              Import {preview.okCount} valid user{preview.okCount === 1 ? '' : 's'}
            </button>
            {preview.errorCount > 0 && <span className="muted" style={{ fontSize: '0.78rem' }}>Rows with errors are skipped. Fix them in your file and re-upload to include them.</span>}
          </div>
        </>
      )}

      {result && (
        <Banner kind="ok">
          Created {result.createdCount} user{result.createdCount === 1 ? '' : 's'}.
          {result.failedCount > 0 && ` ${result.failedCount} failed.`}
          {result.credentialsFileBase64 && ' The credentials sheet has downloaded — distribute it securely; students must change their password on first login.'}
          {result.failedCount > 0 && (
            <div style={{ marginTop: 6, fontSize: '0.78rem' }}>{result.failed.map((f, i) => <div key={i}>{f.email}: {f.reason}</div>)}</div>
          )}
        </Banner>
      )}
    </Card>
  );
}

/* ================= Single add ================= */
function SingleAdd() {
  const [f, setF] = useState({ name: '', email: '', role: 'student', department: '', cohort: '', rollNo: '', employeeId: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const isStudent = f.role === 'student';

  const submit = async () => {
    setErr(null); setBusy(true); setDone(null);
    try {
      const payload = { ...f };
      if (isStudent) delete payload.employeeId; else delete payload.rollNo;
      const r = await api.post('/admin/users/single', payload);
      setDone(r.data.data);
      setF({ name: '', email: '', role: 'student', department: '', cohort: '', rollNo: '', employeeId: '' });
    } catch (e) { setErr(e.details?.join('; ') || e.message); }
    finally { setBusy(false); }
  };

  return (
    <Card>
      <Banner kind="err">{err}</Banner>
      <div className="grid-2">
        <label>Name<input value={f.name} onChange={set('name')} /></label>
        <label>Email<input value={f.email} onChange={set('email')} /></label>
        <label>Role
          <select value={f.role} onChange={set('role')}>
            <option value="student">Student</option>
            <option value="faculty">Faculty</option>
            <option value="hod">HOD</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label>Department<input value={f.department} onChange={set('department')} /></label>
        {isStudent
          ? <label>Register number<input value={f.rollNo} onChange={set('rollNo')} /></label>
          : <label>Employee ID<input value={f.employeeId} onChange={set('employeeId')} /></label>}
        {isStudent && <label>Cohort<input value={f.cohort} onChange={set('cohort')} placeholder="e.g. 2021-CSE-A" /></label>}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="primary" disabled={busy} onClick={submit}>{busy ? 'Adding…' : 'Add user'}</button>
      </div>
      <p className="muted" style={{ fontSize: '0.76rem', marginTop: 6 }}>A temporary password is generated automatically and shown once after creation.</p>
      {done && (
        <Banner kind="ok">
          Added {done.user.name} ({done.user.email}). Temporary password: <strong>{done.tempPassword}</strong>
          <div className="muted" style={{ fontSize: '0.74rem' }}>Copy this now — it won't be shown again. The user must change it on first login.</div>
        </Banner>
      )}
    </Card>
  );
}

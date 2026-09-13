import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Banner } from '../components/ui.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const u = await login(email, password);
      navigate(u.role === 'admin' ? '/admin' : u.role === 'faculty' ? '/faculty' : '/student');
    } catch (e) {
      setErr(e.message || 'Login failed');
    } finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="fade" style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '2rem' }}>
            Eval<span style={{ color: 'var(--accent)' }}>·</span>AI
          </div>
          <p className="muted" style={{ marginTop: 6 }}>Automated descriptive answer evaluation</p>
        </div>
        <div className="card" style={{ padding: 26 }}>
          <Banner kind="err">{err}</Banner>
          <form onSubmit={submit} className="col">
            <div>
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <div>
              <label>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <button className="primary" disabled={busy} style={{ marginTop: 4 }}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
        <p className="muted" style={{ fontSize: '0.78rem', textAlign: 'center', marginTop: 16, lineHeight: 1.7 }}>
          Demo: admin@demo.edu · faculty@demo.edu · student@demo.edu<br />password = role + 123 (e.g. admin123)
        </p>
      </div>
    </div>
  );
}

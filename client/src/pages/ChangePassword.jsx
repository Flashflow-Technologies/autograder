import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Layout, Card, PageHead, Banner } from '../components/ui.jsx';

/**
 * Change-password screen. Serves two cases:
 *  - Forced first-login change (user.mustChangePassword): shown automatically,
 *    with an explanatory banner; the app is gated until this completes.
 *  - Voluntary change from settings.
 */
export default function ChangePassword() {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const forced = !!user?.mustChangePassword;

  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setErr(null);
    if (newPassword.length < 8) { setErr('New password must be at least 8 characters.'); return; }
    if (newPassword !== confirm) { setErr('New password and confirmation do not match.'); return; }
    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      await refreshUser(); // clears mustChangePassword in app state
      setDone(true);
      setTimeout(() => navigate('/'), 1200);
    } catch (e) {
      setErr(e.details?.join('; ') || e.message);
    } finally { setBusy(false); }
  };

  return (
    <Layout>
      <PageHead title={forced ? 'Set your password' : 'Change password'}
        sub={forced ? 'Your account uses a temporary password. Please set a new one to continue.' : 'Update your account password.'} />
      <Card>
        {forced && <Banner kind="info">For security, you must change the temporary password you were given before using the system.</Banner>}
        {done ? (
          <Banner kind="ok">Password changed. Redirecting…</Banner>
        ) : (
          <>
            <Banner kind="err">{err}</Banner>
            <div className="col" style={{ maxWidth: 380 }}>
              <label>{forced ? 'Temporary password' : 'Current password'}
                <input type="password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
              </label>
              <label>New password
                <input type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} autoComplete="new-password" />
              </label>
              <label>Confirm new password
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
              </label>
              <p className="muted" style={{ fontSize: '0.76rem', margin: 0 }}>At least 8 characters, and different from your current password.</p>
              <div className="row" style={{ gap: 8 }}>
                <button className="primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Set new password'}</button>
                {forced && <button className="ghost" onClick={logout}>Sign out</button>}
              </div>
            </div>
          </>
        )}
      </Card>
    </Layout>
  );
}

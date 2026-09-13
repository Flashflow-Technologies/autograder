import { useAuth } from '../context/AuthContext.jsx';
import { Link, useLocation } from 'react-router-dom';

export function Layout({ children, nav }) {
  const { user, logout } = useAuth();
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ borderBottom: '1px solid var(--line)', background: 'var(--paper-raised)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '14px 24px' }} className="spread">
          <div className="row" style={{ gap: 16 }}>
            <Link to="/" style={{ textDecoration: 'none' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.15rem', color: 'var(--ink)' }}>
                Eval<span style={{ color: 'var(--accent)' }}>·</span>AI
              </span>
            </Link>
            <span className="tag" style={{ textTransform: 'capitalize' }}>{user?.role}</span>
          </div>
          <div className="row" style={{ gap: 14 }}>
            {nav}
            <span className="muted" style={{ fontSize: '0.85rem' }}>{user?.name}</span>
            <button className="ghost sm" onClick={logout}>Sign out</button>
          </div>
        </div>
      </header>
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px', width: '100%', flex: 1 }} className="fade">
        {children}
      </main>
    </div>
  );
}

export function NavLink({ to, children }) {
  const loc = useLocation();
  const active = loc.pathname === to || (to !== '/' && loc.pathname.startsWith(to));
  return (
    <Link to={to} style={{
      fontSize: '0.88rem', color: active ? 'var(--ink)' : 'var(--ink-faint)',
      fontWeight: active ? 600 : 400, textDecoration: 'none',
      borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent', paddingBottom: 2,
    }}>{children}</Link>
  );
}

export function Loading({ label = 'Loading…' }) {
  return <div style={{ padding: 40, textAlign: 'center' }} className="muted">{label}</div>;
}

export function Banner({ kind = 'info', children }) {
  if (!children) return null;
  return <div className={`banner ${kind}`}>{children}</div>;
}

export function Card({ children, style }) {
  return <div className="card" style={{ padding: 18, ...style }}>{children}</div>;
}

export function PageHead({ title, sub, action }) {
  return (
    <div className="spread wrap" style={{ marginBottom: 22, gap: 12 }}>
      <div>
        <h1>{title}</h1>
        {sub && <p className="muted" style={{ marginTop: 4 }}>{sub}</p>}
      </div>
      {action}
    </div>
  );
}

const RBTL_INFO = { L1: 'Remember', L2: 'Understand', L3: 'Apply', L4: 'Analyse', L5: 'Evaluate', L6: 'Create' };
export function Tags({ co, rbtl, marks }) {
  return (
    <span className="row" style={{ gap: 5, display: 'inline-flex' }}>
      {co && <span className="tag co">{co}</span>}
      {rbtl && <span className="tag rbtl" title={RBTL_INFO[rbtl]}>{rbtl}</span>}
      {marks != null && <span className="tag">{marks}m</span>}
    </span>
  );
}

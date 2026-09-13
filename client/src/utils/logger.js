// Ships client-side errors to the backend so they land in the same Winston
// logs as server errors. Fails silently (never throws) and never loops.
let lastSent = 0;

export function logClientError(message, { stack, level = 'error', context } = {}) {
  // crude throttle so a render loop can't spam the endpoint
  const now = Date.now();
  if (now - lastSent < 500) return;
  lastSent = now;

  // Always mirror to the browser console for local debugging
  // eslint-disable-next-line no-console
  (level === 'warn' ? console.warn : console.error)('[client]', message, context || '', stack || '');

  try {
    fetch('/api/client-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: String(message), stack, url: window.location.href, level, context }),
      keepalive: true, // allow the report to send even during navigation
    }).catch(() => {}); // never let logging failure surface
  } catch {
    /* ignore */
  }
}

// Install global handlers once at app start
export function installGlobalErrorLogging() {
  window.addEventListener('error', (e) => {
    logClientError(e.message || 'Uncaught error', { stack: e.error?.stack, context: { type: 'window.onerror' } });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    logClientError(reason?.message || 'Unhandled promise rejection', {
      stack: reason?.stack,
      context: { type: 'unhandledrejection' },
    });
  });
}

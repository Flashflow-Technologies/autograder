import { useState, useEffect } from 'react';
import api from '../api/client.js';

/**
 * Renders an image that lives behind an authenticated API route. A plain <img
 * src> can't send the JWT Authorization header, so we fetch the bytes as a blob
 * (via the api client, which attaches the token) and render an object URL.
 *
 * `path` is relative to the api baseURL (e.g. "/question-image/<id>" or
 * "/submissions/<examId>/question-image/<id>").
 */
export default function AuthImage({ path, alt = '', style }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revoked = false;
    let objectUrl = null;
    setUrl(null); setFailed(false);
    api.get(path, { responseType: 'blob' })
      .then((res) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(res.data);
        setUrl(objectUrl);
      })
      .catch(() => { if (!revoked) setFailed(true); });
    return () => { revoked = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [path]);

  if (failed) return <span className="muted" style={{ fontSize: '0.72rem' }}>[image unavailable]</span>;
  if (!url) return <span className="muted" style={{ fontSize: '0.72rem' }}>loading image…</span>;
  return <img src={url} alt={alt} style={style} />;
}

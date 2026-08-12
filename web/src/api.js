// Single tiny API client. Everything goes through /api which Caddy
// proxies to the api container (or Vite proxies in dev).

async function request(path, options) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!res.ok) {
    let msg = res.status + ' ' + res.statusText;
    try {
      const body = await res.json();
      if (body.error) msg = body.error;
    } catch (e) {
      /* not json */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body || {}) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body || {}) }),
  del: (path) => request(path, { method: 'DELETE' })
};

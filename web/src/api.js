// Single tiny API client. Everything goes through /api which Caddy
// proxies to the api container (or Vite proxies in dev).

async function request(path, options) {
  const opts = { ...(options || {}) };
  const headers = { ...(opts.headers || {}) };

  // Only declare a JSON body when we actually send one. Fastify rejects
  // a request carrying content-type: application/json with an empty body,
  // which is what broke DELETE (and any other bodyless call).
  if (opts.body != null) headers['Content-Type'] = 'application/json';
  opts.headers = headers;

  const res = await fetch('/api' + path, opts);
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
  post: (path, body) =>
    request(path, { method: 'POST', body: body == null ? undefined : JSON.stringify(body) }),
  patch: (path, body) =>
    request(path, { method: 'PATCH', body: body == null ? undefined : JSON.stringify(body) }),
  put: (path, body) =>
    request(path, { method: 'PUT', body: body == null ? undefined : JSON.stringify(body) }),
  del: (path) => request(path, { method: 'DELETE' })
};

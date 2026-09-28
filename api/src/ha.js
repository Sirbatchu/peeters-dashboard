// Shared Home Assistant client. The tablets only ever talk to us; the HA
// token stays server-side. Everything degrades gracefully when HA_TOKEN is
// unset so the dashboard works before HA is configured.

export const HA_URL = process.env.HA_URL || 'http://host.docker.internal:8123';

export const configured = () => Boolean(process.env.HA_TOKEN);

export async function ha(path, options = {}) {
  const res = await fetch(`${HA_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.HA_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers
    },
    signal: AbortSignal.timeout(15_000)
  });
  if (!res.ok) throw new Error(`HA ${path} -> ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** Call an HA service, e.g. callService('notify', 'send_message', {...}). */
export const callService = (domain, service, data) =>
  ha(`/api/services/${domain}/${service}`, { method: 'POST', body: JSON.stringify(data) });

/** Speak on an Echo via the Alexa Devices integration's notify entity. */
export const speak = (entityId, message) =>
  callService('notify', 'send_message', { entity_id: entityId, message });

/** HA device id behind an entity (Alexa text commands need the device). */
export async function deviceIdFor(entityId) {
  const res = await fetch(`${HA_URL}/api/template`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.HA_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ template: `{{ device_id('${entityId.replace(/[^a-z0-9_.]/g, '')}') }}` }),
    signal: AbortSignal.timeout(15_000)
  });
  if (!res.ok) throw new Error(`HA template -> ${res.status}`);
  const id = (await res.text()).trim();
  if (!id || id === 'None') throw new Error(`no device for ${entityId}`);
  return id;
}

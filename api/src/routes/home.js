// Bridge to Home Assistant. The iPad only ever talks to us; we hold the
// HA token server-side. Every feature degrades gracefully when HA_TOKEN
// is unset so the dashboard works before HA is configured.

const HA_URL = process.env.HA_URL || 'http://host.docker.internal:8123';

const configured = () => Boolean(process.env.HA_TOKEN);

async function ha(path, options = {}) {
  const res = await fetch(`${HA_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.HA_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers
    },
    signal: AbortSignal.timeout(10_000)
  });
  if (!res.ok) throw new Error(`HA ${path} -> ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export default async function routes(app) {
  app.get('/home/status', async () => {
    if (!configured()) return { configured: false, ok: false };
    try {
      await ha('/api/');
      return { configured: true, ok: true };
    } catch {
      return { configured: true, ok: false };
    }
  });

  // Media players (Sonos rooms show up here once the integration is added).
  app.get('/home/players', async (req, reply) => {
    if (!configured()) return [];
    const states = await ha('/api/states');
    return states
      .filter((s) => s.entity_id.startsWith('media_player.'))
      .map((s) => ({
        entity_id: s.entity_id,
        name: s.attributes.friendly_name || s.entity_id,
        state: s.state,
        volume: s.attributes.volume_level ?? null,
        media_title: s.attributes.media_title ?? null,
        media_artist: s.attributes.media_artist ?? null
      }));
  });

  // Generic media commands: play, pause, next, previous, volume
  app.post('/home/players/:entity/:command', async (req, reply) => {
    if (!configured()) return reply.status(503).send({ error: 'HA not configured' });
    const { entity, command } = req.params;
    const entity_id = `media_player.${entity.replace(/^media_player\./, '')}`;

    const services = {
      play: ['media_play', {}],
      pause: ['media_pause', {}],
      next: ['media_next_track', {}],
      previous: ['media_previous_track', {}],
      volume: ['volume_set', { volume_level: Number(req.body?.volume ?? 0.3) }]
    };
    const svc = services[command];
    if (!svc) return reply.status(400).send({ error: `unknown command ${command}` });

    await ha(`/api/services/media_player/${svc[0]}`, {
      method: 'POST',
      body: JSON.stringify({ entity_id, ...svc[1] })
    });
    return { ok: true };
  });

  // Text-to-speech announcement through a speaker ("Dinner in five minutes!")
  app.post('/home/announce', async (req, reply) => {
    if (!configured()) return reply.status(503).send({ error: 'HA not configured' });
    const { entity_id, message } = req.body || {};
    if (!entity_id || !message) {
      return reply.status(400).send({ error: 'entity_id and message required' });
    }
    await ha('/api/services/tts/speak', {
      method: 'POST',
      body: JSON.stringify({
        entity_id: 'tts.home_assistant_cloud',
        media_player_entity_id: entity_id,
        message
      })
    }).catch(async () => {
      // Fall back to the built-in Google Translate TTS if no cloud TTS.
      await ha('/api/services/tts/google_translate_say', {
        method: 'POST',
        body: JSON.stringify({ entity_id, message })
      });
    });
    return { ok: true };
  });

  // Fire any HA script/scene by id — the hook Alexa emulated-hue also uses.
  app.post('/home/scenes/:scene', async (req, reply) => {
    if (!configured()) return reply.status(503).send({ error: 'HA not configured' });
    await ha('/api/services/script/turn_on', {
      method: 'POST',
      body: JSON.stringify({ entity_id: `script.${req.params.scene}` })
    });
    return { ok: true };
  });
}

import { q } from '../db.js';

// wttr.in is flaky and rate-limited; cache server-side so a wall of retries
// from the iPad can never hammer it. One fetch per 15 minutes max.
let weatherCache = { at: 0, data: null };
const WEATHER_TTL = 15 * 60 * 1000;

export default async function routes(app) {
  app.get('/health', async () => ({ ok: true }));

  app.get('/weather', async (req, reply) => {
    if (Date.now() - weatherCache.at < WEATHER_TTL && weatherCache.data) {
      return weatherCache.data;
    }
    try {
      const loc = encodeURIComponent(process.env.WEATHER_LOC || 'Bristol');
      const res = await fetch(`https://wttr.in/${loc}?format=j1`, {
        signal: AbortSignal.timeout(15_000),
        headers: { 'User-Agent': 'peeters-dashboard' }
      });
      if (!res.ok) throw new Error(`wttr.in ${res.status}`);
      const full = await res.json();

      // Ship only what the UI uses — the full payload is ~100KB.
      const current = full.current_condition?.[0] ?? {};
      const data = {
        tempC: Number(current.temp_C),
        feelsLikeC: Number(current.FeelsLikeC),
        code: Number(current.weatherCode),
        desc: current.weatherDesc?.[0]?.value ?? '',
        days: (full.weather || []).slice(0, 3).map((d) => ({
          date: d.date,
          maxC: Number(d.maxtempC),
          minC: Number(d.mintempC),
          code: Number(d.hourly?.[4]?.weatherCode ?? 113)
        }))
      };
      weatherCache = { at: Date.now(), data };
      return data;
    } catch (err) {
      req.log.warn(`weather fetch failed: ${err.message}`);
      if (weatherCache.data) return weatherCache.data; // stale beats nothing
      return reply.status(502).send({ error: 'weather unavailable' });
    }
  });

  // ── Birthdays (migrated from localStorage) ──
  app.get('/birthdays', async () => {
    const { rows } = await q('SELECT * FROM birthdays ORDER BY month, day');
    return rows;
  });

  app.post('/birthdays', async (req, reply) => {
    const { name, day, month, birth_year } = req.body || {};
    if (!name || !day || !month) {
      return reply.status(400).send({ error: 'name, day, month required' });
    }
    const { rows } = await q(
      'INSERT INTO birthdays (name, day, month, birth_year) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, day, month, birth_year || null]
    );
    return reply.status(201).send(rows[0]);
  });

  app.delete('/birthdays/:id', async (req, reply) => {
    await q('DELETE FROM birthdays WHERE id = $1', [req.params.id]);
    return reply.status(204).send();
  });
}

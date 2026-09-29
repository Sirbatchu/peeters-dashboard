// Alexa morning briefing, "Alexa, bedtime", and the Next-up strip feed.
//
// Speech goes out through Home Assistant's Alexa Devices integration:
// notify.<echo>_speak entities for talking, alexa_devices.send_text_command
// for "play ..." style commands. Voice *in* ("Alexa, bedtime") arrives via
// HA's emulated Hue bridge -> script.bedtime -> POST /api/bedtime here.
import { q, today } from '../db.js';
import { eventsBetween } from './events.js';
import { configured, ha, speak, callService, deviceIdFor } from '../ha.js';

const TZ = process.env.TZ || 'Europe/London';

// ── Small helpers ──────────────────────────────────────────────

async function getSettings() {
  const { rows } = await q('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

async function setSetting(key, value) {
  await q(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, String(value)]
  );
}

/** Tell every screen to dim (1) or brighten (0). Screens poll settings. */
const sendDim = (state) => setSetting('dim_command', JSON.stringify({ state, at: Date.now() }));

/** Local midnight today (+offset days) as a Date, computed by Postgres in TZ. */
async function localMidnight(offsetDays = 0) {
  const { rows } = await q(
    `SELECT ((date_trunc('day', now() AT TIME ZONE $1) + make_interval(days => $2::int))
             AT TIME ZONE $1) AS t`,
    [TZ, offsetDays]
  );
  return new Date(rows[0].t);
}

const parts = (d, opts) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...opts }).format(d);

/** "4:30 pm", or "4 pm" on the hour — reads naturally aloud. */
function sayTime(iso) {
  return parts(new Date(iso), { hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(':00', '')
    .replace(/\s?([ap])\.?m\.?/i, ' $1m');
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** "Monday the 28th of September" */
function sayDate(d) {
  const wd = parts(d, { weekday: 'long' });
  const day = Number(parts(d, { day: 'numeric' }));
  const month = parts(d, { month: 'long' });
  return `${wd} the ${ordinal(day)} of ${month}`;
}

const firstName = (label) => String(label || '').split(' ')[0];

/** Local HH:MM and ISO weekday (Mon=1) right now. */
function nowLocal() {
  const hm = parts(new Date(), { hour: '2-digit', minute: '2-digit', hour12: false });
  const wd = parts(new Date(), { weekday: 'short' });
  const iso = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[wd];
  return { hm, iso };
}

const toMins = (hm) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// ── Birthdays ──────────────────────────────────────────────────

/** Birthdays in the next `within` days, soonest first, with age if known. */
async function upcomingBirthdays(within = 30) {
  const { rows } = await q('SELECT * FROM birthdays');
  const t = today(); // YYYY-MM-DD local
  const [ty, tm, td] = t.split('-').map(Number);
  const todayUTC = Date.UTC(ty, tm - 1, td);
  return rows
    .map((b) => {
      let year = ty;
      let next = Date.UTC(year, b.month - 1, b.day);
      if (next < todayUTC) next = Date.UTC(++year, b.month - 1, b.day);
      const days = Math.round((next - todayUTC) / 864e5);
      return {
        id: b.id,
        name: b.name,
        days,
        date: new Date(next).toISOString().slice(0, 10),
        turning: b.birth_year ? year - b.birth_year : null
      };
    })
    .filter((b) => b.days <= within)
    .sort((a, b) => a.days - b.days);
}

// ── Briefing ───────────────────────────────────────────────────

async function weather() {
  try {
    const res = await fetch('http://127.0.0.1:3000/api/weather', {
      signal: AbortSignal.timeout(20_000)
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export async function composeBriefing() {
  const s = await getSettings();
  const start = await localMidnight(0);
  const end = new Date((await localMidnight(1)).getTime() - 1000);
  const [evs, bdays, w, meal, notes] = await Promise.all([
    eventsBetween(start.toISOString(), end.toISOString()),
    upcomingBirthdays(7),
    weather(),
    q('SELECT title FROM meals WHERE day = $1::date', [today()]),
    q(
      `SELECT n.body, c.label FROM notes n LEFT JOIN calendars c ON c.slug = n.author
        WHERE n.pinned ORDER BY n.created_at DESC LIMIT 3`
    )
  ]);

  const out = [];
  const hour = Number(parts(new Date(), { hour: 'numeric', hour12: false }));
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  out.push(`${greet}, Peeters family! It's ${sayDate(new Date())}.`);

  if (w && Number.isFinite(w.tempC)) {
    const hi = w.days && w.days[0] ? `, with a high of ${w.days[0].maxC}` : '';
    out.push(`It's ${w.tempC} degrees and ${String(w.desc || '').trim().toLowerCase()}${hi}.`);
  }

  if (evs.length) {
    const lines = evs.map((e) => {
      const who = e.calendar === 'family' ? 'The family' : firstName(e.calendar_label);
      const when = e.all_day ? '' : ` at ${sayTime(e.starts_at)}`;
      return `${who} has ${e.title}${when}.`;
    });
    out.push(`Today, ${lines.join(' ')}`);
  } else {
    out.push('Nothing on the calendar today.');
  }

  for (const b of bdays) {
    if (b.days === 0) {
      out.push(`It's ${b.name}'s birthday today${b.turning ? `, turning ${b.turning}` : ''}. Happy birthday!`);
    } else {
      out.push(`${b.name}'s birthday is ${b.days === 1 ? 'tomorrow' : `in ${b.days} days`}.`);
    }
  }

  if (meal.rows.length) out.push(`Tonight's dinner is ${meal.rows[0].title}.`);

  for (const n of notes.rows) {
    // Notes are typed casually; without a full stop Alexa runs straight on
    // into the next sentence with no pause.
    const body = /[.!?]$/.test(n.body.trim()) ? n.body.trim() : `${n.body.trim()}.`;
    out.push(n.label ? `A note from ${firstName(n.label)}: ${body}` : `A note: ${body}`);
  }

  const { iso } = nowLocal();
  if ((s.school_days || '12345').includes(String(iso)) && s.morning_leave && hour < 12) {
    out.push(`Leave for school at ${sayClock(s.morning_leave)}.`);
  }

  out.push('Have a great day!');
  return out.join(' ');
}

/** "08:30" -> "8:30 am" without going through Date/timezones. */
function sayClock(hm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(hm);
  if (!m) return hm;
  const h = Number(m[1]);
  const mm = m[2];
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}${mm === '00' ? '' : ':' + mm} ${h < 12 ? 'am' : 'pm'}`;
}

async function playBriefing(target) {
  const s = await getSettings();
  const entity = target || s.briefing_target || 'notify.kitchen_speak';
  const text = await composeBriefing();
  await speak(entity, text);
  return { text, target: entity };
}

// ── Bedtime ────────────────────────────────────────────────────

/**
 * Dim every screen, say goodnight, then start wind-down music. Audio runs in
 * the background so HA's rest_command (10s timeout) gets a fast reply.
 */
async function runBedtime(log) {
  await sendDim(1);
  const s = await getSettings();
  const target = s.bedtime_target || 'notify.bedroom_speak';
  if (!configured()) return { dimmed: true, audio: 'HA not configured' };

  (async () => {
    try {
      if (s.bedtime_message) await speak(target, s.bedtime_message);
      if (s.bedtime_command) {
        // Let the goodnight message finish before the music starts.
        await new Promise((r) => setTimeout(r, 7000));
        const device_id = await deviceIdFor(target);
        await callService('alexa_devices', 'send_text_command', {
          device_id,
          text_command: s.bedtime_command
        });
      }
    } catch (err) {
      log.warn(`bedtime audio failed: ${err.message}`);
    }
  })();

  return { dimmed: true, audio: 'started', target };
}

// ── Scheduler ──────────────────────────────────────────────────

let ticking = false;
async function tick(log) {
  if (ticking || !configured()) return;
  ticking = true;
  try {
    const s = await getSettings();
    if (s.briefing_enabled !== '1') return;
    const { hm, iso } = nowLocal();
    if (!(s.briefing_days || '12345').includes(String(iso))) return;
    const due = toMins(s.briefing_time || '07:15');
    const now = toMins(hm);
    // 15-minute window so a restart or a slow tick never skips the day.
    if (due === null || now < due || now > due + 15) return;
    const day = today();
    if (s.briefing_last === day) return;
    await setSetting('briefing_last', day); // claim first: never speak twice
    await sendDim(0); // wake the screens with the house
    const r = await playBriefing();
    log.info(`briefing sent to ${r.target}`);
  } catch (err) {
    log.warn(`briefing failed: ${err.message}`);
  } finally {
    ticking = false;
  }
}

// ── Routes ─────────────────────────────────────────────────────

export default async function routes(app) {
  const timer = setInterval(() => tick(app.log), 30_000);
  app.addHook('onClose', async () => clearInterval(timer));

  // Echos HA can talk to (Alexa Devices notify entities).
  app.get('/alexa/devices', async () => {
    if (!configured()) return [];
    const states = await ha('/api/states');
    return states
      .filter((s) => /^notify\..+_(speak|announce)$/.test(s.entity_id))
      .map((s) => ({
        entity_id: s.entity_id,
        name: s.attributes.friendly_name || s.entity_id,
        kind: s.entity_id.endsWith('_speak') ? 'speak' : 'announce',
        available: s.state !== 'unavailable'
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  app.get('/briefing/preview', async () => ({ text: await composeBriefing() }));

  app.post('/briefing/play', async (req, reply) => {
    if (!configured()) return reply.status(503).send({ error: 'Home Assistant not linked' });
    return playBriefing(req.body?.target);
  });

  // Hit by Home Assistant's script.bedtime (voice) and the dashboard button.
  app.post('/bedtime', async (req) => runBedtime(req.log));

  app.post('/wake', async () => {
    await sendDim(0);
    return { dimmed: false };
  });

  // Everything the Next-up strip needs, in one call.
  app.get('/upcoming', async () => {
    const now = new Date();
    const horizon = new Date(now.getTime() + 14 * 864e5);
    const [evs, bdays, notes] = await Promise.all([
      eventsBetween(now.toISOString(), horizon.toISOString()),
      upcomingBirthdays(30),
      q(
        `SELECT n.id, n.body, n.author, c.label AS author_label, c.colour
           FROM notes n LEFT JOIN calendars c ON c.slug = n.author
          WHERE n.pinned ORDER BY n.created_at DESC LIMIT 3`
      )
    ]);
    return {
      events: evs
        .filter((e) => new Date(e.ends_at) >= now)
        .slice(0, 4)
        .map((e) => ({
          id: e.id,
          title: e.title,
          calendar: e.calendar,
          who: e.calendar_label,
          colour: e.colour,
          starts_at: e.starts_at,
          ends_at: e.ends_at,
          all_day: e.all_day
        })),
      birthdays: bdays.slice(0, 3),
      notes: notes.rows
    };
  });
}

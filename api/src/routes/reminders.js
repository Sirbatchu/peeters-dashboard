import { q, today } from '../db.js';

// Recurring reminders (bins, PE kit, ...). Each one falls on a weekday,
// every week or every other week. They show on the Next-up strip from noon
// the day before until noon on the day, are spoken by Alexa the evening
// before (alexa.js) and again in the morning briefing.

const DAY = 864e5;
const WEEKDAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** 'YYYY-MM-DD' + n days. Works in UTC so DST never shifts the date. */
export function addDays(ds, n) {
  return new Date(Date.parse(ds + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
}

/** ISO weekday of a 'YYYY-MM-DD' date, Mon=1 .. Sun=7. */
function isoDay(ds) {
  return ((new Date(ds + 'T00:00:00Z').getUTCDay() + 6) % 7) + 1;
}

/** Does reminder r fall on date ds? anchor is a date it definitely falls on. */
function occurs(r, ds) {
  if (isoDay(ds) !== r.weekday) return false;
  if (r.every_weeks === 1 || !r.anchor) return true;
  const weeks = Math.round((Date.parse(ds) - Date.parse(r.anchor)) / (7 * DAY));
  return ((weeks % r.every_weeks) + r.every_weeks) % r.every_weeks === 0;
}

function nextDate(r, from) {
  for (let i = 0; i < 7 * r.every_weeks; i++) {
    const ds = addDays(from, i);
    if (occurs(r, ds)) return ds;
  }
  return null;
}

async function active() {
  const { rows } = await q('SELECT * FROM reminders WHERE active ORDER BY weekday, label');
  return rows;
}

/** Reminders falling on a date. */
export async function remindersOn(ds) {
  return (await active()).filter((r) => occurs(r, ds));
}

/** "Recycling bin and Refuse bin" */
export function sayList(rs) {
  const names = rs.map((r) => r.label);
  return names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0] || '';
}

/** Local hour (0-23) in the house's timezone. */
function localHour() {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: process.env.TZ || 'Europe/London',
      hour: 'numeric',
      hour12: false
    }).format(new Date())
  );
}

/** What the Next-up strip shows right now: today's until noon, tomorrow's after. */
export async function remindersNow() {
  const t = today();
  const pm = localHour() >= 12;
  const ds = pm ? addDays(t, 1) : t;
  return (await remindersOn(ds)).map((r) => ({
    id: r.id,
    label: r.label,
    emoji: r.emoji,
    when: pm ? 'tomorrow' : 'today'
  }));
}

export default async function routes(app) {
  await q(`CREATE TABLE IF NOT EXISTS reminders (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label       TEXT NOT NULL,
    emoji       TEXT NOT NULL DEFAULT '🔔',
    weekday     INT  NOT NULL CHECK (weekday BETWEEN 1 AND 7),
    every_weeks INT  NOT NULL DEFAULT 1 CHECK (every_weeks IN (1, 2)),
    anchor      DATE,
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  // Bins: Monday mornings. Recycling every week; refuse every other week,
  // and 12 Oct 2026 was a refuse week. Seeded once.
  const { rowCount: seeded } = await q("SELECT 1 FROM settings WHERE key = 'reminders_seeded_v1'");
  if (!seeded) {
    await q(
      `INSERT INTO reminders (label, emoji, weekday, every_weeks, anchor) VALUES
         ('Recycling bin', '♻️', 1, 1, NULL),
         ('Refuse bin', '🗑️', 1, 2, '2026-10-12')`
    );
    await q("INSERT INTO settings (key, value) VALUES ('reminders_seeded_v1', '1') ON CONFLICT (key) DO NOTHING");
  }

  app.get('/reminders', async () => {
    // After midday today's have been and gone, so "next" looks from tomorrow.
    const t = localHour() >= 12 ? addDays(today(), 1) : today();
    return (await active()).map((r) => ({ ...r, day_name: WEEKDAYS[r.weekday], next: nextDate(r, t) }));
  });

  app.post('/reminders', async (req, reply) => {
    const { label, emoji, weekday, every_weeks, anchor } = req.body || {};
    const text = String(label || '').trim().slice(0, 60);
    const wd = Number(weekday);
    const every = Number(every_weeks) === 2 ? 2 : 1;
    if (!text) return reply.status(400).send({ error: 'Say what to remember' });
    if (!Number.isInteger(wd) || wd < 1 || wd > 7) return reply.status(400).send({ error: 'Pick a day' });
    let start = null;
    if (every === 2) {
      start = /^\d{4}-\d{2}-\d{2}$/.test(String(anchor || '')) ? anchor : null;
      if (!start || isoDay(start) !== wd) {
        return reply.status(400).send({ error: 'Every other week needs a first date on that day' });
      }
    }
    const { rows } = await q(
      `INSERT INTO reminders (label, emoji, weekday, every_weeks, anchor)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [text, String(emoji || '').trim().slice(0, 8) || '🔔', wd, every, start]
    );
    return reply.status(201).send(rows[0]);
  });

  app.delete('/reminders/:id', async (req, reply) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return reply.status(404).send({ error: 'not found' });
    await q('UPDATE reminders SET active = FALSE WHERE id = $1', [req.params.id]);
    return reply.status(204).send();
  });
}

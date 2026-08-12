import nodemailer from 'nodemailer';
import { q } from '../db.js';
import { buildInvite, buildFeed } from '../ics.js';

const smtpConfigured = () => Boolean(process.env.SMTP_HOST && process.env.INVITE_FROM);

/**
 * Expand a recurring event into concrete occurrences within [start, end].
 * Occurrences share the parent id (delete/edit = whole series) and carry
 * occurrence_date so the UI can tell instances apart.
 */
function expand(ev, start, end, cap = 500) {
  if (!ev.recur_freq) return [ev];

  const out = [];
  const duration = new Date(ev.ends_at) - new Date(ev.starts_at);
  const interval = ev.recur_interval || 1;
  const until = ev.recur_until ? new Date(ev.recur_until + 'T23:59:59Z') : null;
  const rangeStart = new Date(start);
  const rangeEnd = new Date(end);

  let cur = new Date(ev.starts_at);
  for (let i = 0; i < cap; i++) {
    if (cur > rangeEnd) break;
    if (until && cur > until) break;
    if (new Date(cur.getTime() + duration) >= rangeStart) {
      out.push({
        ...ev,
        starts_at: cur.toISOString(),
        ends_at: new Date(cur.getTime() + duration).toISOString(),
        occurrence_date: cur.toISOString().slice(0, 10)
      });
    }
    // Month/year stepping uses calendar math so "the 15th" stays the 15th.
    if (ev.recur_freq === 'daily') cur = new Date(cur.getTime() + interval * 864e5);
    else if (ev.recur_freq === 'weekly') cur = new Date(cur.getTime() + interval * 7 * 864e5);
    else {
      const d = new Date(cur);
      if (ev.recur_freq === 'monthly') d.setUTCMonth(d.getUTCMonth() + interval);
      else d.setUTCFullYear(d.getUTCFullYear() + interval);
      cur = d;
    }
  }
  return out;
}

export default async function routes(app) {
  app.get('/calendars', async () => {
    const { rows } = await q('SELECT slug, label, colour FROM calendars ORDER BY slug');
    return rows;
  });

  // Range defaults to a generous window around now so the month grid always fills.
  app.get('/events', async (req) => {
    const start = req.query.start || new Date(Date.now() - 90 * 864e5).toISOString();
    const end = req.query.end || new Date(Date.now() + 365 * 864e5).toISOString();
    const { rows } = await q(
      `SELECT e.*, c.colour, c.label AS calendar_label
         FROM events e
         JOIN calendars c ON c.slug = e.calendar
        WHERE (e.recur_freq IS NOT NULL AND e.starts_at <= $2
               AND (e.recur_until IS NULL OR e.recur_until >= $1::date))
           OR (e.recur_freq IS NULL AND e.ends_at >= $1 AND e.starts_at <= $2)
        ORDER BY e.starts_at`,
      [start, end]
    );
    return rows
      .flatMap((ev) => expand(ev, start, end))
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  });

  app.post('/events', async (req, reply) => {
    const {
      calendar, title, description, location, starts_at, ends_at, all_day,
      recur_freq, recur_interval, recur_until
    } = req.body || {};
    if (!title || !starts_at) {
      return reply.status(400).send({ error: 'title and starts_at are required' });
    }
    const { rows } = await q(
      `INSERT INTO events
         (calendar, title, description, location, starts_at, ends_at, all_day,
          recur_freq, recur_interval, recur_until)
       VALUES ($1, $2, $3, $4, $5::timestamptz, COALESCE($6::timestamptz, $5::timestamptz), COALESCE($7::boolean, FALSE),
               $8, COALESCE($9::int, 1), $10::date)
       RETURNING *`,
      [calendar || 'family', title, description || null, location || null,
       starts_at, ends_at, all_day, recur_freq || null, recur_interval, recur_until || null]
    );
    return reply.status(201).send(rows[0]);
  });

  app.patch('/events/:id', async (req, reply) => {
    const allowed = ['calendar', 'title', 'description', 'location', 'starts_at', 'ends_at', 'all_day', 'recur_freq', 'recur_interval', 'recur_until'];
    const sets = [];
    const vals = [];
    for (const key of allowed) {
      if (req.body && key in req.body) {
        vals.push(req.body[key]);
        sets.push(`${key} = $${vals.length}`);
      }
    }
    if (!sets.length) return reply.status(400).send({ error: 'nothing to update' });
    vals.push(req.params.id);
    const { rows } = await q(
      `UPDATE events SET ${sets.join(', ')}, updated_at = now()
        WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    if (!rows.length) return reply.status(404).send({ error: 'not found' });
    return rows[0];
  });

  app.delete('/events/:id', async (req, reply) => {
    const { rowCount } = await q('DELETE FROM events WHERE id = $1', [req.params.id]);
    if (!rowCount) return reply.status(404).send({ error: 'not found' });
    return reply.status(204).send();
  });

  // Single event as a downloadable .ics
  app.get('/events/:id/ics', async (req, reply) => {
    const { rows } = await q('SELECT * FROM events WHERE id = $1', [req.params.id]);
    if (!rows.length) return reply.status(404).send({ error: 'not found' });
    reply
      .header('Content-Type', 'text/calendar; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="event.ics"`);
    return buildFeed(rows, rows[0].title);
  });

  // Whole calendar as a subscribable feed. Point Google/iOS Calendar at
  // {PUBLIC_URL}/api/calendar.ics to see local events on phones.
  app.get('/calendar.ics', async (req, reply) => {
    const params = [];
    let where = '';
    if (req.query.calendar) {
      params.push(req.query.calendar);
      where = 'WHERE calendar = $1';
    }
    const { rows } = await q(
      `SELECT * FROM events ${where} ORDER BY starts_at`,
      params
    );
    reply.header('Content-Type', 'text/calendar; charset=utf-8');
    return buildFeed(rows);
  });

  app.get('/invites/status', async () => ({ enabled: smtpConfigured() }));

  // Emails a METHOD:REQUEST invitation. Only fires on an explicit request
  // from the UI — nothing here sends mail on its own.
  app.post('/events/:id/invite', async (req, reply) => {
    if (!smtpConfigured()) {
      return reply.status(503).send({ error: 'SMTP not configured; set SMTP_HOST and INVITE_FROM' });
    }
    const emails = (req.body?.emails || []).filter(Boolean);
    if (!emails.length) return reply.status(400).send({ error: 'emails required' });

    const { rows } = await q('SELECT * FROM events WHERE id = $1', [req.params.id]);
    if (!rows.length) return reply.status(404).send({ error: 'not found' });
    const ev = rows[0];

    const organizer = { name: 'Peeters Family', email: process.env.INVITE_FROM };
    const ics = buildInvite(ev, organizer, emails);

    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined
    });

    await transport.sendMail({
      from: `"${organizer.name}" <${organizer.email}>`,
      to: emails.join(', '),
      subject: `Invitation: ${ev.title}`,
      text: [
        ev.title,
        ev.location ? `Where: ${ev.location}` : null,
        `When: ${new Date(ev.starts_at).toLocaleString('en-GB', { timeZone: process.env.TZ })}`,
        ev.description || null
      ]
        .filter(Boolean)
        .join('\n'),
      icalEvent: { method: 'REQUEST', content: ics, filename: 'invite.ics' }
    });

    for (const email of emails) {
      await q('INSERT INTO event_invites (event_id, email) VALUES ($1, $2)', [ev.id, email]);
    }

    return { sent: emails.length };
  });
}

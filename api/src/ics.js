// Minimal RFC 5545 generation. Enough for invites and a subscribable feed,
// without pulling in a dependency.

const PRODID = '-//Peeters Family Dashboard//EN';

function stamp(d) {
  return new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function dateOnly(d) {
  return new Date(d).toISOString().slice(0, 10).replace(/-/g, '');
}

/** Escape per RFC 5545 §3.3.11. */
function esc(text) {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Fold lines at 75 octets, continuation lines start with a space. */
function fold(line) {
  if (line.length <= 75) return line;
  const out = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    out.push(' ' + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest) out.push(' ' + rest);
  return out.join('\r\n');
}

function vevent(ev, { organizer, attendees = [] } = {}) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${ev.id}@peeters.local`,
    `DTSTAMP:${stamp(new Date())}`,
    ev.all_day
      ? `DTSTART;VALUE=DATE:${dateOnly(ev.starts_at)}`
      : `DTSTART:${stamp(ev.starts_at)}`,
    ev.all_day
      ? `DTEND;VALUE=DATE:${dateOnly(ev.ends_at)}`
      : `DTEND:${stamp(ev.ends_at)}`,
    `SUMMARY:${esc(ev.title)}`,
    `SEQUENCE:${ev.sequence ?? 0}`
  ];

  if (ev.description) lines.push(`DESCRIPTION:${esc(ev.description)}`);
  if (ev.location) lines.push(`LOCATION:${esc(ev.location)}`);
  if (organizer) lines.push(`ORGANIZER;CN=${esc(organizer.name)}:mailto:${organizer.email}`);

  for (const a of attendees) {
    lines.push(
      `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a}`
    );
  }

  lines.push('END:VEVENT');
  return lines;
}

/** METHOD:REQUEST — a real invitation the recipient can accept. */
export function buildInvite(ev, organizer, attendees) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    ...vevent(ev, { organizer, attendees }),
    'END:VCALENDAR'
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** METHOD:PUBLISH — a read-only feed phones can subscribe to. */
export function buildFeed(events, name = 'Peeters Family') {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(name)}`,
    'X-PUBLISHED-TTL:PT15M'
  ];
  for (const ev of events) lines.push(...vevent(ev));
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

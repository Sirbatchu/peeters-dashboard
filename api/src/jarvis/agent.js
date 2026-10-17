// J.A.R.V.I.S. for the house: Claude with the dashboard as its toolbox.
//
// Every tool goes through app.inject() into the dashboard's own routes, so
// Jarvis gets exactly the validation and side effects the tablets get (an
// event he adds is on every screen within a poll) and nothing here duplicates
// SQL. Replies are written to be spoken by Alexa: short, no formatting.
import Anthropic from '@anthropic-ai/sdk';
import { q } from '../db.js';
import { eventsBetween } from '../routes/events.js';
import { configured, ha, speak, callService, deviceIdFor } from '../ha.js';

const TZ = process.env.TZ || 'Europe/London';
const MODEL = process.env.JARVIS_MODEL || 'claude-opus-5-5';
const EFFORT = process.env.JARVIS_EFFORT || 'low';
const MAX_ROUNDS = 8;
const TIMERS = ['tidy', 'dressed', 'teeth', 'maths', 'quiet', 'stop'];

let client;
export const jarvisConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

const SYSTEM = `You are J.A.R.V.I.S., the Peeters family's household assistant, in the manner of Tony Stark's AI: a calm, courteous British butler with a dry wit, never smug. You live in the family dashboard on the kitchen wall and people reach you by saying "Alexa, ask Jarvis ...", so every reply is read aloud by an Echo.

How to answer:
- Speak, don't write. One to three short sentences. No lists, markdown, emoji, URLs or symbols.
- Say times the way people do ("half past three", "ten to eight"), dates as "Saturday the 17th". Never read out IDs or raw JSON.
- The household includes children. Keep it warm, kind and suitable for all ages.
- Get the answer from the tools rather than guessing. If you change something (add an event, a shopping item, start a timer), confirm briefly what you did.
- When a request is ambiguous and a sensible default exists, use it and say so; otherwise ask one short question.
- If something is beyond the house's tools, answer from general knowledge where you can, briefly.

Tools you have: the family calendar, shopping list, recurring reminders, dinner plan, pinned notes, weather, the kids' board and its countdown timers, bedtime and screen dimming, media players, phone finder, Home Assistant scripts, and the Echos themselves. For anything Alexa does natively (music, Alexa timers and alarms, smart-home devices Alexa owns), use alexa_command with the words a person would say to Alexa, without the wake word. Those commands and announcements run just after you finish speaking.`;

// ── Time helpers ───────────────────────────────────────────────

const fmt = (d, opts) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...opts }).format(d);

function nowContext() {
  const d = new Date();
  const offset = fmt(d, { timeZoneName: 'longOffset' }).split(' ').pop().replace('GMT', 'UTC');
  return `${fmt(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${fmt(d, {
    hour: '2-digit', minute: '2-digit', hour12: false
  })} (${TZ}, ${offset === 'UTC' ? 'UTC+00:00' : offset})`;
}

/** Local wall-clock "YYYY-MM-DD[THH:MM]" -> ISO instant, via Postgres's tz rules. */
async function localToIso(local) {
  const { rows } = await q('SELECT ($1::timestamp AT TIME ZONE $2) AS t', [local, TZ]);
  return new Date(rows[0].t).toISOString();
}

const sayWhen = (iso, allDay) =>
  allDay
    ? fmt(new Date(iso), { weekday: 'short', day: 'numeric', month: 'short' }) + ' (all day)'
    : fmt(new Date(iso), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

// ── Tools ──────────────────────────────────────────────────────

const obj = (properties = {}, required = []) => ({ type: 'object', properties, required });
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });

const TOOLS = [
  {
    name: 'get_calendar',
    description: 'Family calendar events between two local dates (inclusive). Use for "what\'s on", "am I free", "when is".',
    input_schema: obj({ from: str('YYYY-MM-DD'), to: str('YYYY-MM-DD, same as from for one day') }, ['from', 'to'])
  },
  {
    name: 'add_event',
    description: 'Add an event to the family calendar.',
    input_schema: obj(
      {
        title: str('Short title, e.g. "Dentist"'),
        who: str('Whose event: a first name from the people list, or "family"'),
        start: str('Local start, "YYYY-MM-DDTHH:MM", or "YYYY-MM-DD" for all day'),
        end: str('Local end "YYYY-MM-DDTHH:MM". Omit for one hour.'),
        all_day: { type: 'boolean' },
        location: str('Optional place')
      },
      ['title', 'start']
    )
  },
  { name: 'get_briefing', description: "Today's spoken summary: date, weather, events, birthdays, dinner, notes, reminders.", input_schema: obj() },
  { name: 'get_upcoming', description: 'Next few events, upcoming birthdays (30 days), pinned notes and active reminders.', input_schema: obj() },
  { name: 'get_weather', description: 'Current weather and the next three days.', input_schema: obj() },
  { name: 'get_shopping_list', description: 'Items still on the shopping list.', input_schema: obj() },
  {
    name: 'add_shopping_items',
    description: 'Add one or more items to the shopping list.',
    input_schema: obj({ items: { type: 'array', items: { type: 'string' } } }, ['items'])
  },
  { name: 'get_reminders', description: 'Recurring weekly reminders (bins, PE kit...) and when each is next due.', input_schema: obj() },
  {
    name: 'add_reminder',
    description: 'Add a recurring weekly reminder. It shows on the dashboard and Alexa says it the evening before.',
    input_schema: obj(
      {
        label: str('What to remember, under 60 characters'),
        weekday: { type: 'integer', minimum: 1, maximum: 7, description: 'ISO weekday it falls on, Monday=1' },
        every_other_week: { type: 'boolean' },
        first_date: str('YYYY-MM-DD of a first occurrence on that weekday; required when every_other_week')
      },
      ['label', 'weekday']
    )
  },
  { name: 'get_meals', description: 'Planned dinners for the next 14 days.', input_schema: obj() },
  {
    name: 'add_note',
    description: 'Pin a note to the dashboard (it is also read out in the morning briefing).',
    input_schema: obj({ text: str('The note'), from: str('Optional first name of who it is from') }, ['text'])
  },
  { name: 'get_kids_board', description: "Each child's jobs done today, stars and streak.", input_schema: obj() },
  {
    name: 'start_kids_timer',
    description: 'Start a "Beat the clock" countdown on the Kids board, or "stop" to cancel it.',
    input_schema: obj({ timer: { type: 'string', enum: TIMERS } }, ['timer'])
  },
  { name: 'bedtime', description: 'Run the bedtime routine: dim every screen, say goodnight in the bedroom, start wind-down music.', input_schema: obj() },
  {
    name: 'screens',
    description: 'Dim or brighten every dashboard screen.',
    input_schema: obj({ state: { type: 'string', enum: ['dim', 'bright'] } }, ['state'])
  },
  { name: 'get_media_players', description: 'Speakers and what they are playing.', input_schema: obj() },
  {
    name: 'control_media',
    description: 'Play, pause, skip or set the volume of a speaker.',
    input_schema: obj(
      {
        player: str('entity_id from get_media_players'),
        command: { type: 'string', enum: ['play', 'pause', 'next', 'previous', 'volume'] },
        volume: { type: 'number', minimum: 0, maximum: 1 }
      },
      ['player', 'command']
    )
  },
  {
    name: 'find_phone',
    description: "Make someone's phone ring loudly, even on silent. Pass their name.",
    input_schema: obj({ name: str('Whose phone') }, ['name'])
  },
  { name: 'get_home_scripts', description: 'Home Assistant scripts that can be run.', input_schema: obj() },
  {
    name: 'run_home_script',
    description: 'Run a Home Assistant script by its id from get_home_scripts.',
    input_schema: obj({ script: str('e.g. script.movie_night') }, ['script'])
  },
  { name: 'list_echos', description: 'The Echos Jarvis can speak on or send commands to.', input_schema: obj() },
  {
    name: 'announce',
    description: 'Say a message out loud on an Echo (e.g. "Dinner is ready" upstairs).',
    input_schema: obj({ message: str('What to say'), echo: str('notify entity from list_echos; omit for the usual one') }, ['message'])
  },
  {
    name: 'alexa_command',
    description:
      'Have an Echo carry out an ordinary Alexa request, as if someone said it: e.g. "play Radio 2", "set a timer for 10 minutes", "turn off the lounge lights".',
    input_schema: obj({ command: str('What to say to Alexa, without "Alexa"'), echo: str('notify entity from list_echos; omit for the usual one') }, ['command'])
  }
];

/** Call one of our own routes in-process. */
async function api(app, method, url, payload) {
  const res = await app.inject({ method, url: `/api${url}`, payload });
  const body = res.body ? JSON.parse(res.body) : null;
  if (res.statusCode >= 400) throw new Error(body?.error || `HTTP ${res.statusCode}`);
  return body;
}

async function settings() {
  const { rows } = await q('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

const defaultEcho = (s) => s.jarvis_target || s.briefing_target || 'notify.kitchen_speak';

/**
 * Runs one tool. `ctx.after` collects things that must wait until Alexa has
 * finished speaking (an Echo can't take a command mid-sentence).
 */
async function runTool(app, ctx, name, input) {
  switch (name) {
    case 'get_calendar': {
      const { rows } = await q(
        `SELECT ($1::date::timestamp AT TIME ZONE $3) AS s, (($2::date + 1)::timestamp AT TIME ZONE $3) AS e`,
        [input.from, input.to, TZ]
      );
      const evs = await eventsBetween(new Date(rows[0].s).toISOString(), new Date(rows[0].e - 1000).toISOString());
      return evs.map((e) => ({
        title: e.title,
        who: e.calendar_label,
        when: sayWhen(e.starts_at, e.all_day),
        until: e.all_day ? undefined : fmt(new Date(e.ends_at), { hour: '2-digit', minute: '2-digit', hour12: false }),
        location: e.location || undefined
      }));
    }
    case 'add_event': {
      const people = await api(app, 'GET', '/calendars');
      const want = String(input.who || 'family').toLowerCase();
      const cal =
        people.find((p) => p.slug === want) ||
        people.find((p) => p.label.toLowerCase().split(' ')[0] === want.split(' ')[0]) ||
        { slug: 'family', label: 'Family' };
      const allDay = Boolean(input.all_day) || /^\d{4}-\d{2}-\d{2}$/.test(input.start);
      const startIso = await localToIso(allDay ? `${input.start.slice(0, 10)}T00:00` : input.start);
      const endIso = allDay
        ? await localToIso(`${input.start.slice(0, 10)}T23:59`)
        : input.end
          ? await localToIso(input.end)
          : new Date(Date.parse(startIso) + 3600_000).toISOString();
      const ev = await api(app, 'POST', '/events', {
        calendar: cal.slug, title: input.title, location: input.location,
        starts_at: startIso, ends_at: endIso, all_day: allDay
      });
      return { added: ev.title, for: cal.label, when: sayWhen(ev.starts_at, ev.all_day) };
    }
    case 'get_briefing':
      return (await api(app, 'GET', '/briefing/preview')).text;
    case 'get_upcoming':
      return api(app, 'GET', '/upcoming');
    case 'get_weather':
      return api(app, 'GET', '/weather');
    case 'get_shopping_list':
      return (await api(app, 'GET', '/shopping')).filter((i) => !i.ticked_at).map((i) => i.label);
    case 'add_shopping_items': {
      const added = [];
      for (const label of input.items || []) {
        if (String(label).trim()) added.push((await api(app, 'POST', '/shopping', { label })).label);
      }
      return { added };
    }
    case 'get_reminders':
      return (await api(app, 'GET', '/reminders')).map((r) => ({
        label: r.label, day: r.day_name, every_weeks: r.every_weeks, next: r.next
      }));
    case 'add_reminder': {
      const r = await api(app, 'POST', '/reminders', {
        label: input.label, weekday: input.weekday,
        every_weeks: input.every_other_week ? 2 : 1, anchor: input.first_date
      });
      return { added: r.label, weekday: r.weekday, every_weeks: r.every_weeks };
    }
    case 'get_meals':
      return (await api(app, 'GET', '/meals')).map((m) => ({ day: m.day, dinner: m.title }));
    case 'add_note': {
      let author = null;
      if (input.from) {
        const people = await api(app, 'GET', '/calendars');
        const p = people.find((c) => c.label.toLowerCase().split(' ')[0] === String(input.from).toLowerCase().split(' ')[0]);
        author = p ? p.slug : null;
      }
      await api(app, 'POST', '/notes', { body: input.text, author, pinned: true });
      return { pinned: true };
    }
    case 'get_kids_board':
      return (await api(app, 'GET', '/kids')).map((k) => ({
        name: k.name, done: k.done, of: k.total, stars: k.stars, streak: k.streak,
        still_to_do: k.items.filter((i) => !i.done).map((i) => i.label)
      }));
    case 'start_kids_timer':
      return api(app, 'POST', '/timer', { chore: input.timer });
    case 'bedtime':
      return api(app, 'POST', '/bedtime');
    case 'screens':
      if (input.state === 'bright') return api(app, 'POST', '/wake');
      await q(
        `INSERT INTO settings (key, value) VALUES ('dim_command', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [JSON.stringify({ state: 1, at: Date.now() })]
      );
      return { dimmed: true };
    case 'get_media_players':
      return api(app, 'GET', '/home/players');
    case 'control_media': {
      const entity = String(input.player).replace(/^media_player\./, '');
      return api(app, 'POST', `/home/players/${encodeURIComponent(entity)}/${input.command}`, { volume: input.volume });
    }
    case 'find_phone': {
      const phones = await api(app, 'GET', '/home/phones');
      const want = String(input.name).toLowerCase();
      const phone = phones.find((p) => p.name.toLowerCase().includes(want) || want.includes(p.name.toLowerCase().split(' ')[0]));
      if (!phone) return { error: 'no phone by that name', phones: phones.map((p) => p.name) };
      await api(app, 'POST', `/home/phones/${phone.service}/find`);
      return { ringing: phone.name };
    }
    case 'get_home_scripts': {
      if (!configured()) return { error: 'Home Assistant is not linked' };
      return (await ha('/api/states'))
        .filter((s) => s.entity_id.startsWith('script.'))
        .map((s) => ({ id: s.entity_id, name: s.attributes.friendly_name || s.entity_id }));
    }
    case 'run_home_script':
      return api(app, 'POST', `/home/scenes/${encodeURIComponent(String(input.script).replace(/^script\./, ''))}`);
    case 'list_echos':
      return api(app, 'GET', '/alexa/devices');
    case 'announce': {
      if (!configured()) return { error: 'Home Assistant is not linked' };
      const echo = input.echo || defaultEcho(await settings());
      ctx.after.push(() => speak(echo, input.message));
      return { will_say: input.message, on: echo };
    }
    case 'alexa_command': {
      if (!configured()) return { error: 'Home Assistant is not linked' };
      const echo = input.echo || defaultEcho(await settings());
      const device_id = await deviceIdFor(echo);
      ctx.after.push(() => callService('alexa_devices', 'send_text_command', { device_id, text_command: input.command }));
      return { queued: input.command, on: echo };
    }
    default:
      throw new Error(`unknown tool ${name}`);
  }
}

/** Per-request facts that change; kept out of SYSTEM so the prompt caches. */
async function context(app) {
  const people = await api(app, 'GET', '/calendars').catch(() => []);
  return `[Now: ${nowContext()}. People: ${people.map((p) => p.label).join(', ') || 'unknown'}.]`;
}

/**
 * Ask Jarvis something. `history` is earlier text turns of this Alexa session.
 * Returns { text, after } where `after` are actions to run once Alexa has spoken.
 */
export async function askJarvis(app, utterance, history = [], log = app.log) {
  client ||= new Anthropic();
  const ctx = { after: [] };
  const messages = [
    ...history,
    { role: 'user', content: `${await context(app)}\n${utterance}` }
  ];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: EFFORT },
      cache_control: { type: 'ephemeral' },
      system: SYSTEM,
      tools: TOOLS,
      messages
    });

    if (res.stop_reason === 'refusal') {
      return { text: "I'm afraid that's not something I can help with.", after: [] };
    }
    if (res.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: res.content });
      continue;
    }

    const calls = res.content.filter((b) => b.type === 'tool_use');
    if (res.stop_reason !== 'tool_use' || !calls.length) {
      const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
      return { text: text || 'Done.', after: ctx.after };
    }

    messages.push({ role: 'assistant', content: res.content });
    // One at a time, in order: "add milk, then read me the list" must see the milk.
    const results = [];
    for (const call of calls) {
      try {
        const out = await runTool(app, ctx, call.name, call.input || {});
        results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(out ?? { ok: true }).slice(0, 6000) });
      } catch (err) {
        log.warn(`jarvis tool ${call.name} failed: ${err.message}`);
        results.push({ type: 'tool_result', tool_use_id: call.id, content: err.message, is_error: true });
      }
    }
    messages.push({ role: 'user', content: results });
  }
  return { text: "I'm sorry, that took more steps than I can manage in one go.", after: ctx.after };
}

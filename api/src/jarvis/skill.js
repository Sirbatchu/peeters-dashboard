// "Alexa, ask Jarvis ..." — the Alexa custom skill endpoint.
//
// This runs as its own little Fastify server on :3001 with exactly one route,
// because it is the only part of the stack published to the internet (Alexa's
// cloud has to reach it, through the Cloudflare tunnel). The dashboard API on
// :3000 stays LAN-only; Jarvis reaches it in-process via app.inject().
//
// Alexa gives a skill 8 seconds. If Claude is still working at DEADLINE_MS,
// Alexa says "bear with me", the session closes, and the answer is spoken on
// the Echo through Home Assistant when it's ready.
import Fastify from 'fastify';
import { verifyAlexa } from './verify.js';
import { askJarvis, jarvisConfigured } from './agent.js';
import { configured, speak } from '../ha.js';
import { q } from '../db.js';

export const SKILL_PORT = 3001;
const DEADLINE_MS = Number(process.env.JARVIS_DEADLINE_MS || 6500);
const VOICE = process.env.JARVIS_VOICE ?? 'Brian'; // Amazon Polly British male; "" for Alexa's own voice
const HISTORY_TURNS = 6;

const escapeXml = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const ssml = (text) =>
  VOICE
    ? `<speak><voice name="${escapeXml(VOICE)}"><lang xml:lang="en-GB">${escapeXml(text)}</lang></voice></speak>`
    : `<speak>${escapeXml(text)}</speak>`;

function say(text, { end = false, attrs } = {}) {
  return {
    version: '1.0',
    ...(attrs ? { sessionAttributes: attrs } : {}),
    response: { outputSpeech: { type: 'SSML', ssml: ssml(text) }, shouldEndSession: end }
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Roughly how long Alexa takes to read `text` out, so follow-ups don't talk over it. */
const speechMs = (text) => 2000 + String(text).split(/\s+/).length * 400;

async function runAfter(after, delayMs, log) {
  if (!after.length) return;
  await sleep(delayMs);
  for (const fn of after) {
    try {
      await fn();
    } catch (err) {
      log.warn(`jarvis follow-up failed: ${err.message}`);
    }
  }
}

async function jarvisEcho() {
  const { rows } = await q(
    "SELECT key, value FROM settings WHERE key IN ('jarvis_target', 'briefing_target')"
  );
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return s.jarvis_target || s.briefing_target || 'notify.kitchen_speak';
}

async function handleQuestion(app, body, utterance, log) {
  const history = Array.isArray(body.session?.attributes?.history) ? body.session.attributes.history : [];
  log.info({ device: body.context?.System?.device?.deviceId }, `jarvis heard: ${utterance}`);

  const work = askJarvis(app, utterance, history, log);
  const result = await Promise.race([work, sleep(DEADLINE_MS).then(() => null)]);

  if (result) {
    runAfter(result.after, speechMs(result.text), log);
    const nextHistory = [
      ...history,
      { role: 'user', content: utterance.slice(0, 500) },
      { role: 'assistant', content: result.text.slice(0, 1000) }
    ].slice(-HISTORY_TURNS);
    // Leave the mic open briefly for a follow-up ("and tomorrow?") without a reprompt.
    return say(result.text, { attrs: { history: nextHistory } });
  }

  // Too slow for Alexa: answer on the Echo once Claude is done.
  work
    .then(async ({ text, after }) => {
      if (configured()) await speak(await jarvisEcho(), text);
      await runAfter(after, speechMs(text), log);
    })
    .catch((err) => log.error(`jarvis (late) failed: ${err.message}`));
  return say(configured() ? 'Bear with me a moment.' : "That's taking longer than I'd like. Do ask again shortly.", { end: true });
}

export async function handle(app, body, log) {
  const req = body.request || {};
  if (req.type === 'SessionEndedRequest') return { version: '1.0', response: {} };
  if (!jarvisConfigured()) return say("My link to Claude isn't set up yet. Add the API key on the Mac Mini.", { end: true });

  if (req.type === 'LaunchRequest') return say('At your service.');
  if (req.type !== 'IntentRequest') return say('Very good.', { end: true });

  const intent = req.intent?.name;
  switch (intent) {
    case 'JarvisIntent': {
      const utterance = String(req.intent.slots?.query?.value || '').trim();
      if (!utterance) return say('Yes? What can I do for you?');
      try {
        return await handleQuestion(app, body, utterance, log);
      } catch (err) {
        log.error(`jarvis failed: ${err.message}`);
        return say("I'm terribly sorry, something went wrong on my end.", { end: true });
      }
    }
    case 'AMAZON.HelpIntent':
      return say(
        'Ask me about the calendar, the shopping list, dinner, the weather or the kids, or ask me to add something. For example: ask Jarvis what we are doing this weekend.'
      );
    case 'AMAZON.FallbackIntent':
      return say("I didn't quite catch that. Say it again?");
    case 'AMAZON.StopIntent':
    case 'AMAZON.CancelIntent':
    case 'AMAZON.NavigateHomeIntent':
      return say('Very good.', { end: true });
    default:
      return say("I'm not sure what you mean.", { end: true });
  }
}

export async function startSkillServer(app) {
  const skill = Fastify({ loggerInstance: app.log.child({ svc: 'alexa-skill' }) });

  // Signature verification needs the exact bytes Alexa signed.
  skill.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, raw, done) => {
    req.rawBody = raw;
    try {
      done(null, JSON.parse(raw.toString('utf8')));
    } catch (err) {
      err.statusCode = 400;
      done(err);
    }
  });

  skill.post('/alexa', async (req, reply) => {
    try {
      await verifyAlexa(req.headers, req.rawBody, req.body);
    } catch (err) {
      req.log.warn(`alexa request rejected: ${err.message}`);
      return reply.status(400).send({ error: 'invalid request' });
    }
    return handle(app, req.body, req.log);
  });

  await skill.listen({ port: SKILL_PORT, host: '0.0.0.0' });
}

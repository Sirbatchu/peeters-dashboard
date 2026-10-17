// Jarvis on the LAN: the same brain as the Alexa skill, without Alexa.
// Handy for testing from a laptop before the skill exists:
//   curl -X POST http://192.168.10.6/api/jarvis -H 'Content-Type: application/json' \
//        -d '{"text":"what is on this weekend?"}'
import { askJarvis, jarvisConfigured } from '../jarvis/agent.js';

export default async function routes(app) {
  app.post('/jarvis', async (req, reply) => {
    if (!jarvisConfigured()) return reply.status(503).send({ error: 'ANTHROPIC_API_KEY not set' });
    const text = String(req.body?.text || '').trim().slice(0, 500);
    if (!text) return reply.status(400).send({ error: 'text required' });
    const { text: answer, after } = await askJarvis(app, text, [], req.log);
    for (const fn of after) await fn().catch((err) => req.log.warn(err.message));
    return { text: answer };
  });
}


import Fastify from 'fastify';
import { waitForDb } from './db.js';
import events from './routes/events.js';
import kids from './routes/kids.js';
import home from './routes/home.js';
import household from './routes/household.js';
import misc from './routes/misc.js';
import backgrounds from './routes/backgrounds.js';
import alexa from './routes/alexa.js';

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL || 'info' }
});

// Treat an empty JSON body as {} instead of a 400. Callers such as Home
// Assistant's rest_command, or a bodyless DELETE, send content-type: json
// with nothing after it - Fastify's default parser rejects that outright.
app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  if (!body || !body.trim()) return done(null, {});
  try {
    done(null, JSON.parse(body));
  } catch (err) {
    err.statusCode = 400;
    done(err);
  }
});

app.register(misc, { prefix: '/api' });
app.register(events, { prefix: '/api' });
app.register(kids, { prefix: '/api' });
app.register(home, { prefix: '/api' });
app.register(household, { prefix: '/api' });
app.register(backgrounds, { prefix: '/api' });
app.register(alexa, { prefix: '/api' });

app.setErrorHandler((err, req, reply) => {
  req.log.error(err);
  reply.status(err.statusCode || 500).send({ error: err.message });
});

const start = async () => {
  await waitForDb(app.log);
  await app.listen({ port: 3000, host: '0.0.0.0' });
};

start().catch((err) => {
  app.log.error(err);
  process.exit(1);
});

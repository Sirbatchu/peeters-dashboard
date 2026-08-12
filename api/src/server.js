import Fastify from 'fastify';
import { waitForDb } from './db.js';
import events from './routes/events.js';
import kids from './routes/kids.js';
import home from './routes/home.js';
import household from './routes/household.js';
import misc from './routes/misc.js';

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL || 'info' }
});

app.register(misc, { prefix: '/api' });
app.register(events, { prefix: '/api' });
app.register(kids, { prefix: '/api' });
app.register(home, { prefix: '/api' });
app.register(household, { prefix: '/api' });

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

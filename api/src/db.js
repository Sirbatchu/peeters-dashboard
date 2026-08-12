import pg from 'pg';

// Postgres returns DATE as a JS Date in local time, which shifts days across
// timezones. Parse date columns (OID 1082) as plain YYYY-MM-DD strings instead.
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10
});

export const q = (text, params) => pool.query(text, params);

/** Local calendar day, respecting the container TZ rather than UTC. */
export function today() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.TZ || 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
  return parts; // en-CA formats as YYYY-MM-DD
}

/** Wait for Postgres to accept connections before serving traffic. */
export async function waitForDb(log, attempts = 30) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await q('SELECT 1');
      return;
    } catch (err) {
      log.warn(`db not ready (${i}/${attempts}): ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('database unreachable');
}

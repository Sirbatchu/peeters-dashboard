import { q, today } from '../db.js';

/** Items that apply to a kid: shared items (kid_slug NULL) plus their own. */
const ITEMS_SQL = `
  SELECT id, label, emoji, points, sort_order
    FROM checklist_items
   WHERE active AND (kid_slug IS NULL OR kid_slug = $1)
   ORDER BY sort_order, label`;

// Balance = stars earned from checklists + stars awarded by a parent
// - stars spent on claimed rewards.
const BALANCE_SQL = `
  SELECT COALESCE((SELECT SUM(points) FROM kid_days WHERE kid_slug = $1), 0)::int
       + COALESCE((SELECT SUM(points) FROM kid_awards WHERE kid_slug = $1), 0)::int
       - COALESCE((SELECT SUM(cost) FROM rewards WHERE claimed_by = $1), 0)::int AS total`;

const pinOk = (pin) => pin === (process.env.PARENT_PIN || '290915');

async function stateFor(slug, day) {
  const [{ rows: items }, { rows: ticks }] = await Promise.all([
    q(ITEMS_SQL, [slug]),
    q('SELECT item_id FROM checklist_ticks WHERE kid_slug = $1 AND day = $2', [slug, day])
  ]);
  const done = new Set(ticks.map((t) => t.item_id));
  return items.map((it) => ({ ...it, done: done.has(it.id) }));
}

/**
 * Recompute today's points and completion. Called after every tick so
 * kid_days stays authoritative even if the item list is edited later.
 */
async function recalcDay(slug, day) {
  const items = await stateFor(slug, day);
  const points = items.filter((i) => i.done).reduce((sum, i) => sum + i.points, 0);
  const complete = items.length > 0 && items.every((i) => i.done);
  await q(
    `INSERT INTO kid_days (kid_slug, day, points, completed, completed_at)
     VALUES ($1, $2, $3, $4, CASE WHEN $4 THEN now() ELSE NULL END)
     ON CONFLICT (kid_slug, day) DO UPDATE
        SET points = EXCLUDED.points,
            completed = EXCLUDED.completed,
            completed_at = CASE
              WHEN EXCLUDED.completed AND kid_days.completed_at IS NULL THEN now()
              WHEN NOT EXCLUDED.completed THEN NULL
              ELSE kid_days.completed_at END`,
    [slug, day, points, complete]
  );
  return { points, complete, items };
}

/** Consecutive completed days ending today or yesterday. */
async function streakFor(slug, day) {
  const { rows } = await q(
    `SELECT day FROM kid_days
      WHERE kid_slug = $1 AND completed AND day <= $2
      ORDER BY day DESC LIMIT 400`,
    [slug, day]
  );
  if (!rows.length) return 0;

  const days = rows.map((r) => r.day);
  const oneDay = 864e5;
  const start = new Date(day + 'T00:00:00Z').getTime();

  // Allow the streak to still count if today is not yet finished.
  let cursor = days[0] === day ? start : start - oneDay;
  if (days[0] !== new Date(cursor).toISOString().slice(0, 10)) return 0;

  let streak = 0;
  for (const d of days) {
    if (d === new Date(cursor).toISOString().slice(0, 10)) {
      streak++;
      cursor -= oneDay;
    } else break;
  }
  return streak;
}

export default async function routes(app) {
  // Added after launch: init.sql only runs on a fresh database, so make
  // sure the live one has the table too.
  await q(`CREATE TABLE IF NOT EXISTS kid_awards (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kid_slug   TEXT NOT NULL REFERENCES kids(slug) ON DELETE CASCADE,
    points     INT  NOT NULL CHECK (points > 0),
    note       TEXT NOT NULL,
    awarded_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await q('CREATE INDEX IF NOT EXISTS kid_awards_kid_idx ON kid_awards (kid_slug, created_at DESC)');

  // Everything the kids' board needs, in one request.
  app.get('/kids', async () => {
    const day = today();
    const { rows: kids } = await q('SELECT * FROM kids ORDER BY sort_order, name');

    return Promise.all(
      kids.map(async (kid) => {
        const items = await stateFor(kid.slug, day);
        const [{ rows: totals }, streak] = await Promise.all([
          // Balance = stars earned minus stars spent on claimed rewards.
          q(BALANCE_SQL, [kid.slug]),
          streakFor(kid.slug, day)
        ]);
        const doneCount = items.filter((i) => i.done).length;
        return {
          ...kid,
          items,
          done: doneCount,
          total: items.length,
          complete: items.length > 0 && doneCount === items.length,
          stars: totals[0].total,
          streak
        };
      })
    );
  });

  // Toggle one item for today. Returns the kid's fresh state.
  app.post('/kids/:slug/tick', async (req, reply) => {
    const day = today();
    const { slug } = req.params;
    const itemId = req.body?.item_id;
    if (!itemId) return reply.status(400).send({ error: 'item_id required' });

    const { rowCount } = await q(
      'DELETE FROM checklist_ticks WHERE kid_slug = $1 AND item_id = $2 AND day = $3',
      [slug, itemId, day]
    );
    // Nothing deleted means it was not ticked, so tick it now.
    if (!rowCount) {
      await q(
        'INSERT INTO checklist_ticks (kid_slug, item_id, day) VALUES ($1, $2, $3)',
        [slug, itemId, day]
      );
    }

    const { points, complete, items } = await recalcDay(slug, day);
    const streak = await streakFor(slug, day);
    const doneCount = items.filter((i) => i.done).length;

    return {
      slug,
      items,
      done: doneCount,
      total: items.length,
      complete,
      justTicked: !rowCount,
      todayPoints: points,
      streak
    };
  });

  // ── Checklist item management (editable without a deploy) ──
  app.get('/checklist-items', async () => {
    const { rows } = await q(
      'SELECT * FROM checklist_items ORDER BY sort_order, label'
    );
    return rows;
  });

  app.post('/checklist-items', async (req, reply) => {
    const { label, emoji, kid_slug, points, sort_order } = req.body || {};
    if (!label) return reply.status(400).send({ error: 'label required' });
    const { rows } = await q(
      `INSERT INTO checklist_items (label, emoji, kid_slug, points, sort_order)
       VALUES ($1, COALESCE($2,'✅'), $3, COALESCE($4,1), COALESCE($5,99)) RETURNING *`,
      [label, emoji, kid_slug || null, points, sort_order]
    );
    return reply.status(201).send(rows[0]);
  });

  app.delete('/checklist-items/:id', async (req, reply) => {
    await q('UPDATE checklist_items SET active = FALSE WHERE id = $1', [req.params.id]);
    return reply.status(204).send();
  });

  // Star history for charts: one row per day, zero-filled client side.
  app.get('/kids/:slug/history', async (req) => {
    const days = Math.min(Number(req.query.days) || 14, 90);
    const { rows } = await q(
      `SELECT day, points, completed FROM kid_days
        WHERE kid_slug = $1 AND day > CURRENT_DATE - $2::int
        ORDER BY day`,
      [req.params.slug, days]
    );
    return rows;
  });

  // ── Rewards ──
  app.get('/rewards', async () => {
    const { rows } = await q(
      'SELECT * FROM rewards WHERE active ORDER BY claimed_at NULLS FIRST, cost'
    );
    return rows;
  });

  // Claiming is parent-gated by PIN and spends the kid's star balance.
  app.post('/rewards/:id/claim', async (req, reply) => {
    const { kid_slug, pin } = req.body || {};
    if (!kid_slug) return reply.status(400).send({ error: 'kid_slug required' });
    if (!pinOk(pin)) {
      return reply.status(403).send({ error: 'Wrong PIN' });
    }

    const { rows: rw } = await q(
      'SELECT * FROM rewards WHERE id = $1 AND active AND claimed_at IS NULL',
      [req.params.id]
    );
    if (!rw.length) return reply.status(404).send({ error: 'reward not available' });
    if (rw[0].kid_slug && rw[0].kid_slug !== kid_slug) {
      return reply.status(400).send({ error: 'that reward belongs to someone else' });
    }

    const { rows: bal } = await q(BALANCE_SQL, [kid_slug]);
    if (bal[0].total < rw[0].cost) {
      return reply.status(400).send({ error: `needs ${rw[0].cost - bal[0].total} more stars` });
    }

    const { rows } = await q(
      'UPDATE rewards SET claimed_at = now(), claimed_by = $2 WHERE id = $1 RETURNING *',
      [req.params.id, kid_slug]
    );
    return rows[0];
  });

  // ── Bonus stars, awarded by a parent with a note saying why and who ──
  app.get('/kids/:slug/awards', async (req) => {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const { rows } = await q(
      `SELECT id, kid_slug, points, note, awarded_by, created_at
         FROM kid_awards WHERE kid_slug = $1
        ORDER BY created_at DESC LIMIT $2`,
      [req.params.slug, limit]
    );
    return rows;
  });

  app.post('/kids/:slug/awards', async (req, reply) => {
    // No PIN for awards for now (the giver's name is recorded instead).
    // Reward claims still need the PIN.
    const { points, note, by } = req.body || {};
    const pts = Number(points);
    if (!Number.isInteger(pts) || pts < 1 || pts > 100) {
      return reply.status(400).send({ error: 'points must be a whole number from 1 to 100' });
    }
    const text = String(note || '').trim();
    const who = String(by || '').trim();
    if (!text) return reply.status(400).send({ error: 'Add a note saying what it was for' });
    if (!who) return reply.status(400).send({ error: 'Say who is giving the stars' });

    const { rows: kid } = await q('SELECT slug FROM kids WHERE slug = $1', [req.params.slug]);
    if (!kid.length) return reply.status(404).send({ error: 'no such kid' });

    const { rows } = await q(
      `INSERT INTO kid_awards (kid_slug, points, note, awarded_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.slug, pts, text.slice(0, 200), who.slice(0, 40)]
    );
    const { rows: bal } = await q(BALANCE_SQL, [req.params.slug]);
    return reply.status(201).send({ ...rows[0], stars: bal[0].total });
  });

  // Undo a mistaken award.
  app.post('/awards/:id/remove', async (req, reply) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return reply.status(404).send({ error: 'no such award' });
    const { rowCount } = await q('DELETE FROM kid_awards WHERE id = $1', [req.params.id]);
    if (!rowCount) return reply.status(404).send({ error: 'already removed' });
    return reply.status(204).send();
  });
}

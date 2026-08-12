import { q, today } from '../db.js';

/** Items that apply to a kid: shared items (kid_slug NULL) plus their own. */
const ITEMS_SQL = `
  SELECT id, label, emoji, points, sort_order
    FROM checklist_items
   WHERE active AND (kid_slug IS NULL OR kid_slug = $1)
   ORDER BY sort_order, label`;

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
  // Everything the kids' board needs, in one request.
  app.get('/kids', async () => {
    const day = today();
    const { rows: kids } = await q('SELECT * FROM kids ORDER BY sort_order, name');

    return Promise.all(
      kids.map(async (kid) => {
        const items = await stateFor(kid.slug, day);
        const [{ rows: totals }, streak] = await Promise.all([
          q('SELECT COALESCE(SUM(points), 0)::int AS total FROM kid_days WHERE kid_slug = $1', [kid.slug]),
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

  // ── Rewards ──
  app.get('/rewards', async () => {
    const { rows } = await q(
      'SELECT * FROM rewards WHERE active ORDER BY cost'
    );
    return rows;
  });

  app.post('/rewards/:id/claim', async (req, reply) => {
    const { rows } = await q(
      'UPDATE rewards SET claimed_at = now() WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    if (!rows.length) return reply.status(404).send({ error: 'not found' });
    return rows[0];
  });
}

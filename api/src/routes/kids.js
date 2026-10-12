import { q, today } from '../db.js';

/**
 * Items that apply to a kid: shared items (kid_slug NULL) plus their own.
 * routine is 'morning' or 'evening'; the board shows whichever fits the
 * time of day, but a day only counts as complete when both are done.
 */
const ITEMS_SQL = `
  SELECT id, label, emoji, points, sort_order, routine
    FROM checklist_items
   WHERE active AND (kid_slug IS NULL OR kid_slug = $1)
   ORDER BY routine = 'evening', sort_order, label`;

// Balance = stars earned from checklists + stars awarded by a parent
// - stars spent on claimed rewards.
const BALANCE_SQL = `
  SELECT COALESCE((SELECT SUM(points) FROM kid_days WHERE kid_slug = $1), 0)::int
       + COALESCE((SELECT SUM(points) FROM kid_awards WHERE kid_slug = $1), 0)::int
       - COALESCE((SELECT SUM(cost) FROM reward_claims WHERE kid_slug = $1), 0)::int AS total`;

// Prizes the family can claim again every day, added after launch.
// Seeded once (tracked in settings) so a prize deleted later isn't re-added.
const EXTRA_REWARDS = [
  ['Ice cream', '🍦', 15],
  ['Go out for breakfast', '🥞', 40],
  ['Go out for lunch', '🍔', 50],
  ['Go out for dinner', '🍝', 60]
];

// Evening routine, added after launch (seeded once, like EXTRA_REWARDS).
const EVENING_ITEMS = [
  ['Help set the table', '🍴'],
  ['Take my plate to the kitchen', '🍽️'],
  ['Help tidy the table', '🧽'],
  ['Tidy up all toys', '🧸'],
  ['Do all homework', '📝'],
  ['Shower and clean behind ears', '🚿'],
  ['Brush teeth', '🪥']
];

/** Run a one-off data change once, remembered by a settings key. */
async function once(key, fn) {
  const { rowCount } = await q('SELECT 1 FROM settings WHERE key = $1', [key]);
  if (rowCount) return;
  await fn();
  await q("INSERT INTO settings (key, value) VALUES ($1, '1') ON CONFLICT (key) DO NOTHING", [key]);
}

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

  // Prizes reset daily: each claim is a row here (one per kid, prize and
  // day) instead of marking the prize itself as used up.
  await q(`CREATE TABLE IF NOT EXISTS reward_claims (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reward_id  UUID NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
    kid_slug   TEXT NOT NULL REFERENCES kids(slug) ON DELETE CASCADE,
    cost       INT  NOT NULL,
    day        DATE NOT NULL,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (reward_id, kid_slug, day)
  )`);
  // Move claims made under the old one-off scheme into the history (same
  // stars spent, so balances don't change) and make those prizes available
  // again. One statement, so it's all-or-nothing and safe to re-run.
  await q(`WITH old AS (
             SELECT id, claimed_by, cost, claimed_at FROM rewards
              WHERE claimed_by IS NOT NULL FOR UPDATE),
           moved AS (
             INSERT INTO reward_claims (reward_id, kid_slug, cost, day, claimed_at)
             SELECT id, claimed_by, cost, (claimed_at AT TIME ZONE $1)::date, claimed_at FROM old
             ON CONFLICT DO NOTHING)
           UPDATE rewards r SET claimed_at = NULL, claimed_by = NULL
             FROM old WHERE r.id = old.id`,
    [process.env.TZ || 'Europe/London']);

  const { rowCount: seeded } = await q(
    "SELECT 1 FROM settings WHERE key = 'rewards_seeded_v2'"
  );
  if (!seeded) {
    for (const [label, emoji, cost] of EXTRA_REWARDS) {
      await q(
        `INSERT INTO rewards (label, emoji, cost)
         SELECT $1::text, $2::text, $3::int
          WHERE NOT EXISTS (SELECT 1 FROM rewards WHERE label = $1::text)`,
        [label, emoji, cost]
      );
    }
    await q(
      "INSERT INTO settings (key, value) VALUES ('rewards_seeded_v2', '1') ON CONFLICT (key) DO NOTHING"
    );
  }

  // Morning / evening routines.
  await q("ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS routine TEXT NOT NULL DEFAULT 'morning'");
  await once('evening_seeded_v1', async () => {
    for (const [i, [label, emoji]] of EVENING_ITEMS.entries()) {
      await q(
        `INSERT INTO checklist_items (label, emoji, sort_order, routine)
         SELECT $1::text, $2::text, $3::int, 'evening'
          WHERE NOT EXISTS (SELECT 1 FROM checklist_items
                             WHERE label = $1::text AND routine = 'evening' AND active)`,
        [label, emoji, i + 1]
      );
    }
  });

  // Ice cream was 20 stars at launch; the family asked for 15. Only moves
  // it if nobody has changed the price by hand since.
  await once('ice_cream_15', () =>
    q("UPDATE rewards SET cost = 15 WHERE label = 'Ice cream' AND cost = 20")
  );

  // Kids can be hidden from the board without losing their stars or history.
  await q('ALTER TABLE kids ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE');
  await once('waverly_hidden_v1', () => q("UPDATE kids SET active = FALSE WHERE slug = 'waverly'"));

  // Everything the kids' board needs, in one request.
  app.get('/kids', async () => {
    const day = today();
    const { rows: kids } = await q('SELECT * FROM kids WHERE active ORDER BY sort_order, name');

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
      "SELECT * FROM checklist_items ORDER BY routine = 'evening', sort_order, label"
    );
    return rows;
  });

  app.post('/checklist-items', async (req, reply) => {
    const { label, emoji, kid_slug, points, sort_order, routine } = req.body || {};
    if (!label) return reply.status(400).send({ error: 'label required' });
    const { rows } = await q(
      `INSERT INTO checklist_items (label, emoji, kid_slug, points, sort_order, routine)
       VALUES ($1, COALESCE($2,'✅'), $3, COALESCE($4,1), COALESCE($5,99), $6) RETURNING *`,
      [label, emoji, kid_slug || null, points, sort_order, routine === 'evening' ? 'evening' : 'morning']
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
  // Every active prize, plus which kids have already claimed it today.
  app.get('/rewards', async () => {
    const { rows } = await q(
      `SELECT r.id, r.kid_slug, r.label, r.emoji, r.cost,
              COALESCE(ARRAY_AGG(c.kid_slug) FILTER (WHERE c.kid_slug IS NOT NULL), '{}') AS claimed_today
         FROM rewards r
         LEFT JOIN reward_claims c ON c.reward_id = r.id AND c.day = $1
        WHERE r.active
        GROUP BY r.id
        ORDER BY r.cost, r.label`,
      [today()]
    );
    return rows;
  });

  // Claiming spends the kid's star balance. Each prize can be claimed once
  // per kid per day. No PIN: the family asked for claims and awards to be open.
  app.post('/rewards/:id/claim', async (req, reply) => {
    const { kid_slug } = req.body || {};
    if (!kid_slug) return reply.status(400).send({ error: 'kid_slug required' });
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) {
      return reply.status(404).send({ error: 'reward not available' });
    }

    const { rows: rw } = await q('SELECT * FROM rewards WHERE id = $1 AND active', [req.params.id]);
    if (!rw.length) return reply.status(404).send({ error: 'reward not available' });
    if (rw[0].kid_slug && rw[0].kid_slug !== kid_slug) {
      return reply.status(400).send({ error: 'that reward belongs to someone else' });
    }

    const { rows: kid } = await q('SELECT slug FROM kids WHERE slug = $1', [kid_slug]);
    if (!kid.length) return reply.status(404).send({ error: 'no such kid' });

    const { rowCount: already } = await q(
      'SELECT 1 FROM reward_claims WHERE reward_id = $1 AND kid_slug = $2 AND day = $3',
      [req.params.id, kid_slug, today()]
    );
    if (already) {
      return reply.status(409).send({ error: 'already claimed today — try again tomorrow' });
    }

    const { rows: bal } = await q(BALANCE_SQL, [kid_slug]);
    if (bal[0].total < rw[0].cost) {
      return reply.status(400).send({ error: `needs ${rw[0].cost - bal[0].total} more stars` });
    }

    // The unique (reward, kid, day) key makes a double tap a no-op.
    const { rows } = await q(
      `INSERT INTO reward_claims (reward_id, kid_slug, cost, day)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (reward_id, kid_slug, day) DO NOTHING
       RETURNING *`,
      [req.params.id, kid_slug, rw[0].cost, today()]
    );
    if (!rows.length) {
      return reply.status(409).send({ error: 'already claimed today — try again tomorrow' });
    }
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

import { readdir } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { q, today } from '../db.js';

const PHOTOS_DIR = process.env.PHOTOS_DIR || '/photos';
const PHOTO_EXT = /\.(jpe?g|png|gif|webp)$/i;

export default async function routes(app) {
  // ── Shopping list ──
  app.get('/shopping', async () => {
    const { rows } = await q(
      'SELECT * FROM shopping_items ORDER BY ticked_at NULLS FIRST, created_at DESC'
    );
    return rows;
  });

  app.post('/shopping', async (req, reply) => {
    const { label, emoji } = req.body || {};
    if (!label?.trim()) return reply.status(400).send({ error: 'label required' });
    const { rows } = await q(
      'INSERT INTO shopping_items (label, emoji) VALUES ($1, $2) RETURNING *',
      [label.trim(), emoji || null]
    );
    return reply.status(201).send(rows[0]);
  });

  app.post('/shopping/:id/tick', async (req, reply) => {
    const { rows } = await q(
      `UPDATE shopping_items
          SET ticked_at = CASE WHEN ticked_at IS NULL THEN now() ELSE NULL END
        WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!rows.length) return reply.status(404).send({ error: 'not found' });
    return rows[0];
  });

  app.delete('/shopping/:id', async (req) => {
    await q('DELETE FROM shopping_items WHERE id = $1', [req.params.id]);
    return null;
  });

  // Sweep everything already in the trolley.
  app.post('/shopping/clear-ticked', async () => {
    const { rowCount } = await q('DELETE FROM shopping_items WHERE ticked_at IS NOT NULL');
    return { cleared: rowCount };
  });

  // ── Meal planner ──
  app.get('/meals', async (req) => {
    const start = req.query.start || today();
    const { rows } = await q(
      `SELECT m.*, r.ingredients, r.emoji AS recipe_emoji
         FROM meals m
         LEFT JOIN recipes r ON r.id = m.recipe_id
        WHERE m.day >= $1::date AND m.day < $1::date + 14
        ORDER BY m.day`,
      [start]
    );
    return rows;
  });

  // Plan a dinner: either a saved recipe (recipe_id) or free text (title).
  app.put('/meals/:day', async (req) => {
    const { title, emoji, notes, recipe_id } = req.body || {};
    let name = title?.trim();
    let icon = emoji;
    if (recipe_id) {
      const { rows: r } = await q('SELECT title, emoji FROM recipes WHERE id = $1', [recipe_id]);
      if (r.length) {
        name = name || r[0].title;
        icon = icon || r[0].emoji;
      }
    }
    if (!name) {
      await q('DELETE FROM meals WHERE day = $1', [req.params.day]);
      return { day: req.params.day, deleted: true };
    }
    const { rows } = await q(
      `INSERT INTO meals (day, title, emoji, notes, recipe_id)
       VALUES ($1, $2, COALESCE($3,'🍽️'), $4, $5)
       ON CONFLICT (day) DO UPDATE
         SET title = EXCLUDED.title, emoji = EXCLUDED.emoji,
             notes = EXCLUDED.notes, recipe_id = EXCLUDED.recipe_id
       RETURNING *`,
      [req.params.day, name, icon, notes || null, recipe_id || null]
    );
    return rows[0];
  });

  /**
   * Put the ingredients for planned meals onto the shopping list.
   * Body: { day } for one meal, or { start, days } for a range (default: next 7 days).
   * Skips anything already on the list and not yet ticked (case-insensitive),
   * so tapping twice never doubles up.
   */
  app.post('/meals/shop', async (req) => {
    const b = req.body || {};
    const start = b.day || b.start || today();
    const days = b.day ? 1 : Math.min(Number(b.days) || 7, 31);
    const { rows: meals } = await q(
      `SELECT m.title, r.ingredients
         FROM meals m JOIN recipes r ON r.id = m.recipe_id
        WHERE m.day >= $1::date AND m.day < $1::date + $2::int`,
      [start, days]
    );
    const { rows: open } = await q(
      'SELECT lower(trim(label)) AS l FROM shopping_items WHERE ticked_at IS NULL'
    );
    const have = new Set(open.map((r) => r.l));
    const added = [];
    const skipped = [];
    for (const m of meals) {
      for (const raw of m.ingredients || []) {
        const label = String(raw).trim();
        if (!label) continue;
        const key = label.toLowerCase();
        if (have.has(key)) {
          skipped.push(label);
          continue;
        }
        await q('INSERT INTO shopping_items (label) VALUES ($1)', [label]);
        have.add(key);
        added.push(label);
      }
    }
    return { meals: meals.length, added, skipped };
  });

  // ── Recipes ──
  const cleanIngredients = (list) =>
    (Array.isArray(list) ? list : String(list || '').split(/\r?\n/))
      .map((s) => String(s).trim())
      .filter(Boolean);

  app.get('/recipes', async () => {
    const { rows } = await q('SELECT * FROM recipes ORDER BY lower(title)');
    return rows;
  });

  app.post('/recipes', async (req, reply) => {
    const { title, emoji, ingredients } = req.body || {};
    if (!title?.trim()) return reply.status(400).send({ error: 'title required' });
    try {
      const { rows } = await q(
        `INSERT INTO recipes (title, emoji, ingredients)
         VALUES ($1, COALESCE($2,'🍽️'), $3) RETURNING *`,
        [title.trim(), emoji || null, cleanIngredients(ingredients)]
      );
      return reply.status(201).send(rows[0]);
    } catch (e) {
      if (e.code === '23505') return reply.status(409).send({ error: 'a recipe with that name already exists' });
      throw e;
    }
  });

  app.put('/recipes/:id', async (req, reply) => {
    const { title, emoji, ingredients } = req.body || {};
    if (!title?.trim()) return reply.status(400).send({ error: 'title required' });
    const { rows } = await q(
      `UPDATE recipes SET title = $2, emoji = COALESCE($3, emoji), ingredients = $4
        WHERE id = $1 RETURNING *`,
      [req.params.id, title.trim(), emoji || null, cleanIngredients(ingredients)]
    );
    if (!rows.length) return reply.status(404).send({ error: 'not found' });
    // Keep planned meals' names in step with a renamed recipe.
    await q('UPDATE meals SET title = $2 WHERE recipe_id = $1', [req.params.id, rows[0].title]);
    return rows[0];
  });

  app.delete('/recipes/:id', async (req, reply) => {
    await q('DELETE FROM recipes WHERE id = $1', [req.params.id]);
    return reply.status(204).send();
  });

  // ── Family notes ──
  app.get('/notes', async () => {
    const { rows } = await q(
      `SELECT n.*, c.label AS author_label, c.colour
         FROM notes n LEFT JOIN calendars c ON c.slug = n.author
        ORDER BY n.pinned DESC, n.created_at DESC
        LIMIT 100`
    );
    return rows;
  });

  app.post('/notes', async (req, reply) => {
    const { body, author, pinned } = req.body || {};
    if (!body?.trim()) return reply.status(400).send({ error: 'note is empty' });
    const { rows } = await q(
      'INSERT INTO notes (body, author, pinned) VALUES ($1, $2, COALESCE($3, FALSE)) RETURNING *',
      [body.trim().slice(0, 500), author || null, pinned]
    );
    return reply.status(201).send(rows[0]);
  });

  app.patch('/notes/:id', async (req, reply) => {
    const { pinned, body } = req.body || {};
    const { rows } = await q(
      `UPDATE notes SET pinned = COALESCE($2, pinned), body = COALESCE($3, body)
        WHERE id = $1 RETURNING *`,
      [req.params.id, typeof pinned === 'boolean' ? pinned : null, body?.trim() || null]
    );
    if (!rows.length) return reply.status(404).send({ error: 'not found' });
    return rows[0];
  });

  app.delete('/notes/:id', async (req, reply) => {
    await q('DELETE FROM notes WHERE id = $1', [req.params.id]);
    return reply.status(204).send();
  });

  // ── Settings ──
  app.get('/settings', async () => {
    const { rows } = await q('SELECT key, value FROM settings');
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  });

  app.put('/settings', async (req, reply) => {
    const entries = Object.entries(req.body || {});
    if (!entries.length) return reply.status(400).send({ error: 'nothing to set' });
    for (const [key, value] of entries) {
      await q(
        `INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, String(value)]
      );
    }
    const { rows } = await q('SELECT key, value FROM settings');
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  });

  // ── Photo frame ──
  app.get('/photos', async () => {
    if (!existsSync(PHOTOS_DIR)) return [];
    const files = await readdir(PHOTOS_DIR);
    return files.filter((f) => PHOTO_EXT.test(f)).sort();
  });

  app.get('/photos/:file', async (req, reply) => {
    // basename() blocks traversal; extension check blocks the rest.
    const name = path.basename(req.params.file);
    if (!PHOTO_EXT.test(name)) return reply.status(400).send({ error: 'not a photo' });
    const full = path.join(PHOTOS_DIR, name);
    if (!existsSync(full)) return reply.status(404).send({ error: 'not found' });
    const type = name.match(/\.png$/i) ? 'image/png' : name.match(/\.gif$/i) ? 'image/gif' : name.match(/\.webp$/i) ? 'image/webp' : 'image/jpeg';
    reply.header('Content-Type', type).header('Cache-Control', 'max-age=86400');
    return reply.send(createReadStream(full));
  });
}

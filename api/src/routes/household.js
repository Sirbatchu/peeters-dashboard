import { readdir } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { q } from '../db.js';

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
    const start = req.query.start || new Date().toISOString().slice(0, 10);
    const { rows } = await q(
      `SELECT * FROM meals WHERE day >= $1::date AND day < $1::date + 14 ORDER BY day`,
      [start]
    );
    return rows;
  });

  app.put('/meals/:day', async (req, reply) => {
    const { title, emoji, notes } = req.body || {};
    if (!title?.trim()) {
      await q('DELETE FROM meals WHERE day = $1', [req.params.day]);
      return { day: req.params.day, deleted: true };
    }
    const { rows } = await q(
      `INSERT INTO meals (day, title, emoji, notes)
       VALUES ($1, $2, COALESCE($3,'🍽️'), $4)
       ON CONFLICT (day) DO UPDATE
         SET title = EXCLUDED.title, emoji = EXCLUDED.emoji, notes = EXCLUDED.notes
       RETURNING *`,
      [req.params.day, title.trim(), emoji, notes || null]
    );
    return rows[0];
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

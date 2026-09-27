import { readdir, mkdir, writeFile, unlink } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { q } from '../db.js';

// Dashboard background photos, uploaded from a phone via /photos.
// Unlike the photo-frame folder this one is writable (a docker volume).
const BG_DIR = process.env.BACKGROUNDS_DIR || '/backgrounds';
const BG_NAME = /^\d{13}-[0-9a-f]{8}\.(jpg|png|webp)$/;
const MAX_BYTES = 20 * 1024 * 1024;

// The phone resizes to JPEG before upload, but accept PNG/WebP too. Check
// the file's own magic bytes rather than trusting the Content-Type.
function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47) return 'png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'webp';
  }
  return null;
}

const TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export default async function routes(app) {
  await mkdir(BG_DIR, { recursive: true });

  // Uploads arrive as the raw image body (no multipart dependency needed).
  app.addContentTypeParser(
    ['image/jpeg', 'image/png', 'image/webp'],
    { parseAs: 'buffer', bodyLimit: MAX_BYTES },
    (req, body, done) => done(null, body)
  );

  // Newest first — names start with the upload timestamp.
  app.get('/backgrounds', async () => {
    const files = await readdir(BG_DIR);
    return files.filter((f) => BG_NAME.test(f)).sort().reverse();
  });

  app.get('/backgrounds/:file', async (req, reply) => {
    const name = req.params.file;
    if (!BG_NAME.test(name)) return reply.status(400).send({ error: 'bad name' });
    const full = path.join(BG_DIR, name);
    if (!existsSync(full)) return reply.status(404).send({ error: 'not found' });
    // Names are never reused, so the tablet can cache them forever.
    reply
      .header('Content-Type', TYPES[name.split('.').pop()])
      .header('Cache-Control', 'public, max-age=31536000, immutable');
    return reply.send(createReadStream(full));
  });

  app.post('/backgrounds', async (req, reply) => {
    const buf = req.body;
    const ext = Buffer.isBuffer(buf) ? sniff(buf) : null;
    if (!ext) return reply.status(415).send({ error: 'Send a JPEG, PNG or WebP image' });
    const name = `${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`;
    await writeFile(path.join(BG_DIR, name), buf);
    return reply.status(201).send({ name });
  });

  app.delete('/backgrounds/:file', async (req, reply) => {
    const name = req.params.file;
    if (!BG_NAME.test(name)) return reply.status(400).send({ error: 'bad name' });
    const full = path.join(BG_DIR, name);
    if (existsSync(full)) await unlink(full);
    // Deleting the photo currently on screen falls back to the sky.
    await q(
      `UPDATE settings SET value = '' WHERE key = 'background_photo' AND value = $1`,
      [name]
    );
    return reply.status(204).send();
  });
}

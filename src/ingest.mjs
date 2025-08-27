import 'dotenv/config';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { q } from './db.mjs';
import { log } from './logger.mjs';

const PARSE_DIR = path.resolve('parse');

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) { yield* walk(p); }
    else if (entry.isFile() && /\.(md|txt|js|ts|json|sql)$/i.test(entry.name)) { yield p; }
  }
}

function chunkText(txt, max = 1200) {
  const parts = [];
  let i = 0;
  while (i < txt.length) {
    parts.push(txt.slice(i, i + max));
    i += max;
  }
  return parts;
}

async function upsertDocument(source, title, content) {
  const hash = createHash('sha256').update(content).digest('hex');
  const exists = await q('SELECT id FROM documents WHERE content_hash=$1', [hash]);
  if (exists.rowCount) return exists.rows[0].id;

  const id = uuidv4();
  await q('INSERT INTO documents (id, source, title, content, content_hash) VALUES ($1,$2,$3,$4,$5)', [id, source, title, content, hash]);

  const chunks = chunkText(content);
  let seq = 0;
  for (const c of chunks) {
    await q('INSERT INTO chunks (id, document_id, seq, text) VALUES ($1,$2,$3,$4)', [uuidv4(), id, seq++, c]);
  }
  return id;
}

(async () => {
  try {
    log("Ingest starting:", PARSE_DIR);
    const s = await stat(PARSE_DIR).catch(() => null);
    if (!s || !s.isDirectory()) { console.error("Missing ./parse directory"); process.exit(1); }

    let count = 0;
    for await (const file of walk(PARSE_DIR)) {
      const content = await readFile(file, 'utf8');
      const id = await upsertDocument(file, path.basename(file), content);
      log("Indexed:", file, "->", id);
      count++;
    }
    log(`Ingest complete. Files processed: ${count}`);
    process.exit(0);
  } catch (e) {
    console.error("Ingest error:", e.message);
    process.exit(1);
  }
})();

import { q } from './db.mjs';
import { readFile } from 'node:fs/promises';
const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
await q(sql);
console.log("DB initialized.");
process.exit(0);

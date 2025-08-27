import { q } from './db.mjs';

export async function searchChunks(query, limit = 8) {
  // Fast, no-ML baseline using trigram similarity
  const { rows } = await q(
    `SELECT c.text, d.title, d.source, similarity(c.text, $1) AS score
     FROM chunks c
     JOIN documents d ON d.id = c.document_id
     WHERE c.text % $1
     ORDER BY score DESC
     LIMIT $2`,
    [query, limit]
  );
  return rows;
}

export function formatContext(rows) {
  return rows.map((r, i) => `[#${i+1} | ${r.title ?? r.source}] ${r.text}`).join('\n---\n');
}

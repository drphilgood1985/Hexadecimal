import { v4 as uuidv4 } from "uuid";
import { createHash } from "node:crypto";
import { q } from "./db.mjs";

// allow common text-ish sources; extend later if needed (e.g., .yml, .env)
const ALLOW = /\.(md|txt|js|ts|json|sql|csv|psql|log|ini|conf)$/i;

// Nitro often allows bigger files; cap at ~50MB safely
const MAX_BYTES = 50 * 1024 * 1024;

function chunkText(txt, max = 1200) {
  const out = [];
  for (let i = 0; i < txt.length; i += max) out.push(txt.slice(i, i + max));
  return out;
}

async function upsertDocumentDirect(source, title, content) {
  const hash = createHash("sha256").update(content).digest("hex");
  const existing = await q("SELECT id FROM documents WHERE content_hash=$1", [hash]);
  if (existing.rowCount) return { id: existing.rows[0].id, created: false };

  const id = uuidv4();
  await q(
    "INSERT INTO documents (id, source, title, content, content_hash) VALUES ($1,$2,$3,$4,$5)",
    [id, source, title, content, hash]
  );

  const parts = chunkText(content);
  for (let i = 0; i < parts.length; i++) {
    await q("INSERT INTO chunks (id, document_id, seq, text) VALUES ($1,$2,$3,$4)", [
      uuidv4(), id, i, parts[i]
    ]);
  }
  return { id, created: true, chunks: parts.length };
}

export async function handleAttachments(message) {
  if (!message.attachments?.size) return null;

  const results = [];
  for (const [, att] of message.attachments) {
    try {
      const url = att.url;
      const name = att.name || "upload";
      const size = att.size || 0;

      if (!ALLOW.test(name)) {
        results.push({ name, ok: false, reason: "blocked extension" });
        continue;
      }
      if (size > MAX_BYTES) {
        results.push({ name, ok: false, reason: `too large (${size} bytes)` });
        continue;
      }

      const res = await fetch(url);
      if (!res.ok) {
        results.push({ name, ok: false, reason: `http ${res.status}` });
        continue;
      }

      const buf = await res.arrayBuffer();
      // Treat as UTF-8 text. If you later want PDFs/Office docs, add a text extractor.
      const content = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(buf));

      const { id, created, chunks } = await upsertDocumentDirect(
        `discord:${message.channelId}/${name}`,
        name,
        content
      );

      results.push({ name, ok: true, id, created, chunks: chunks ?? "existing" });
    } catch (e) {
      results.push({ name: att.name || "upload", ok: false, reason: e.message });
    }
  }

  return results;
}

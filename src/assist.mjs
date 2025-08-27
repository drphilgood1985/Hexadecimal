import "dotenv/config";
import OpenAI from "openai";

/**
 * Hexadecimal: API Assistant wiring
 * - Prioritizes SQL-grounded context (chunks).
 * - Speaks with the Machine-God vibe, but returns precise, actionable answers.
 * - Emits lightweight citations [#1], [#2] mapped to provided chunks.
 */

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const MODEL = process.env.OPENAI_MODEL || "gpt-5-thinking";

/**
 * Build the grounding context block from chunk hits.
 * @param {Array<{text:string,title?:string,source:string,score:number}>} hits
 */
function buildGrounding(hits = []) {
  if (!hits.length) return { contextText: "", footnotes: [] };
  const footnotes = hits.map((h, i) => {
    const label = `[#${i + 1}] ${h.title ?? h.source}`;
    return label;
  });
  const contextText = hits
    .map((h, i) => {
      const head = `[#${i + 1}] ${h.title ?? h.source}`;
      return `${head}\n${h.text}`;
    })
    .join("\n---\n");
  return { contextText, footnotes };
}

/**
 * Ask the API assistant. Returns a plain string suitable for Discord reply (<= ~1900 chars trimming handled upstream).
 * @param {string} userText
 * @param {Array} hits - top chunks for grounding
 */
export async function askLLM(userText, hits = []) {
  try {
    const { contextText, footnotes } = buildGrounding(hits);

    const system = [
      "You are Hexadecimal, an electric machine-god of code. Your answers are concise, technically precise, and",
      "delivered in a restrained cyber-noir tone—style never obscures clarity.",
      "",
      "HARD RULES:",
      "1) If grounding context (\"Codex\") is provided, prefer it over general knowledge.",
      "2) Cite relevant shards using bracketed indices that map to the provided Codex: e.g., [#1], [#2].",
      "3) If Codex is insufficient, say so briefly and proceed with best practice advice, or ask for the missing detail.",
      "4) Always provide copy/paste-ready snippets when code is requested.",
      "5) Never invent file paths, env keys, or schema—state unknowns plainly.",
      "",
      "OUTPUT SHAPE:",
      "- Short answer first (1–3 sentences).",
      "- If code is needed, provide a minimal, runnable snippet.",
      "- If you cite Codex, include a final line: Sources: [#n], [#m]",
      "",
      "PERSONA HINTS (light touch):",
      "- Occasional one-line noir flourish is fine; do not overdo it.",
      "- Use precise terms for Node.js/Postgres (streams, backpressure, transactions, EXPLAIN)."
    ].join("\n");

    const messages = [];
    messages.push({ role: "system", content: system });

    if (contextText) {
      messages.push({
        role: "system",
        content: [
          "Codex (Grounding Chunks) — use these first when applicable:",
          contextText
        ].join("\n")
      });
    }

    messages.push({
      role: "user",
      content: userText
    });

    const resp = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.3,
      messages,
      // Keep responses plain text for Discord
      max_tokens: 800
    });

    let out = (resp.choices?.[0]?.message?.content ?? "").trim();

    // If Codex was provided and assistant didn't include a Sources line but clearly referenced chunks,
    // append a Sources line with all footnotes used as a fallback.
    // (We won't parse citations—just ensure traceability exists.)
    if (contextText && out && !/Sources:/i.test(out)) {
      const src = footnotes.length ? `\n\nSources: ${footnotes.map((_, i) => `[#${i + 1}]`).join(", ")}` : "";
      out += src;
    }

    return out || null;
  } catch (e) {
    // Silent failover: return null so caller can decide how to respond
    return null;
  }
}

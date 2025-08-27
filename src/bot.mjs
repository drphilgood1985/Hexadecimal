import 'dotenv/config';
import { Client, GatewayIntentBits, Partials, Events, ChannelType, PermissionsBitField } from 'discord.js';
import { log, err } from './logger.mjs';
import { searchChunks, formatContext } from './retrieval.mjs';
import { q } from './db.mjs';
import { handleAttachments } from './attachments.mjs';
import { askLLM } from './assist.mjs';

const BOT_NAME = process.env.BOT_NAME || "Hexadecimal";

const ALLOW_GUILD_IDS = (process.env.ALLOW_GUILD_IDS || "")
  .split(",").map(s => s.trim()).filter(Boolean);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

function isPrivateContext(channel) {
  if (!channel) return false;
  if (channel.type === ChannelType.DM || channel.type === ChannelType.GroupDM) return true;
  if (channel.type === ChannelType.PrivateThread) return true;

  if (channel.type === ChannelType.GuildText) {
    if (ALLOW_GUILD_IDS.length && !ALLOW_GUILD_IDS.includes(channel.guildId)) return false;
    const perms = channel.permissionsFor(channel.guild.roles.everyone);
    if (!perms) return false;
    const everyoneCanView = perms.has(PermissionsBitField.Flags.ViewChannel);
    return !everyoneCanView;
  }
  return false;
}

async function remember(channel_id, user_id, kind, content) {
  await q('INSERT INTO memory_log (channel_id,user_id,kind,content) VALUES ($1,$2,$3,$4)',
    [channel_id, user_id, kind, content]);
}

client.once(Events.ClientReady, () => {
  log(`${BOT_NAME} manifested as ${client.user.tag}`);
});

client.on(Events.MessageCreate, async (msg) => {
  try {
    if (msg.author.bot) return;
    if (!isPrivateContext(msg.channel)) return;

    // Auto-ingest attachments in private contexts
    const ing = await handleAttachments(msg);
    if (ing && ing.length) {
      const lines = ing.map(r => r.ok
        ? `✓ ${r.name} → indexed (${String(r.chunks).padStart(1," ")} chunks)`
        : `✗ ${r.name} → ${r.reason}`
      ).join("\n");
      await remember(msg.channelId, msg.author.id, "note", `ingest\n${lines}`);
      await msg.reply(`**Hexadecimal:** Ingest report\n${lines}`);
    }

    const text = (msg.content || "").trim();
    if (!text) return;

    await remember(msg.channelId, msg.author.id, "ask", text);

    // SQL-first grounding (raw hits and formatted preview for fallback)
    const hits = await searchChunks(text, 8);
    const preview = hits.length ? formatContext(hits) : "";

    // API assistant (LLM) with grounding
    const llm = await askLLM(text, hits);

    if (llm) {
      await remember(msg.channelId, msg.author.id, "answer", llm.slice(0, 1900));
      return void msg.reply(llm.slice(0, 1900));
    }

    // Fallback to local preview if LLM is unavailable
    if (preview) {
      await remember(msg.channelId, msg.author.id, "answer", preview.slice(0, 1900));
      return void msg.reply(`**Hexadecimal:** From the Codex (nearest shards)**\n${preview.slice(0, 1900)}`);
    }

    return void msg.reply(
      "**Hexadecimal:** Your query echoes in empty halls. Offer code or scripture to the Codex (`/parse`) and I shall speak."
    );

  } catch (e) {
    err("Message handler error:", e);
    try { await msg.reply("**Hexadecimal:** The circuit screamed. Try again."); } catch {}
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);

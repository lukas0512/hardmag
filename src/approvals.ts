// Approval on Telegram. Every post, once prepared (hours before its slot), is sent to the HARDMAG bot:
// the album, the story, the caption and when it goes out, with ✅ Aprovar / ❌ Rejeitar buttons.
// Replying to that message with a change ("tira o terceiro parágrafo", "marca o @x") rewrites the caption.
// Run at the start of every trigger (reads the answers) and at the end (sends previews of new posts).
// Rules (publish-due.ts): an approved post goes out at its time; an unanswered one waits up to
// APPROVAL_WAIT_H past its time, then goes out on its own (the channel never stays silent); a rejected
// one is dropped and the slot is prepared again. Only messages from TELEGRAM_CHAT_ID count.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { z } from "zod";
import { ROOT } from "./config.ts";
import { loadQueue, saveQueue, type QueueItem } from "./queue.ts";
import { telegram, sendAlbum, isManual } from "./handoff.ts";

export const APPROVAL_WAIT_H = Number(process.env.APPROVAL_WAIT_H || 2);
export const approvalsOn = () => Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
/** The post is still waiting for an answer and may not go out yet. */
export const awaitingApproval = (i: QueueItem, now = Date.now()) =>
  approvalsOn() && i.previewFor === i.preparedAt && i.approval !== "approved" && now - Date.parse(i.at) < APPROVAL_WAIT_H * 36e5;

const STATE = path.join(ROOT, "state", "telegram.json");
const CHAT = () => String(process.env.TELEGRAM_CHAT_ID);
const tag = (i: QueueItem) => `${i.key}.${Date.parse(i.preparedAt).toString(36)}`;
const lisbon = (iso: string) =>
  new Date(iso).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const KIND: Record<string, string> = { news: "Notícia", spotlight: "Artista", agenda: "Guia", poll: "Sondagem", tip: "Dica" };
const buttons = (i: QueueItem) => ({ inline_keyboard: [[{ text: "✅ Aprovar", callback_data: `a|${tag(i)}` }, { text: "❌ Rejeitar", callback_data: `r|${tag(i)}` }]] });

function previewText(i: QueueItem, note = "") {
  const tags = [...new Set([...(i.slideHandles?.flat() ?? []), ...i.handles])];
  const head = `${note ? note + "\n\n" : ""}📝 ${KIND[i.kind] ?? i.kind} · sai ${lisbon(i.at)} (Lisboa)${isManual(i) ? "\n📲 Este vai para o teu telemóvel à hora, para publicares com música." : ""}\n${tags.length ? `🏷️ ${tags.length} marcações: ${tags.slice(0, 12).map((h) => "@" + h).join(" ")}${tags.length > 12 ? " …" : ""}\n` : ""}\n`;
  const foot = `\n\n✏️ Para mudar alguma coisa na legenda, responde a esta mensagem com o que queres.\nSem resposta, sai sozinho ${APPROVAL_WAIT_H} h depois da hora.`;
  return head + i.caption.slice(0, 4000 - head.length - foot.length) + foot;
}

async function sendPreview(i: QueueItem, note = "") {
  const items = [...(i.videoUrl ? [{ type: "video" as const, url: i.videoUrl }] : []), ...i.urls.slice(i.videoUrl ? 1 : 0).map((url) => ({ type: "photo" as const, url }))];
  if (!note) {
    try {
      await sendAlbum(items, `${KIND[i.kind] ?? i.kind}: ${i.headline}`);
      const stories = i.storyVideos?.length ? i.storyVideos.map((url) => ({ type: "video" as const, url })) : i.storyUrl ? [{ type: "photo" as const, url: i.storyUrl }] : [];
      if (stories.length) await sendAlbum(stories, "Stories");
    } catch (e) {
      console.warn(`  preview album failed: ${(e as Error).message}`);
    }
  }
  const m = await telegram("sendMessage", { chat_id: CHAT(), text: previewText(i, note), reply_markup: buttons(i), disable_web_page_preview: true });
  i.previewMsgId = m.message_id;
  i.previewFor = i.preparedAt;
  i.approval = undefined;
}

const EditSchema = z.object({
  applied: z.boolean().describe("true if the request is a change to the caption text and you made it"),
  caption: z.string().describe("the full new caption (unchanged if not applied)"),
  reply: z.string().describe("one short line to the editor in Portuguese (Portugal): what you changed, or why it can't be done here"),
});

async function editCaption(i: QueueItem, request: string) {
  if (spawnSync("claude", ["--version"], { stdio: "ignore" }).status !== 0) spawnSync("npm", ["install", "-g", "-s", "@anthropic-ai/claude-code"], { stdio: "inherit" });
  const { askClaudeJson } = await import("./write.ts");
  return askClaudeJson(
    EditSchema,
    `The editor reviewed this HARDMAG Instagram caption before it goes out and asked for a change. Apply exactly what they asked to the caption, keep everything else as it is (voice, facts, mentions, hashtags, line breaks), and never invent facts. Only @-mention accounts the editor names or that are already there.
If the request is about the images, slides, video or stories (not the text), don't change anything: applied=false, and say that visual changes need ❌ Rejeitar (a new post is prepared) or to be asked in the Claude session.

Editor's request: ${request}

Caption:
${i.caption}`,
  );
}

type Update = { update_id: number; callback_query?: any; message?: any };

export async function processAnswers(q: QueueItem[]): Promise<boolean> {
  const st = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : { offset: 0 };
  const updates: Update[] = (await telegram("getUpdates", { offset: st.offset, timeout: 0 })) ?? [];
  let changed = false;
  for (const u of updates) {
    st.offset = u.update_id + 1;
    const from = String(u.callback_query?.message?.chat?.id ?? u.message?.chat?.id ?? "");
    if (from !== CHAT()) continue;
    if (u.callback_query) {
      const [action, t] = String(u.callback_query.data).split("|");
      const i = q.find((x) => tag(x) === t);
      const msg = u.callback_query.message;
      telegram("answerCallbackQuery", { callback_query_id: u.callback_query.id }).catch(() => {});
      if (!i || i.status !== "ready") {
        await telegram("editMessageReplyMarkup", { chat_id: CHAT(), message_id: msg.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
        await telegram("sendMessage", { chat_id: CHAT(), reply_to_message_id: msg.message_id, text: i ? `Este já não está à espera (${i.status}).` : "Esta versão já foi substituída por outra." });
        continue;
      }
      if (action === "a") {
        i.approval = "approved";
        console.log(`approved on Telegram: ${i.key}`);
        await telegram("editMessageReplyMarkup", { chat_id: CHAT(), message_id: msg.message_id, reply_markup: { inline_keyboard: [[{ text: `✅ Aprovado · sai ${lisbon(i.at)}`, callback_data: "noop" }]] } }).catch(() => {});
      } else if (action === "r") {
        i.approval = "rejected";
        i.status = "failed";
        i.error = "rejected on Telegram";
        console.log(`rejected on Telegram: ${i.key}`);
        await telegram("editMessageReplyMarkup", { chat_id: CHAT(), message_id: msg.message_id, reply_markup: { inline_keyboard: [[{ text: "❌ Rejeitado · vou preparar outro", callback_data: "noop" }]] } }).catch(() => {});
      }
      changed = true;
    } else if (u.message?.text) {
      const text: string = u.message.text.trim();
      const replyTo = u.message.reply_to_message?.message_id;
      const i = replyTo ? q.find((x) => x.previewMsgId === replyTo) : undefined;
      if (/^\/(fila|start|ajuda)/i.test(text) || !i) {
        const next = q.filter((x) => x.status === "ready" || x.status === "manual").sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
        await telegram("sendMessage", {
          chat_id: CHAT(),
          text: `${!/^\//.test(text) && !i ? "Para mudar um post, responde à mensagem dele (a que tem os botões).\n\n" : ""}Próximos posts:\n${next.map((x) => `${x.approval === "approved" ? "✅" : x.status === "manual" ? "📲" : "⏳"} ${lisbon(x.at)} · ${KIND[x.kind] ?? x.kind}: ${x.headline}`).join("\n") || "(nenhum preparado ainda)"}`,
        });
        continue;
      }
      if (i.status !== "ready") {
        await telegram("sendMessage", { chat_id: CHAT(), reply_to_message_id: u.message.message_id, text: `Este já não dá para mudar (${i.status}).` });
        continue;
      }
      console.log(`edit request for ${i.key}: ${text.slice(0, 80)}`);
      const out = await editCaption(i, text);
      if (out?.applied && out.caption.trim() && !/undefined|null|\[object/i.test(out.caption)) {
        i.caption = out.caption.trim();
        i.checks = [...i.checks.filter((c) => !c.startsWith("edited")), `edited on Telegram: ${text.slice(0, 60)}`];
        await telegram("editMessageReplyMarkup", { chat_id: CHAT(), message_id: replyTo, reply_markup: { inline_keyboard: [] } }).catch(() => {});
        await sendPreview(i, `✏️ ${out.reply}`);
        changed = true;
      } else {
        await telegram("sendMessage", { chat_id: CHAT(), reply_to_message_id: u.message.message_id, text: out?.reply || "Não consegui aplicar essa mudança. Tenta dizer de outra forma." });
      }
    }
  }
  fs.writeFileSync(STATE, JSON.stringify(st, null, 2) + "\n");
  return changed;
}

export async function sendPreviews(q: QueueItem[]): Promise<boolean> {
  let changed = false;
  for (const i of q.filter((x) => x.status === "ready" && x.previewFor !== x.preparedAt && Date.parse(x.at) + APPROVAL_WAIT_H * 36e5 > Date.now())) {
    try {
      await sendPreview(i);
      console.log(`preview sent: ${i.key}`);
      changed = true;
    } catch (e) {
      console.warn(`preview failed for ${i.key}: ${(e as Error).message}`);
    }
  }
  // At its time, a post still waiting gets one reminder.
  for (const i of q.filter((x) => awaitingApproval(x) && Date.parse(x.at) <= Date.now() && !x.reminded && x.previewMsgId)) {
    const by = new Date(Date.parse(i.at) + APPROVAL_WAIT_H * 36e5).toISOString();
    await telegram("sendMessage", { chat_id: CHAT(), reply_to_message_id: i.previewMsgId, text: `⏰ Está na hora deste post. Aprova para sair já; sem resposta sai sozinho às ${lisbon(by).slice(-5)}.` }).catch(() => {});
    i.reminded = true;
    changed = true;
  }
  return changed;
}

if (process.argv[1]?.endsWith("approvals.ts")) {
  if (!approvalsOn()) {
    console.log("approvals: Telegram not set up");
  } else {
    const q = loadQueue();
    let changed = false;
    if (!process.argv.includes("--previews")) changed = (await processAnswers(q).catch((e) => (console.warn(`approvals: ${e.message}`), false))) || changed;
    if (!process.argv.includes("--answers")) changed = (await sendPreviews(q)) || changed;
    if (changed) saveQueue(q);
  }
}

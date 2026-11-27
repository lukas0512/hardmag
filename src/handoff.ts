// Hand-off for posts that should go out with music from Instagram's own library (trending audio).
// The API can't pick library music and copyrighted audio baked into our video gets muted, so for these
// posts we don't publish: at the slot time we send the ready post (files, caption, 3 matching music
// suggestions) to the phone, as a GitHub issue (push from the GitHub app) and on Telegram when set up.
// The post is then considered done when it shows up on our Instagram (same caption opening) or the
// issue is closed. If nothing happens within MANUAL_WAIT_H, it goes out automatically without music.
import { spawnSync } from "node:child_process";
import { z } from "zod";
import { CONFIG } from "./config.ts";
import { askClaudeJson } from "./write.ts";
import type { QueueItem } from "./queue.ts";

export const MANUAL_WAIT_H = Number(process.env.MANUAL_WAIT_H || 2);
// Which kinds go through the phone. Default: the guides. "all" sends everything; "" turns it off.
const KINDS = (process.env.MANUAL_KINDS ?? "agenda").split(",").map((s) => s.trim()).filter(Boolean);
export const isManual = (i: QueueItem) => KINDS.includes("all") || KINDS.includes(i.kind);

const owner = () => (process.env.GITHUB_REPOSITORY || CONFIG.mediaRepo || "").split("/")[0];
const repo = () => process.env.GITHUB_REPOSITORY || CONFIG.mediaRepo;

/* ---------- music suggestions ---------- */

const MusicSchema = z.object({
  tracks: z
    .array(z.object({ artist: z.string(), title: z.string(), why: z.string().describe("max 8 words, in Portuguese (Portugal)") }))
    .describe("exactly 3, best first"),
});
export type Suggestion = z.infer<typeof MusicSchema>["tracks"][number];

export async function suggestMusic(i: QueueItem): Promise<Suggestion[]> {
  const people = [...new Set([...(i.slideHandles?.flat() ?? []), ...i.handles])].slice(0, 20).join(", ");
  const out = await askClaudeJson(
    MusicSchema,
    `Pick the music for this HARDMAG Instagram post. The person posting will search Instagram's music library in the app and pick one of your 3 tracks, so they must be real, released tracks that are on Instagram/Spotify, and that are being used or played a lot right now (late ${new Date().getUTCFullYear()}).
The track must fit THIS post: first choice a track by the artist the post is about (a guide: the headliner on the cover / of the first pick), then a current techno, hard groove, bouncy or house track of the post's sound. Never pop, never generic stock music. Look up what's current if you can.

Post: ${i.headline}
Kind: ${i.kind}
${i.article.standfirst}
Accounts in it: ${people || "-"}
Caption opening: ${i.caption.slice(0, 600)}`,
    true,
  ).catch(() => null);
  return out?.tracks.slice(0, 3) ?? [];
}

/* ---------- delivery ---------- */

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("pt-PT", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit" });

function body(i: QueueItem, music: Suggestion[], deadline: string, test: boolean) {
  const files = [...(i.videoUrl ? [`- Capa animada (vídeo): ${i.videoUrl}`] : []), ...i.urls.slice(i.videoUrl ? 1 : 0).map((u, n) => `- Slide ${n + (i.videoUrl ? 2 : 1)}: ${u}`)];
  return `@${owner()} ${test ? "**TESTE**: isto é só um ensaio, não publiques.\n\n" : ""}Post pronto para publicares com música do Instagram.

**1. Guarda os ficheiros** (abre cada link e guarda no telemóvel, por esta ordem):
${files.join("\n")}

**2. Música** (procura no ecrã de música do Instagram e escolhe a que estiver lá):
${music.length ? music.map((m, n) => `${n + 1}. **${m.artist} – ${m.title}** (${m.why})`).join("\n") : "- (sem sugestões desta vez: escolhe um techno/house em alta que combine)"}

**3. Legenda** (copia tudo):
\`\`\`
${i.caption}
\`\`\`
${i.slideHandles?.some((s) => s.length) ? `\nMarcações nas fotos (opcional, a legenda já menciona): ${[...new Set(i.slideHandles.flat())].map((h) => "@" + h).join(" ")}\n` : ""}
**4. Publica.** Eu dou conta sozinho quando o post aparecer no Instagram e publico os stories a seguir. Se até às **${deadline}** não aparecer nada, publico eu sem música.`;
}

function gh(args: string[], input?: string) {
  const r = spawnSync("gh", args, { encoding: "utf8", input });
  if (r.status !== 0) throw new Error(`gh ${args.slice(0, 2).join(" ")}: ${r.stderr.slice(0, 200)}`);
  return r.stdout.trim();
}

async function telegram(method: string, payload: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const j = (await res.json()) as { ok: boolean; description?: string };
  if (!j.ok) throw new Error(`telegram ${method}: ${j.description}`);
}

async function sendTelegram(i: QueueItem, music: Suggestion[], deadline: string, issueUrl: string, test: boolean) {
  const chat_id = process.env.TELEGRAM_CHAT_ID;
  if (!process.env.TELEGRAM_BOT_TOKEN || !chat_id) return false;
  // Upload the files ourselves: Telegram can't always fetch them from the CDN by URL.
  const items = [...(i.videoUrl ? [{ type: "video", url: i.videoUrl }] : []), ...i.urls.slice(i.videoUrl ? 1 : 0).map((url) => ({ type: "photo", url }))].slice(0, 10);
  try {
    const form = new FormData();
    form.set("chat_id", String(chat_id));
    const media = [];
    for (const [n, it] of items.entries()) {
      const r = await fetch(it.url);
      if (!r.ok) throw new Error(`download ${it.url}: ${r.status}`);
      const name = `f${n}.${it.type === "video" ? "mp4" : "jpg"}`;
      form.set(name, new Blob([await r.arrayBuffer()], { type: it.type === "video" ? "video/mp4" : "image/jpeg" }), name);
      media.push({ type: it.type, media: `attach://${name}`, ...(it.type === "video" ? { supports_streaming: true } : {}) });
    }
    form.set("media", JSON.stringify(media));
    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMediaGroup`, { method: "POST", body: form });
    const j = (await res.json()) as { ok: boolean; description?: string };
    if (!j.ok) throw new Error(`telegram sendMediaGroup: ${j.description}`);
  } catch (e) {
    console.warn(`  telegram album failed (${(e as Error).message}), sending links only`);
  }
  await telegram("sendMessage", {
    chat_id,
    disable_web_page_preview: true,
    text: `${test ? "🧪 TESTE (não publicar)\n\n" : ""}📲 ${i.headline}\n\n🎵 Música:\n${music.map((m, n) => `${n + 1}. ${m.artist} – ${m.title} (${m.why})`).join("\n") || "escolhe um techno/house em alta"}\n\nGuarda o álbum acima pela ordem, escolhe a música no Instagram e cola a legenda da mensagem seguinte. Se até às ${deadline} não publicares, publico eu sem música.\n${issueUrl}`,
  });
  await telegram("sendMessage", { chat_id, text: i.caption.slice(0, 4096) });
  return true;
}

/** Sends the hand-off. Returns the issue number. */
export async function sendHandoff(i: QueueItem, test = false): Promise<{ issue?: number; telegram: boolean; music: Suggestion[] }> {
  const music = await suggestMusic(i);
  const deadline = hhmm(new Date(Date.now() + MANUAL_WAIT_H * 36e5).toISOString());
  let issue: number | undefined;
  let url = "";
  try {
    url = gh(["issue", "create", "-R", repo(), "--title", `${test ? "[TESTE] " : ""}📲 Publicar com música: ${i.headline}`, "--body-file", "-"], body(i, music, deadline, test));
    issue = Number(url.split("/").pop());
  } catch (e) {
    console.warn(`  issue failed: ${(e as Error).message}`);
  }
  let tg = false;
  try {
    tg = await sendTelegram(i, music, deadline, url, test);
  } catch (e) {
    console.warn(`  telegram failed: ${(e as Error).message}`);
  }
  return { issue, telegram: tg, music };
}

/* ---------- was it posted? ---------- */

const norm = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 60).toLowerCase();

/** Our Instagram media published after `since` whose caption starts like this post's. */
export async function findManualPost(i: QueueItem, since: string): Promise<string | undefined> {
  if (!CONFIG.igToken) return;
  const res = await fetch(`https://${CONFIG.igApiHost}/${CONFIG.igApiVersion}/${CONFIG.igUserId}/media?fields=id,caption,timestamp&limit=10&access_token=${encodeURIComponent(CONFIG.igToken)}`);
  const j = (await res.json()) as { data?: { id: string; caption?: string; timestamp: string }[] };
  const want = norm(i.caption);
  return j.data?.find((m) => Date.parse(m.timestamp) >= Date.parse(since) - 6e4 && norm(m.caption ?? "") === want)?.id;
}

export function issueClosed(n?: number) {
  if (!n) return false;
  try {
    return gh(["issue", "view", String(n), "-R", repo(), "--json", "state", "-q", ".state"]) === "CLOSED";
  } catch {
    return false;
  }
}

export function closeIssue(n: number | undefined, comment: string) {
  if (!n) return;
  try {
    gh(["issue", "close", String(n), "-R", repo(), "--comment", comment]);
  } catch {}
}

// Manual test: node src/handoff.ts --test <queue key> (sends a [TESTE] hand-off for that post, changes nothing).
if (process.argv[1]?.endsWith("handoff.ts") && process.argv.includes("--test")) {
  const { loadQueue } = await import("./queue.ts");
  const key = process.argv[process.argv.indexOf("--test") + 1];
  const q = loadQueue();
  const item = q.filter((i) => !key || i.key === key).filter((i) => i.status !== "failed").pop();
  if (!item) throw new Error(`no queue item ${key}`);
  const r = await sendHandoff(item, true);
  console.log(`test hand-off for ${item.key}: issue #${r.issue ?? "-"}, telegram ${r.telegram ? "sent" : "not set up"}`);
  console.log(r.music.map((m) => `  🎵 ${m.artist} – ${m.title} (${m.why})`).join("\n"));
}

// Editorial queue: every post is written, reviewed, rendered, hosted and test-built on Instagram
// hours before its slot (npm run prepare). At slot time the publisher only has to press "publish"
// (src/publish-due.ts), so slow schedulers, flaky sources or a picky critic never leave a slot empty.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./config.ts";
import type { Article } from "./articles.ts";
import type { PostedEntry } from "./state.ts";
import { buildContainer } from "./publish.ts";

// Slot times in UTC (= Lisbon in winter). Each day gets its own random offset so posts don't land
// at the exact same minute every day.
export const SLOT_TIMES: Record<string, string> = { "pt-news": "08:50", "pt-artists": "13:30", "pt-scene": "19:45" };
export const SLOT_ORDER = Object.keys(SLOT_TIMES);
const OFFSET_MIN = 20; // ± minutes
export const PREPARE_AHEAD_H = 12; // prepare a slot this many hours before it
export const PUBLISH_WINDOW_H = 4; // a ready post still goes out up to this long after its time

export type QueueItem = {
  key: string; // 2026-11-22-pt-news
  day: string;
  slot: string;
  at: string; // ISO time it should go out
  status: "ready" | "posted" | "failed" | "expired" | "skipped";
  preparedAt: string;
  headline: string;
  kind: "news" | "spotlight" | "agenda" | "poll" | "tip";
  urls: string[]; // hosted slides
  videoUrl?: string;
  caption: string;
  handles: string[];
  article: Omit<Article, "date" | "igMediaId">;
  posted: Omit<PostedEntry, "at" | "igMediaId">;
  featured?: string; // spotlight artist to mark as featured once posted
  checks: string[]; // what was validated
  igMediaId?: string;
  publishedAt?: string;
  error?: string;
};

const FILE = path.join(ROOT, "state", "queue.json");
export const loadQueue = (): QueueItem[] => (fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : []);
export function saveQueue(q: QueueItem[]) {
  const cutoff = Date.now() - 14 * 864e5; // keep two weeks of history
  fs.writeFileSync(FILE, JSON.stringify(q.filter((i) => Date.parse(i.at) > cutoff), null, 2) + "\n");
}

export function slotTime(day: string, slot: string): Date {
  const [h, m] = SLOT_TIMES[slot].split(":").map(Number);
  // Deterministic per day+slot, so re-preparing keeps the same time.
  let seed = 0;
  for (const c of day + slot) seed = (seed * 31 + c.charCodeAt(0)) % 9973;
  const offset = (seed % (2 * OFFSET_MIN + 1)) - OFFSET_MIN;
  return new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), h, m + offset));
}

// The next slots from now on, in order.
export function upcoming(now = new Date(), days = 2): { day: string; slot: string; at: Date }[] {
  const out: { day: string; slot: string; at: Date }[] = [];
  for (let d = 0; d <= days; d++) {
    const day = new Date(now.getTime() + d * 864e5).toISOString().slice(0, 10);
    for (const slot of SLOT_ORDER) {
      const at = slotTime(day, slot);
      if (at.getTime() + PUBLISH_WINDOW_H * 36e5 > now.getTime()) out.push({ day, slot, at });
    }
  }
  return out;
}

// What the scheduler should do now: publish a due post, prepare the next empty slot, or nothing.
export function plan(now = new Date(), pauseUntil = "") {
  const q = loadQueue();
  const today = now.toISOString().slice(0, 10);
  const due = q
    .filter((i) => i.status === "ready" && Date.parse(i.at) <= now.getTime() && now.getTime() - Date.parse(i.at) <= PUBLISH_WINDOW_H * 36e5)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0];
  const paused = pauseUntil && today < pauseUntil;
  const next = upcoming(now).find(
    (u) => (!pauseUntil || u.day >= pauseUntil) && u.at.getTime() - now.getTime() <= PREPARE_AHEAD_H * 36e5 && !q.some((i) => i.key === `${u.day}-${u.slot}` && i.status !== "failed"),
  );
  return { publish: paused ? undefined : due?.key, prepare: next ? `${next.day} ${next.slot}` : undefined };
}

/* ---------- Validation ---------- */

async function head(url: string): Promise<{ ok: boolean; type: string; size: number }> {
  const r = await fetch(url, { method: "GET", signal: AbortSignal.timeout(30000) });
  const buf = r.ok ? await r.arrayBuffer() : new ArrayBuffer(0);
  return { ok: r.ok, type: r.headers.get("content-type") ?? "", size: buf.byteLength };
}

// Everything Instagram would check, plus our own rules. Throws with a readable reason.
// Returns the list of checks passed; may drop a video that Instagram refuses (images-only fallback).
export async function validate(item: QueueItem, withInstagram: boolean): Promise<string[]> {
  const checks: string[] = [];
  const fail = (m: string) => {
    throw new Error(m);
  };
  if (item.caption.length > 2200) fail(`caption too long (${item.caption.length}/2200)`);
  const tags = item.caption.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  if (tags.length > 30) fail(`${tags.length} hashtags (max 30)`);
  const mentions = item.caption.match(/@[\w.]+/g) ?? [];
  if (mentions.length > 20) fail(`${mentions.length} mentions (max 20)`);
  if (/undefined|null|\[object/i.test(item.caption)) fail("caption contains a template error");
  checks.push(`caption ok (${item.caption.length} chars, ${tags.length} hashtags, ${mentions.length} mentions)`);
  if (!item.urls.length || item.urls.length > 10) fail(`${item.urls.length} slides (1-10)`);
  for (const u of item.urls) {
    const h = await head(u).catch(() => ({ ok: false, type: "", size: 0 }));
    if (!h.ok || !/image\/(jpeg|png)/.test(h.type) || h.size < 30_000 || h.size > 8_000_000) fail(`slide not usable: ${u} (${h.type || "no response"}, ${h.size} bytes)`);
  }
  checks.push(`${item.urls.length} slide(s) online`);
  if (item.videoUrl) {
    const h = await head(item.videoUrl).catch(() => ({ ok: false, type: "", size: 0 }));
    if (!h.ok || h.size < 50_000) {
      item.videoUrl = undefined;
      checks.push("video unreachable: images only");
    } else checks.push("video online");
  }
  if (!item.article.headline || !item.article.body?.length) fail("website article is empty");
  checks.push("website article ok");
  if (withInstagram) {
    try {
      await buildContainer(item.urls, item.caption, item.handles, item.videoUrl);
      checks.push(`Instagram accepted the post${item.videoUrl ? " (with motion cover)" : ""}`);
    } catch (e) {
      if (!item.videoUrl) throw e;
      item.videoUrl = undefined;
      await buildContainer(item.urls, item.caption, item.handles);
      checks.push("Instagram refused the video: images only, accepted");
    }
  }
  return checks;
}

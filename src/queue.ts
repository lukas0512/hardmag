// Editorial queue: every post is written, reviewed, rendered, hosted and test-built on Instagram
// hours before its slot (npm run prepare). At slot time the publisher only has to press "publish"
// (src/publish-due.ts), so slow schedulers, flaky sources or a picky critic never leave a slot empty.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./config.ts";
import type { Article } from "./articles.ts";
import type { PostedEntry } from "./state.ts";
import { buildContainer, buildStory } from "./publish.ts";

// Slot times in UTC (= Lisbon in winter). Each day gets its own random offset so posts don't land
// at the exact same minute every day.
// 5 posts a day (UTC = Lisbon winter time), plus the breaking-news radar.
export const SLOT_TIMES: Record<string, string> = { "pt-news": "08:50", "pt-midday": "12:15", "pt-artists": "15:00", "pt-scene": "19:45", "pt-night": "22:30" };
export const SLOT_ORDER = Object.keys(SLOT_TIMES);
const OFFSET_MIN = 20; // ± minutes
// How far ahead a slot is prepared. Short on purpose: we're a news channel and news must be under
// 24 h old when it posts, so a slot prepared 1-2 days ahead could only ever get a poll. 8 h still
// leaves ~24 scheduler runs to get it right.
export const PREPARE_AHEAD_H = 8;
export const PUBLISH_WINDOW_H = 4;
export const REFRESH_AHEAD_H = 5; // this close to the slot, look for fresher news to replace the queued post
export const RADAR_EVERY_MIN = 55;
export const NEWS_HARD_LIMIT_H = 30; // never publish news older than this (24 h target, some slack)
// News that would be too old at time t. Items queued before storyAt existed: the story is at least as
// old as the moment it was prepared.
export const tooOld = (i: QueueItem, t: number) => i.kind === "news" && t - Date.parse(i.storyAt ?? i.preparedAt) > NEWS_HARD_LIMIT_H * 36e5; // breaking-news check, daytime only
// Items worth refreshing: news (it ages) and the morning news slot when it holds an evergreen
// spotlight (fresh Portuguese news beats it). Polls and agendas are made for their day.
// Polls outside the evening slot are fallbacks (made 1-2 days ahead, when no news is young enough
// yet), so they get the same check for fresh news a few hours before.
const refreshable = (i: QueueItem) => i.kind === "news" || (i.slot === "pt-news" && i.kind === "spotlight") || (i.kind === "poll" && i.slot !== "pt-scene"); // a ready post still goes out up to this long after its time

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
  storyUrl?: string; // 9:16 story shared right after the feed post
  caption: string;
  handles: string[];
  slideHandles?: string[][]; // per-slide tags (guides: each night's artists and venue on its slide)
  article: Omit<Article, "date" | "igMediaId">;
  posted: Omit<PostedEntry, "at" | "igMediaId">;
  featured?: string; // spotlight artist to mark as featured once posted
  checks: string[]; // what was validated
  igMediaId?: string;
  publishedAt?: string;
  error?: string;
  refreshTried?: string; // when we last looked for fresher news for this slot
  storyAt?: string; // when the source story came out (news only)
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
  const stale = q
    .filter((i) => i.status === "ready" && refreshable(i) && !i.refreshTried && Date.parse(i.at) > now.getTime() && Date.parse(i.at) - now.getTime() <= REFRESH_AHEAD_H * 36e5 && Date.parse(i.at) - Date.parse(i.preparedAt) > REFRESH_AHEAD_H * 36e5)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0];
  // A refresh is time-critical (the slot is hours away), so it goes before preparing further ahead.
  const prepare = stale ? `${stale.day} ${stale.slot}` : next ? `${next.day} ${next.slot}` : undefined;
  const refresh = Boolean(stale);
  // Breaking-news radar: when there's nothing to prepare, 08:00-23:59 Lisbon, about once an hour.
  const rf = path.join(ROOT, "state", "radar.json");
  const lastRadar = fs.existsSync(rf) ? Date.parse(JSON.parse(fs.readFileSync(rf, "utf8")).lastCheck ?? 0) || 0 : 0;
  const radar = !paused && !prepare && now.getUTCHours() >= 8 && now.getTime() - lastRadar >= RADAR_EVERY_MIN * 6e4;
  return { publish: paused ? undefined : due?.key, prepare, refresh, radar };
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
  if (item.storyUrl) {
    const h = await head(item.storyUrl).catch(() => ({ ok: false, type: "", size: 0 }));
    if (!h.ok || h.size < 30_000) {
      item.storyUrl = undefined;
      checks.push("story image unreachable: no story");
    } else checks.push("story online");
  }
  if (!item.article.headline || !item.article.body?.length) fail("website article is empty");
  checks.push("website article ok");
  if (withInstagram) {
    try {
      await buildContainer(item.urls, item.caption, item.handles, item.videoUrl, item.slideHandles);
      checks.push(`Instagram accepted the post${item.videoUrl ? " (with motion cover)" : ""}`);
    } catch (e) {
      if (!item.videoUrl) throw e;
      item.videoUrl = undefined;
      await buildContainer(item.urls, item.caption, item.handles, undefined, item.slideHandles);
      checks.push("Instagram refused the video: images only, accepted");
    }
  }
  if (withInstagram && item.storyUrl) {
    try {
      await buildStory(item.storyUrl);
      checks.push("Instagram accepted the story");
    } catch (e) {
      item.storyUrl = undefined;
      checks.push(`story refused (${(e as Error).message.slice(0, 80)}): feed post only`);
    }
  }
  return checks;
}

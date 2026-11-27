// HARDMAG pipeline: fetch -> pick -> write -> render -> host -> publish.
// Flags: --dry (render only, never publish), --count N (posts this run)
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { CONFIG, PATHS, BRAND, ROOT } from "./config.ts";
import { fetchStories, fetchArticle, downloadImage, type Story } from "./fetch.ts";
import { pickStories, writePost, reviewPost, rewritePost, writeSpotlight, writeCuriosity, buildCaption, hasClaude, type WrittenPost } from "./write.ts";
import { postSlides, agendaCover, agendaList, pollCover, storyFrame, weekBoard, weekGenres, weekDay, weekSave, storyDay, type PostContent, type Slide, type WeekItem } from "./templates.ts";
import { writeAgenda, agendaSlidesData, writePoll, writeWeek, dayLabel, GENRES, shotgunDetails, shotgunPortrait } from "./formats.ts";
import { preparePhoto } from "./photo.ts";
import { wikiPhoto, libraryPhoto } from "./library.ts";
import { scoutStories } from "./scout.ts";
import { renderCoverVideo, renderAnimation } from "./video.ts";
import { pickTrack, trackCredit, type Track } from "./music.ts";
import { nextArtist, nextCuriosity, markCuriosity, gatherMaterial, markFeatured, markTried, type Artist } from "./spotlight.ts";
import { renderSlides, closeRenderer } from "./render.ts";
import { hostImage, publishToInstagram, publishStory } from "./publish.ts";
import { loadState, saveState, normTitle } from "./state.ts";
import { saveArticle, articleUrl } from "./articles.ts";
import { resolveTags } from "./people.ts";
import { collectInsights, learnings, writeReport } from "./insights.ts";
import { SOURCES } from "./sources.ts";
import crypto from "node:crypto";
import { loadQueue, saveQueue, slotTime, validate, tooOld, type QueueItem } from "./queue.ts";
import { writeQueueReport } from "./queue-status.ts";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const countArg = args.indexOf("--count");
// --radar: hourly check. Posts one story only if the editor rates it hot: a Portuguese story at
// heat >= RADAR_PT_MIN_HEAT, a story from abroad only at RADAR_GLOBAL_MIN_HEAT (something huge),
// at most RADAR_DAILY_MAX posts in 24h overall, and never within RADAR_GAP_MIN of the last post.
const radar = args.includes("--radar");
const RADAR_PT_MIN_HEAT = Number(process.env.RADAR_PT_MIN_HEAT ?? 8);
const RADAR_GLOBAL_MIN_HEAT = Number(process.env.RADAR_GLOBAL_MIN_HEAT ?? 10);
// Portugal first in everything: a story from abroad only goes out when it's this hot (1-10).
const GLOBAL_MIN_HEAT = Number(process.env.GLOBAL_MIN_HEAT ?? 9);
const RADAR_DAILY_MAX = Number(process.env.RADAR_DAILY_MAX ?? 7); // 5 scheduled + up to 2 breaking
const RADAR_GAP_MIN = Number(process.env.RADAR_GAP_MIN ?? 75);
// --slot NAME: daily themed slot (one theme per post, so the feed covers every niche).
const SLOTS: Record<string, string> = {
  lisbon: "Lisbon & Portugal: Portuguese clubs, DJs, producers, labels, festivals, nightlife policy. A Portuguese-language source story is ideal.",
  club: "Hard techno and club culture: hard techno artists and parties, techno and house scenes, clubs, festivals, lineups.",
  tech: "AI, technology and the industry: AI in music, production tools and gear, streaming and royalties, and the debates the scene is having right now.",
  artists: "Artists: news about a specific DJ or producer (new release, big set, statement, milestone, viral moment) that the artist would want to share.",
  // Portugal focus (current schedule: 3 posts a day)
  "pt-news": "Portugal first: news from Lisbon, Porto and the rest of Portugal (clubs, festivals, nightlife policy, venues opening or closing, the scene). A Portuguese-language source story is ideal.",
  "pt-artists": "Portuguese artists, DJs, producers, labels and clubs: releases, gigs, milestones, achievements abroad. If no Portuguese story is worth it, an international artist with a Portugal date or link.",
  "pt-midday": "Portugal first, lunchtime: fresh Portuguese scene news (lineups announced, parties, clubs, festivals, Portuguese artists' releases and gigs). The day's second look at what's happening.",
  "pt-night": "For the night crowd in Portugal: what's on and what's coming (lineups, party and festival announcements, club news in Lisbon and Porto), Portuguese artists' news, or the scene story people will talk about on the way out.",
  "pt-scene": "What matters to ravers in Portugal tonight: Portuguese scene news (parties, clubs, lineups, festivals, Portuguese artists). From abroad only something with a Portugal angle (artists touring Portugal, festivals with Portuguese dates) or so big the Portuguese scene is talking about it.",
};
const slotArg = args.indexOf("--slot");
const slot = slotArg >= 0 ? args[slotArg + 1] : "";
const anyStory = args.includes("--any"); // Portugal slot fallback: allow the whole pool
const lastResort = args.includes("--last"); // with --any: stories from abroad at the normal bar, not just huge ones
// --refresh (with --prepare): a few hours before the slot, look for fresher news to replace what was
// prepared earlier. News only, full quality bar, no runner-up: if nothing better, the queued post stays.
const refresh = args.includes("--refresh");
// We're a news channel: a story must be at most this old when it goes out (radar: breaking only).
const NEWS_MAX_AGE_H = Number(process.env.NEWS_MAX_AGE_H ?? 24);
const RADAR_MAX_AGE_H = Number(process.env.RADAR_MAX_AGE_H ?? 6);
const focus = SLOTS[slot] ?? "";
// --jitter N: wait a random 0..N minutes first, so posting times vary day to day.
const jitterArg = args.indexOf("--jitter");
const jitterMin = jitterArg >= 0 ? Number(args[jitterArg + 1]) : 0;
// Minimum "interest" score from the chief editor (1-10) for a post to go out.
const MIN_QUALITY = Number(process.env.MIN_QUALITY ?? 7);
const count = radar ? 1 : countArg >= 0 ? Number(args[countArg + 1]) : CONFIG.postsPerRun;
// --gap N: minutes between posts (launch mode: several posts spread over a few hours).
const gapArg = args.indexOf("--gap");
const gapMin = gapArg >= 0 ? Number(args[gapArg + 1]) : 0;
// --tip FILE: post one story the editor-in-chief handed in (state/tips/*.json), skipping feeds and picking.
// Needed for outlets that block bots (DJ Mag): the tip carries the article text and the photo URL.
// Optional "written": a reviewed copy to publish as is (skips the writer, so CI posts exactly what was approved).
type Tip = { url: string; source: string; title: string; text: string; image?: string; written?: WrittenPost };
const tipArg = args.indexOf("--tip");
const tip: Tip | undefined = tipArg >= 0 ? JSON.parse(fs.readFileSync(args[tipArg + 1], "utf8")) : undefined;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// --prepare YYYY-MM-DD (with --slot): write, review, render, host and test-build the post for that
// day's slot, then store it in the queue (state/queue.json) instead of publishing.
const prepArg = args.indexOf("--prepare");
const prepareDay = prepArg >= 0 ? args[prepArg + 1] : "";
const prepare = Boolean(prepareDay) && !dry;

// In CI: commit the article right after each post and redeploy the site, so the
// "full story" link works while the remaining launch posts are still queued.
function syncSite(label: string) {
  if (!process.env.GITHUB_ACTIONS) return;
  if (prepare) return syncQueue(label);
  const sh = (cmd: string, a: string[]) => spawnSync(cmd, a, { stdio: "inherit" }).status === 0;
  saveState(state);
  sh("git", ["add", "--", ...existing("state/state.json", "state/articles.json", "state/handles-pending.json", "state/performance.json", "state/spotlight.json", "state/polls.json", "state/poll-ideas.json", "state/photos.json", "state/scout.json", "reports/desempenho.md")]);
  if (spawnSync("git", ["diff", "--cached", "--quiet"]).status === 0) return;
  sh("git", ["commit", "-q", "-m", `post: ${label}`]);
  (sh("git", ["pull", "-q", "--rebase", "-X", "theirs"]) || (sh("git", ["rebase", "--abort"]), false));
  if (sh("git", ["push", "-q"])) sh("gh", ["workflow", "run", "site.yml"]);
}

function syncQueue(label: string) {
  const sh = (cmd: string, a: string[]) => spawnSync(cmd, a, { stdio: "inherit" }).status === 0;
  saveState(state);
  sh("git", ["add", "--", ...existing("state/queue.json", "reports/fila.md", "state/state.json", "state/handles-pending.json", "state/performance.json", "state/spotlight.json", "state/polls.json", "state/poll-ideas.json", "state/photos.json", "state/scout.json", "reports/desempenho.md")]);
  if (spawnSync("git", ["diff", "--cached", "--quiet"]).status === 0) return;
  sh("git", ["commit", "-q", "-m", `queue: ${label}`]);
  for (let i = 0; i < 3; i++) if ((sh("git", ["pull", "-q", "--rebase", "-X", "theirs"]) || (sh("git", ["rebase", "--abort"]), false)) && sh("git", ["push", "-q"])) break;
}

// Prepare mode: host the rendered files, validate everything (incl. a real Instagram container that is
// never published) and add the post to the queue.
async function enqueue(p: { kind: QueueItem["kind"]; files: string[]; video?: string; stories?: string[]; slideHandles?: string[][]; caption: string; handles: string[]; article: QueueItem["article"]; posted: QueueItem["posted"]; featured?: string; storyAt?: string }) {
  const urls: string[] = [];
  for (const f of p.files) urls.push(await hostImage(f));
  const videoUrl = p.video ? await hostImage(p.video).catch(() => undefined) : undefined;
  const storyVideos: string[] = [];
  for (const f of p.stories ?? []) {
    const u = await hostImage(f).catch(() => undefined);
    if (u) storyVideos.push(u);
  }
  const at = slotTime(prepareDay, slot);
  // Story version: the cover in a 9:16 frame with a call to action fitting the format.
  const cta = { poll: p.article.body.length > 1 ? ["Vote now", "Comment A, B, C… on our latest post"] : ["Tag your pick", "In the comments of our latest post"], agenda: p.article.slot === "week" ? ["Your week", "Day by day, by sound · latest post"] : p.article.slot === "tonight" ? ["Tonight", "Where to go · latest post"] : ["Your weekend", "Full guide on our latest post"] }[p.kind as "poll" | "agenda"] ?? ["New on HARDMAG", "Swipe the post · full story on hardmag.pt"];
  let storyUrl: string | undefined;
  try {
    const [storyFile] = await renderSlides([storyFrame(path.resolve(p.files[0]), p.article.slug, p.article.issue, p.kind === "spotlight" ? "Spotlight" : p.kind === "poll" ? "Poll" : p.kind === "agenda" ? (p.article.slot === "week" ? "This week" : p.article.slot === "tonight" ? "Tonight" : "Weekend guide") : "News", cta[0], cta[1])], path.dirname(p.files[0]));
    storyUrl = await hostImage(storyFile);
  } catch (e) {
    console.warn(`  [story] ${(e as Error).message.slice(0, 120)}`);
  }
  const item: QueueItem = {
    key: `${prepareDay}-${slot}`, day: prepareDay, slot, at: at.toISOString(), status: "ready", preparedAt: new Date().toISOString(),
    headline: p.article.headline, kind: p.kind, urls, videoUrl, storyUrl, storyVideos: storyVideos.length ? storyVideos : undefined, caption: p.caption, handles: p.handles, slideHandles: p.slideHandles, article: p.article, posted: p.posted, featured: p.featured, storyAt: p.storyAt, checks: [],
  };
  try {
    item.checks = await validate(item, Boolean(CONFIG.igUserId && CONFIG.igToken));
    for (const c of item.checks) console.log(`  ✓ ${c}`);
  } catch (e) {
    item.status = "failed";
    item.error = (e as Error).message.slice(0, 300);
    console.error(`  ✗ validation failed: ${item.error}`);
  }
  const q = loadQueue().filter((i) => !(i.key === item.key && i.status === "ready"));
  q.push(item);
  saveQueue(q);
  writeQueueReport();
  console.log(`  ${item.status === "ready" ? "✓ queued" : "✗ not queued"} for ${item.at.slice(0, 16).replace("T", " ")} UTC (${item.key})`);
  return item.status === "ready";
}

const existing = (...files: string[]) => files.filter((f) => fs.existsSync(f));

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 50).replace(/-+$/, "");

const state = loadState();
const postedTitles = new Set(state.posted.map((p) => normTitle(p.title)));
const postedUrls = new Set(state.posted.map((p) => p.url));
// Stories already waiting in the queue count as taken, so two slots never get the same story.
const queued = loadQueue().filter((i) => i.status === "ready");
for (const i of queued) {
  postedUrls.add(i.posted.url);
  postedTitles.add(normTitle(i.posted.title));
}
const issueNo = () => state.posted.length + queued.length + 1;

if (refresh) {
  // One refresh per slot: record the attempt first so a failing run doesn't loop every trigger.
  const q = loadQueue();
  const it = q.find((i) => i.key === `${prepareDay}-${slot}` && i.status === "ready");
  if (it) {
    it.refreshTried = new Date().toISOString();
    saveQueue(q);
  }
}

if (radar) {
  const now = Date.now();
  const last24 = state.posted.filter((p) => now - Date.parse(p.at) < 864e5);
  const lastAt = Math.max(0, ...state.posted.map((p) => Date.parse(p.at)));
  if (last24.length >= RADAR_DAILY_MAX) {
    console.log(`radar: ${last24.length} posts in the last 24h, daily cap reached`);
    process.exit(0);
  }
  if (now - lastAt < RADAR_GAP_MIN * 6e4) {
    console.log(`radar: last post ${Math.round((now - lastAt) / 6e4)} min ago, waiting`);
    process.exit(0);
  }
  const nextQueued = Math.min(...loadQueue().filter((i) => i.status === "ready").map((i) => Date.parse(i.at)).filter((t) => t > now));
  if (nextQueued - now < 60 * 6e4) {
    console.log(`radar: a scheduled post goes out in ${Math.round((nextQueued - now) / 6e4)} min, waiting`);
    process.exit(0);
  }
}

let tipStory: Story | undefined;
if (tip) {
  if (postedUrls.has(tip.url)) {
    console.log(`tip: already posted (${tip.url})`);
    process.exit(0);
  }
  const src = SOURCES.find((x) => x.name === tip.source);
  tipStory = {
    id: "tip-" + crypto.createHash("sha1").update(tip.url).digest("hex").slice(0, 10),
    source: tip.source, weight: 3, title: tip.title, url: tip.url, summary: tip.text.slice(0, 400),
    published: new Date(), beat: src?.beat, ig: src?.ig,
  };
}

if (jitterMin > 0 && !dry && !tip && !prepare) {
  const wait = Math.floor(Math.random() * jitterMin);
  console.log(`jitter: waiting ${wait} min`);
  await sleep(wait * 6e4);
}

console.log(`HARDMAG ${radar ? "radar" : slot ? `slot "${slot}"` : "run"} — ${dry ? "DRY RUN" : "LIVE"} — ${count} post(s) — writer: ${hasClaude ? `${CONFIG.model} via Claude subscription` : "fallback (Claude Code not found)"}`);

// Special formats: weekend agenda on Friday mornings, community poll Sunday to Thursday evenings.
// --format agenda|poll forces one (handy for testing with --dry).
const fmtArg = args.indexOf("--format");
const weekday = (prepareDay ? new Date(`${prepareDay}T12:00:00Z`) : new Date()).getUTCDay();
// Thursday night: the weekend guide. Friday and Saturday evening: what's on tonight. Sun-Thu evening: a poll.
// Monday midday: the week's parties (Mon-Thu).
const format0 = refresh ? "" : fmtArg >= 0 ? args[fmtArg + 1] : slot === "pt-midday" && weekday === 1 ? "week" : slot === "pt-night" && weekday === 4 ? "agenda" : slot === "pt-scene" && [5, 6].includes(weekday) ? "tonight" : slot === "pt-scene" ? "poll" : "";
// A guide that already went out today (posted by hand earlier) isn't made twice: the slot takes news instead.
const guideDone = ["week", "agenda"].includes(format0) && state.posted.some((p) => p.id === `${format0}-${prepareDay || new Date().toISOString().slice(0, 10)}`);
if (guideDone) console.log(`${format0}: already posted today, this slot takes news`);
const format = guideDone ? "" : format0;
if (format && !tip) {
  const day = prepareDay || new Date().toISOString().slice(0, 10);
  const issue = issueNo();
  let slides: Slide[] = [];
  let caption = "";
  let headline = "";
  let body: string[] = [];
  let people: { name: string }[] = [];
  let hashtags: string[] = [];
  let kicker = "";
  let agendaCredit = "";
  let animated = false; // slide 1 is an animated cover (rendered to a clip after the stills)
  let slideHandles: string[][] | undefined; // per-slide tags (guides)
  let storySlides: Slide[] = []; // animated stories (guides: one per night)
  let coverTrack: Track | undefined; // music for the animated cover (only permitted tracks; else silent)
  const storyTracks: (Track | undefined)[] = [];
  if (format === "week" || format === "agenda") {
    // Monday "This week" (Mon-Sun) and Thursday night "This weekend" (Fri-Sun): a departures board,
    // then the nights by sound, one slide per night (Lisbon and Porto apart), and a save-and-send slide.
    // The cover photo is the cover night itself (its headliner or the event's own image), never a stock photo.
    const weekend = format === "agenda";
    const w = await writeWeek(weekend ? "weekend" : "week", prepareDay ? new Date(`${prepareDay}T12:00:00Z`) : new Date());
    if (w && w.events.length >= (weekend ? 4 : 6)) {
      const T = weekend ? "This weekend" : "This week";
      const slug = `${day}-${weekend ? "this-weekend" : "this-week"}-lisbon-porto`;
      kicker = T.toUpperCase();
      headline = `${T} in Lisbon & Porto, ${w.label}`;
      const same = (a: string, b: string) => { const n = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, ""); return !n(a) || n(b).includes(n(a)) || n(a).includes(n(b)); };
      const items: WeekItem[] = w.events.map((e) => ({ ...e, party: same(e.party, e.name) ? "" : e.party, time: /\d/.test(e.time) ? e.time : "late", day: dayLabel(e.date) }));
      // Tags: each night's artists and venue, from their own Shotgun pages, plus our verified list.
      const details = await shotgunDetails(items.map((e) => e.link ?? ""));
      for (const e of items) {
        const known = resolveTags([{ name: e.venue }, ...(e.headliner ? [{ name: e.headliner }] : [])]).map((t) => t.username);
        e.handles = [...new Set([...(details.get(e.link ?? "")?.tags.map((t) => t.username) ?? []), ...known])];
      }
      console.log(`  tags found for ${items.filter((e) => e.handles?.length).length}/${items.length} nights`);
      // Supporting artists (shown smaller than the headliner): the lineup on the event's Shotgun page,
      // else the names in the listing. They share the post, so they're our marketing.
      const key = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
      for (const e of items) {
        const fromPage = details.get(e.link ?? "")?.artists.map((a) => a.name) ?? [];
        // A night listed under its party name ("Rave360 Girls Power", "Ovelha Trax 5th Anniversary"):
        // when its Shotgun lineup doesn't include that name, the lineup is who plays and the name is the party.
        const orig = w.events.find((x) => x.link === e.link && x.date === e.date);
        if (fromPage.length && !fromPage.some((a) => key(e.name).includes(key(a)) || key(a).includes(key(e.headliner || e.name)))) {
          e.party = e.party || orig?.party || e.name;
          e.headliner = fromPage[0];
          e.name = fromPage.slice(0, 4).join(", ");
          e.short = fromPage[0].slice(0, 14);
        }
        const fromName = e.name.split(/\s*(?:,|&|\+| b2b | x | w\/| with )\s*/i);
        const head = e.headliner || fromName[0] || "";
        const seen = [key(head), key(e.venue), key(e.party ?? "")].filter(Boolean);
        const dup = (k: string) => !k || seen.some((x) => x.includes(k) || k.includes(x));
        e.support = [...fromPage, ...fromName].map((x) => x.trim()).filter((x) => { const k = key(x); if (x.length < 2 || dup(k)) return false; seen.push(k); return true; }).slice(0, 4);
        if (!e.headliner && head) e.headliner = head;
      }
      // Cover: a headliner from our picks (then the other nights): their free Wikipedia/Commons photo,
      // else their own portrait on Shotgun. Never the flyer (text on text). No photo found: the board alone.
      let coverNight = items.find((e) => e.pick) ?? items[0];
      let coverPhoto: string | undefined;
      const candidates = [...items.filter((e) => e.pick), ...items.filter((e) => !e.pick)].filter((e) => e.headliner);
      for (const e of candidates.slice(0, 14)) {
        const wp = await wikiPhoto(e.headliner!, "en", `${slug}-cover`).catch(() => undefined);
        if (wp) {
          [coverNight, coverPhoto, agendaCredit] = [e, wp.file, wp.credit];
          break;
        }
      }
      for (const e of coverPhoto ? [] : candidates.filter((x) => x.pick)) {
        const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
        const art = details.get(e.link ?? "")?.artists.find((a) => norm(a.name) && (norm(a.name).includes(norm(e.headliner!)) || norm(e.headliner!).includes(norm(a.name))));
        const img = art ? await shotgunPortrait(art.url) : undefined;
        const file = img ? await downloadImage(img, `${slug}-cover`) : undefined;
        if (file) {
          [coverNight, coverPhoto, agendaCredit] = [e, file, `${e.headliner} via Shotgun`];
          break;
        }
      }
      coverNight.cover = true;
      if (coverPhoto) console.log(`  cover: ${coverNight.name} (${agendaCredit})`);
      const dates = Array.from({ length: Math.round((w.to.getTime() - w.from.getTime()) / 864e5) + 1 }, (_, i) => new Date(w.from.getTime() + i * 864e5).toISOString().slice(0, 10));
      const nights = dates.map((d) => [dayLabel(d), items.filter((e) => e.date === d)] as [string, WeekItem[]]).filter(([, xs]) => xs.length);
      const groups = GENRES.map((g) => [g, items.filter((e) => e.genre === g)] as [string, WeekItem[]]).filter(([, xs]) => xs.length);
      const city = (c: string) => items.filter((e) => (e.city === "Porto" ? "Porto" : "Lisbon") === c);
      const boardRows = (xs: WeekItem[]) => {
        const keep = new Set([...xs.filter((e) => e.cover), ...xs.filter((e) => e.pick), ...xs].filter((e, i, a) => a.indexOf(e) === i).slice(0, 5));
        return xs.filter((e) => keep.has(e));
      };
      const pages = ["Lisbon", "Porto"].map((c) => ({ city: c, rows: boardRows(city(c)), more: Math.max(0, city(c).length - 5) })).filter((p) => p.rows.length);
      if (coverNight.city === "Porto") pages.reverse();
      const total = 2 + nights.length + 1;
      const picks = items.filter((e) => e.pick).length;
      slides.push(weekBoard(slug, T, w.label, pages, items.length, picks, total, issue, new Date(), coverPhoto));
      slides.push(weekGenres(slug, groups, issue, new Date(), 2, total, T));
      nights.forEach(([d, xs]) => slides.push(weekDay(slug, d, xs.slice(0, 7), issue, new Date(), slides.length + 1, total, T)));
      slides.push(weekSave(slug, w.question.trim(), issue, new Date(), total, total, T, weekend ? "Next guide on Monday" : "Weekend guide on Thursday"));
      // Stories: one per night; a night with more than 5 parties gets one story per city.
      for (const [d, xs] of nights) {
        const parts = xs.length <= 4 ? [["", xs]] : ["Lisbon", "Porto"].map((c) => [c, xs.filter((e) => (e.city === "Porto" ? "Porto" : "Lisbon") === c)]).filter(([, ys]) => ys.length);
        for (const [c, ys] of parts as [string, WeekItem[]][]) {
          storySlides.push(storyDay(slug, T, d, c, ys.slice(0, 4), Math.max(0, ys.length - 4), issue));
          const shown = ys.slice(0, 4);
          storyTracks.push(pickTrack([...shown.filter((e) => e.pick).map((e) => e.headliner ?? ""), ...shown.map((e) => e.headliner ?? "")], shown.map((e) => e.genre), `${slug}-${d}-${c}`));
        }
      }
      slideHandles = [[], [], ...nights.map(([, xs]) => [...new Set(xs.slice(0, 7).flatMap((e) => e.handles ?? []))].slice(0, 20)), []];
      animated = true;
      // Caption: day by day, Lisbon then Porto, with the night's accounts mentioned (capped, Instagram limits mentions).
      let mentions = 0;
      const at = (e: WeekItem) => {
        const hs = (e.handles ?? []).slice(0, 2).filter(() => mentions < 12);
        mentions += hs.length;
        return hs.length ? ` ${hs.map((h) => "@" + h).join(" ")}` : "";
      };
      const ordered = [...items].sort((x, y) => Number(!x.pick) - Number(!y.pick));
      const withAt = new Map(ordered.map((e) => [e, at(e)]));
      const line = (e: WeekItem) => `${e.pick ? "★ " : ""}${e.time} · ${e.headliner || e.name}${e.support?.length ? ` w/ ${e.support.join(", ")}` : ""}${e.party ? ` (${e.party})` : ""} @ ${e.venue} · ${e.genre.toLowerCase()}${e.price ? ` (${e.price})` : ""}${withAt.get(e) ?? ""}`;
      const lines = nights
        .map(([d, xs]) => `\n\n${d}${["Lisbon", "Porto"].map((c) => { const ys = xs.filter((e) => (e.city === "Porto" ? "Porto" : "Lisbon") === c); return ys.length ? `\n${c.toUpperCase()}\n${ys.map(line).join("\n")}` : ""; }).join("")}`)
        .join("");
      const onCover = coverPhoto ? `\n\nOn the cover: ${coverNight.headliner}, ${coverNight.day} at ${coverNight.venue} (${coverNight.name}).` : "";
      coverTrack = pickTrack([coverNight.headliner ?? "", ...items.filter((e) => e.pick).map((e) => e.headliner ?? "")], [coverNight.genre, ...items.filter((e) => e.pick).map((e) => e.genre)], slug);
      if (coverTrack) console.log(`  music: ${trackCredit(coverTrack)}`);
      caption = `${w.caption.trim()}${onCover}${lines}\n\n★ = our picks. Save this and send it to whoever you're going with 📌\n\n${w.question.trim()} 👇\n\nTickets on Shotgun.${agendaCredit ? `\n📸 ${agendaCredit}` : ""}${coverTrack ? `\n${trackCredit(coverTrack)}` : ""}`;
      body = [w.caption, ...items.map((e) => `${e.day} ${e.time} · ${e.city}: ${e.name} at ${e.venue} (${e.genre.toLowerCase()})${e.price ? `, ${e.price}` : ""}.`)];
      people = w.people;
      hashtags = w.hashtags;
    } else console.log(`${format}: not enough listings, posting news instead`);
  } else if (format === "tonight") {
    const tonight = format === "tonight";
    const a = await writeAgenda(tonight ? "tonight" : "weekend");
    if (a && a.lisbon.length + a.porto.length >= (tonight ? 2 : 4)) {
      const parts = agendaSlidesData(a);
      const total = 1 + parts.lisbon.length + (parts.porto.length ? 1 : 0);
      const slug = tonight ? `${day}-tonight-lisbon-porto` : `${day}-weekend-guide-lisbon-porto`;
      kicker = tonight ? "TONIGHT" : "WEEKEND GUIDE";
      headline = tonight ? `Tonight in Lisbon & Porto, ${a.label}` : `Weekend guide: Lisbon & Porto, ${a.label}`;
      const real = await libraryPhoto(slug, ["crowd", "dancefloor", "club"]);
      if (real) agendaCredit = real.credit;
      slides.push(agendaCover(slug, tonight ? `Where to go <span class="hl">tonight</span>` : `Lisbon &amp; Porto <span class="hl">this weekend</span>`, `${a.label} · ${a.lisbon.length + a.porto.length} parties worth your night`, tonight ? "Tonight" : "Weekend guide", issue, new Date(), total, real?.file));
      parts.lisbon.forEach((items, i) => slides.push(agendaList(slug, parts.lisbon.length > 1 ? `Lisbon <span class="hl">${i + 1}/${parts.lisbon.length}</span>` : "Lisbon", items, issue, new Date(), slides.length + 1, total, tonight ? "Tonight" : "Weekend")));
      if (parts.porto.length) slides.push(agendaList(slug, "Porto", parts.porto, issue, new Date(), slides.length + 1, total, tonight ? "Tonight" : "Weekend"));
      const list = (city: string, xs: typeof a.lisbon) => xs.length ? `\n\n${city.toUpperCase()}\n${xs.map((e) => `${e.day} ${e.time} · ${e.name} @ ${e.venue}${e.price ? ` (${e.price})` : ""}`).join("\n")}` : "";
      caption = `${a.caption.trim()}${list("Lisbon", a.lisbon)}${list("Porto", a.porto)}\n\n${a.question.trim()} 👇\n\nTickets on Shotgun.${agendaCredit ? `\n📸 ${agendaCredit}` : ""}`;
      body = [a.caption, ...a.lisbon.map((e) => `Lisbon · ${e.day} ${e.time}: ${e.name} at ${e.venue}${e.price ? `, ${e.price}` : ""}.`), ...a.porto.map((e) => `Porto · ${e.day} ${e.time}: ${e.name} at ${e.venue}${e.price ? `, ${e.price}` : ""}.`)];
      people = a.people;
      hashtags = a.hashtags;
    } else console.log("agenda: not enough listings, posting news instead");
  } else if (format === "poll") {
    const handles = JSON.parse(fs.readFileSync(path.join(PATHS.state, "..", "handles.json"), "utf8")).handles as Record<string, string>;
    const names = [...new Set(Object.keys(handles))].filter((n) => !["Mixmag", "DJ Mag", "Crack Magazine", "Electronic Groove", "Rimas e Batidas"].includes(n));
    const angleArg = args.indexOf("--angle"); // --angle "...": force the poll's topic
    const pl = await writePoll(names, angleArg >= 0 ? args[angleArg + 1] : "");
    if (pl) {
      const slug = `${day}-poll-${slugify(pl.topic)}`;
      kicker = "COMMUNITY POLL";
      headline = pl.question;
      const real = await libraryPhoto(slug, ["crowd", "dancefloor", "club"]);
      const prepared = real ? await preparePhoto(real.file) : undefined;
      if (real) console.log(`  poll photo: ${real.credit}`);
      slides = [pollCover(slug, pl.question, pl.highlight, pl.options, issue, new Date(), prepared?.mode === "bleed" ? prepared.file : real?.file)];
      caption = pl.options.length
        ? `${pl.caption.trim()}\n\n${pl.options.map((o, i) => `${String.fromCharCode(65 + i)}: ${o}`).join("\n")}\n\nVote with the letter in the comments 👇`
        : `${pl.caption.trim()}\n\nTag your pick in the comments and tell us why 👇`;
      if (real) caption += `\n\n📸 ${real.credit}`;
      body = [pl.caption, ...pl.options.map((o, i) => `${String.fromCharCode(65 + i)}: ${o}`)];
      people = pl.people;
      hashtags = pl.hashtags;
    }
  }
  if (slides.length) {
    const slug = slides[0].name.replace(/-1$/, "");
    const tags = resolveTags(people);
    const tagLine = tags.length ? `\n\n${tags.map((t) => "@" + t.username).join(" ")}` : "";
    const fullCaption = `${caption}${tagLine}\n\n${[...new Set(hashtags.map((h) => h.replace(/^#/, "").toLowerCase()))].slice(0, 6).map((h) => "#" + h).join(" ")}`;
    const outDir = path.join(PATHS.out, slug);
    const files = await renderSlides(slides, outDir);
    const video = animated ? (await renderAnimation(slides[0], outDir, coverTrack)).video : undefined;
    if (video) console.log("  animated cover rendered");
    const stories: string[] = [];
    for (const [i, st] of storySlides.entries()) {
      const v = (await renderAnimation(st, outDir, storyTracks[i])).video;
      if (v) stories.push(v);
    }
    if (stories.length) console.log(`  ${stories.length} animated stories rendered`);
    fs.writeFileSync(path.join(outDir, "caption.txt"), fullCaption + "\n");
    console.log(`${format}: rendered ${files.length} slide(s) → ${path.relative(process.cwd(), outDir)}${tags.length ? ` · tags ${tags.map((t) => "@" + t.username).join(" ")}` : ""}`);
    if (prepare) {
      const article = { slug, kicker, headline, highlight: [], standfirst: body[0] ?? "", body, source: BRAND.name, sourceUrl: `https://www.instagram.com/${BRAND.handle.replace(/^@/, "")}/`, hashtags, issue, beat: "pt" as const, slot: format };
      await enqueue({ kind: (format === "tonight" || format === "week" ? "agenda" : format) as "agenda" | "poll", files, video, stories, slideHandles, caption: fullCaption, handles: tags.map((t) => t.username), article, posted: { id: `${format}-${day}`, url: `${BRAND.site}/news/${slug}/`, title: headline, headline, source: BRAND.name, slug } });
      syncQueue(slug);
    } else if (!dry) {
      let igMediaId: string | undefined;
      if (CONFIG.igUserId && CONFIG.igToken) {
        const urls: string[] = [];
        for (const f of files) urls.push(await hostImage(f));
        const videoUrl = video ? await hostImage(video).catch(() => undefined) : undefined;
        try {
          igMediaId = await publishToInstagram(urls, fullCaption, tags.map((t) => t.username), videoUrl, slideHandles);
        } catch (e) {
          if (!videoUrl) throw e;
          console.warn(`  video carousel failed (${(e as Error).message.slice(0, 160)}), posting images only`);
          igMediaId = await publishToInstagram(urls, fullCaption, tags.map((t) => t.username), undefined, slideHandles);
        }
        console.log(`  ✓ published on Instagram: ${igMediaId}`);
        for (const f of stories) {
          try {
            console.log(`  ✓ story: ${await publishStory(await hostImage(f))}`);
          } catch (e) {
            console.warn(`  story failed (the post is out): ${(e as Error).message.slice(0, 160)}`);
          }
        }
      }
      saveArticle({ slug, date: new Date().toISOString(), kicker, headline, highlight: [], standfirst: body[0] ?? "", body, source: BRAND.name, sourceUrl: `https://www.instagram.com/${BRAND.handle.replace(/^@/, "")}/`, hashtags, igMediaId, issue, beat: "pt", slot: format });
      state.posted.push({ id: `${format}-${day}`, url: `${BRAND.site}/news/${slug}/`, title: headline, headline, source: BRAND.name, at: new Date().toISOString(), igMediaId, slug });
      syncSite(slug);
    }
    await closeRenderer();
    saveState(state);
    process.exit(0);
  }
}

// Feeds plus the web scout (Claude's web search + Google Trends Portugal, every few hours).
const feedStories = tip ? [] : await fetchStories(state.seen);
const scouted = tip || dry ? [] : await scoutStories().catch(() => []);
const stories = [...feedStories, ...scouted.filter((x) => !feedStories.some((f) => f.url === x.url))];
const fresh = stories.filter((s) => !postedUrls.has(s.url) && !postedTitles.has(normTitle(s.title)));
for (const s of fresh) state.seen[s.id] ??= new Date().toISOString();
console.log(`feeds: ${stories.length} recent stories, ${fresh.length} not posted yet`);
// Age is measured at the moment the post goes out (the slot time when preparing ahead).
const goesOutAt = prepare ? slotTime(prepareDay, slot).getTime() : Date.now();
const maxAgeH = radar ? RADAR_MAX_AGE_H : NEWS_MAX_AGE_H;
const newsPool = tip ? fresh : fresh.filter((s) => goesOutAt - s.published.getTime() <= maxAgeH * 36e5);
console.log(`news pool: ${newsPool.length} stories under ${maxAgeH}h old at ${new Date(goesOutAt).toISOString().slice(0, 16)}`);
if (radar) {
  // Only spend an editor call when something new landed since the last radar check.
  const rf = path.join(ROOT, "state", "radar.json");
  const r = fs.existsSync(rf) ? JSON.parse(fs.readFileSync(rf, "utf8")) : { seen: [] as string[] };
  const novel = newsPool.filter((s) => !r.seen.includes(s.id));
  fs.writeFileSync(rf, JSON.stringify({ lastCheck: new Date().toISOString(), seen: newsPool.map((s) => s.id).slice(0, 300) }, null, 2) + "\n");
  if (!novel.length) {
    console.log("radar: nothing new since the last check");
    saveState(state);
    process.exit(0);
  }
}

if (!fresh.length && !tipStory) {
  console.log("nothing new to post");
  saveState(state);
  process.exit(0);
}

const recent = [...state.posted.slice(-40), ...queued.map((i) => i.posted)].map((p) => `${p.headline} (${p.source})`);
// Ask for a couple of spares in case a story gets skipped by the writer.
// Study first: refresh post performance and hand the lessons to the editor.
if (!dry && CONFIG.igToken) {
  const n = await collectInsights().catch(() => 0);
  writeReport();
  console.log(`insights: ${n} post(s) refreshed`);
}
const lessons = learnings();
if (lessons) console.log(`learnings: ${lessons}`);
// Artists slot: original Artist Spotlight first (tags a mid-level artist who is likely to reshare).
const preset = new Map<string, { written: WrittenPost; image?: string; artist: Artist; material?: string; wiki?: { lang: string; title: string } }>();
let spotStory: Story | undefined;
// Midday (except Mondays, which get the week's parties, and Fri/Sat): "Did you know?" about an artist.
const curiosityDay = slot === "pt-midday" && [0, 2, 3, 4].includes(weekday) && !refresh && !radar && fmtArg < 0;
if (curiosityDay) {
  for (let i = 0; i < 3 && !spotStory; i++) {
    const artist = nextCuriosity();
    if (!artist) break;
    console.log(`did you know: ${artist.name} (@${artist.handle})`);
    markCuriosity(artist); // rotate even if this one fails
    const mat = await gatherMaterial(artist, stories);
    if (!mat.wiki) { console.log("  no Wikipedia page to take facts from, next artist"); continue; }
    const w = await writeCuriosity(artist, mat.text);
    if (!w || w.skip) { console.log("  not enough surprising facts, next artist"); continue; }
    w.people = [{ name: artist.name, instagram: artist.handle }, ...(w.people ?? []).filter((p) => p.name !== artist.name)];
    spotStory = {
      id: `dyk-${artist.handle}-${new Date().toISOString().slice(0, 10)}`,
      source: BRAND.name, weight: 3, title: w.headline, url: `https://www.instagram.com/${artist.handle}/`,
      summary: w.body[0] ?? "", published: new Date(), beat: /lisbon|portugal|porto/i.test(artist.lane) ? "pt" : "club",
    };
    preset.set(spotStory.id, { written: w, image: undefined, artist, material: mat.text, wiki: mat.wiki });
  }
}
if (!spotStory && !refresh && !radar && (slot === "artists" || ["pt-news", "pt-artists", "pt-scene"].includes(slot))) {
  // Portugal slots: a Portuguese artist (first choice on pt-artists, a back-up on the other two).
  // pt-artists alternates: a Portuguese artist on Sun/Mon/Wed/Fri, a fast groove or bouncy artist on Tue/Thu/Sat.
  const groove = slot === "pt-artists" && [2, 4, 6].includes(weekday);
  const artist = groove
    ? (nextArtist(/groove|bounc/i, 14) ?? nextArtist(/portugal|lisbon/i, 10))
    : slot.startsWith("pt-") ? (nextArtist(/portugal|lisbon/i, 10) ?? (slot === "pt-artists" ? nextArtist(/groove|bounc/i, 14) : undefined)) : nextArtist();
  if (artist) {
    console.log(`spotlight: ${artist.name} (@${artist.handle})`);
    const mat = await gatherMaterial(artist, stories);
    const w = await writeSpotlight(artist, mat.text);
    if (w && !w.skip) {
      w.people = [{ name: artist.name, instagram: artist.handle }, ...(w.people ?? []).filter((p) => p.name !== artist.name)];
      spotStory = {
        id: `spot-${artist.handle}-${new Date().toISOString().slice(0, 10)}`,
        source: BRAND.name, weight: 3, title: w.headline, url: `https://www.instagram.com/${artist.handle}/`,
        summary: w.body[0] ?? "", published: new Date(), beat: /lisbon|portugal/i.test(artist.lane) ? "pt" : "club",
      };
      preset.set(spotStory.id, { written: w, image: mat.image, artist, material: mat.text, wiki: mat.wiki });
    } else console.log("  spotlight skipped by editor, falling back to news");
  }
}
// Story choice: a hand-picked tip wins; then an Artist Spotlight; then news. Portugal first in
// everything: Portuguese stories are picked first, and a story from abroad only makes it when it's
// huge (GLOBAL_MIN_HEAT). Portugal slots only look abroad on the --any fallback.
// Spotlights keep news queued behind them in case the chief editor drops the spotlight.
const PT_RE = /portugal|portugu|lisbo|lisbon|\bporto\b|algarve|coimbra|braga|madeira|a[çc]ores|azores|neopop|boom festival|lux fr[aá]gil|musicbox|ministerium/i;
const isLocal = (s?: Story) => !!s && (s.beat === "pt" || PT_RE.test(`${s.title} ${s.summary}`));
async function newsPicks() {
  const local = newsPool.filter((s) => isLocal(s));
  const abroad = newsPool.filter((s) => !isLocal(s));
  console.log(`portugal pool: ${local.length} stories, abroad: ${abroad.length}`);
  const n = radar ? 3 : count + 2;
  const breaking = radar ? " Breaking news only: something the scene is talking about right now and that would look late tomorrow." : "";
  const p = local.length
    ? (await pickStories(local.slice(0, 80), recent, n, `${focus || SLOTS["pt-news"]}${breaking} Only pick stories genuinely about electronic music, clubs, DJs, festivals or nightlife; return none if nothing qualifies.`, lessons)).filter((x) => x.heat >= 4)
    : [];
  if (slot.startsWith("pt-") && !anyStory && !radar) return p;
  if (!abroad.length) return p;
  const minHeat = radar ? RADAR_GLOBAL_MIN_HEAT : lastResort ? 4 : GLOBAL_MIN_HEAT;
  const g = (await pickStories(abroad.slice(0, 80), recent, n, `${focus}${breaking} We're a Portuguese channel: from outside Portugal only pick something so big that ravers in Portugal are talking about it too (a legend, a landmark club, a scene-wide change). Fast groove, bouncy and hard techno come first. Return none if nothing is that big.`, lessons)).filter((x) => x.heat >= minHeat);
  if (!g.length) console.log(`  nothing from abroad at heat ${minHeat}+`);
  return [...p, ...g];
}
const picks = tipStory
  ? [{ id: tipStory.id, heat: 9 }]
  : spotStory
    ? (slot === "pt-news" || slot === "pt-scene") && !anyStory
      ? [...(await newsPicks()), { id: spotStory.id, heat: 7 }] // Portuguese news first, then the spotlight
      : [{ id: spotStory.id, heat: 7 }, ...(await newsPicks())]
    : await newsPicks();
const heatOf = new Map(picks.map((p) => [p.id, p.heat]));
const byId = new Map([...fresh, ...(spotStory ? [spotStory] : []), ...(tipStory ? [tipStory] : [])].map((s) => [s.id, s]));
for (const p of picks) console.log(`  pick heat ${p.heat}: ${byId.get(p.id)?.title ?? p.id}`);
const chosen = radar ? picks.filter((p) => p.heat >= (isLocal(byId.get(p.id)) ? RADAR_PT_MIN_HEAT : RADAR_GLOBAL_MIN_HEAT)) : picks;
if (radar && !chosen.length) {
  console.log(`radar: nothing hot enough right now (Portugal ${RADAR_PT_MIN_HEAT}+, abroad ${RADAR_GLOBAL_MIN_HEAT}+)`);
  saveState(state);
  process.exit(0);
}
const queue = chosen.map((p) => byId.get(p.id)).filter((s): s is Story => Boolean(s));

let done = 0;
// Runner-up: the best reviewed draft that cleared a lower bar (accurate, decent interest). If the whole
// queue is dropped, the slot publishes it instead of staying empty. Accuracy is never lowered.
type Draft = { article: { text: string; ogImage?: string }; written: WrittenPost; quality: { interest: number; accuracy: number; hook: number } };
let fallback: (Draft & { s: Story; score: number }) | null = null;
const reuse = new Map<string, Draft>();
const fallbackIfLast = (s: Story) => {
  if (s === queue[queue.length - 1] && done === 0 && fallback && !reuse.size && !refresh && !radar) {
    console.log(`\nnothing cleared the bar: publishing the best runner-up (${fallback.quality.interest}/${fallback.quality.accuracy}/${fallback.quality.hook})`);
    reuse.set(fallback.s.id, fallback);
    queue.push(fallback.s);
  }
};
for (const s of queue) {
  if (done >= count) break;
  console.log(`\n→ ${s.source}: ${s.title}`);
  const re = reuse.get(s.id);
  const pre = preset.get(s.id);
  const article = re ? re.article : pre ? { text: "", ogImage: pre.image } : tip && s.id === tipStory?.id ? { text: tip.text, ogImage: tip.image } : await fetchArticle(s.url);
  let written: WrittenPost | null = re ? re.written : pre ? pre.written : tip?.written && s.id === tipStory?.id ? tip.written : await writePost(s, article.text);
  if (!written || written.skip) {
    console.log("  skipped by editor");
    fallbackIfLast(s);
    continue;
  }

  // Quality gate: the chief editor scores the draft; one rewrite allowed, then publish or drop.
  const material = pre ? (pre.material ?? "") : article.text || s.summary;
  const origin = `${s.source}: ${s.title}`;
  let quality: { interest: number; accuracy: number; hook: number } | undefined = re?.quality;
  const ROUNDS = re ? 0 : 3; // first review + up to two rewrites (a reused runner-up was already reviewed)
  for (let round = 0; round < ROUNDS && written; round++) {
    const r = await reviewPost(written, material, origin);
    if (!r) break;
    quality = { interest: r.interest, accuracy: r.accuracy, hook: r.hook };
    console.log(`  review: interest ${r.interest}, accuracy ${r.accuracy}, hook ${r.hook} → ${r.verdict}${r.problems.length ? ` (${r.problems.slice(0, 2).join("; ")})` : ""}`);
    const good = r.interest >= MIN_QUALITY && r.accuracy >= 8 && r.hook >= MIN_QUALITY - 1;
    const score = r.interest + r.hook;
    if (r.verdict !== "reject" && r.interest >= MIN_QUALITY - 1 && r.accuracy >= 8 && r.hook >= MIN_QUALITY - 2 && (!fallback || score > fallback.score))
      fallback = { s, score, article, written, quality: { ...quality } };
    if (r.verdict === "reject" || (round === ROUNDS - 1 && !good)) {
      written = null;
      break;
    }
    if (good && (r.verdict === "publish" || round === ROUNDS - 1)) break; // never ship an unreviewed rewrite
    const better: WrittenPost | null = await rewritePost(written, material, origin, r);
    if (!better || better.skip) {
      written = null;
      break;
    }
    better.people = better.people?.length ? better.people : written.people;
    written = better;
  }
  if (!written) {
    console.log("  dropped by the chief editor (not interesting or not accurate enough)");
    if (pre && !dry) markTried(pre.artist);
    fallbackIfLast(s);
    continue;
  }

  const slug = `${prepareDay || new Date().toISOString().slice(0, 10)}-${slugify(written.headline)}`;
  // og:image is usually the biggest version; feed thumbnails are often ~600px.
  let imagePath: string | undefined;
  let photoCredit: string | undefined; // set when the photo isn't the source's own press photo
  for (const url of [article.ogImage, s.feedImage]) {
    if (url && (imagePath = await downloadImage(url.replace(/&amp;/g, "&"), slug))) break;
  }
  // No press photo: the artist's own Wikipedia photo (spotlights), else a scene photo from our library.
  // A real photo always beats a type-only cover.
  // A spotlight shows the artist or doesn't go out: never a stand-in photo.
  if (!imagePath && pre) {
    const given = typeof pre.artist.photo === "object" ? pre.artist.photo : undefined;
    const real = given && fs.existsSync(path.join(ROOT, "photos", given.file))
      ? { file: path.join(ROOT, "photos", given.file), credit: given.credit }
      : pre.wiki ? await wikiPhoto(pre.wiki.title, pre.wiki.lang, slug) : undefined;
    if (!real) {
      console.log("  spotlight: no real photo of the artist, skipped");
      markTried(pre.artist);
      fallbackIfLast(s);
      continue;
    }
    imagePath = real.file;
    photoCredit = real.credit;
    console.log(`  artist photo: ${real.credit}`);
  }
  if (!imagePath) {
    const real = await libraryPhoto(slug, ["crowd", "club"]);
    if (real) {
      imagePath = real.file;
      photoCredit = real.credit;
      console.log(`  photo from our library: ${real.credit}`);
    } else console.warn("  [img] no photo found: typographic cover");
  }

  const photo = imagePath ? await preparePhoto(imagePath) : undefined;
  if (photo) console.log(`  photo: ${photo.mode}, scale ${photo.scale.toFixed(2)}x`);
  const outDir = path.join(PATHS.out, slug);
  const content: PostContent = {
      slug,
      kicker: written.kicker,
      headline: written.headline,
      highlight: written.highlight,
      body: written.body,
      source: s.source,
      date: prepare ? slotTime(prepareDay, slot) : new Date(),
      issue: issueNo(),
      points: written.points,
      imagePath: photo?.file,
      photoMode: photo?.mode,
      photoHeight: photo?.height,
  };
  const files = await renderSlides(postSlides(content), outDir);
  // Music: a permitted track by the artist this story is about (none: the clip goes out silent).
  const track = pickTrack([...written.people.map((x) => x.name), written.headline]);
  const video = files.length > 1 ? await renderCoverVideo(content, files.length, outDir, track) : undefined;
  if (video && track) console.log(`  music: ${trackCredit(track)}`);
  if (video) console.log("  video cover rendered");
  const link = articleUrl(slug);
  const tags = resolveTags(written.people);
  if (tags.length) console.log(`  tags: ${tags.map((t) => "@" + t.username).join(" ")}`);
  const caption = buildCaption(written, s, link, tags, photoCredit) + (video && track ? `\n${trackCredit(track)}` : "");
  fs.writeFileSync(path.join(outDir, "caption.txt"), caption + "\n");
  fs.writeFileSync(path.join(outDir, "source.json"), JSON.stringify({ ...s, written }, null, 2));
  console.log(`  rendered ${files.length} slide(s) → ${path.relative(process.cwd(), outDir)}`);

  if (prepare) {
    const photoUrl = imagePath ? await hostImage(imagePath).catch(() => undefined) : undefined;
    const web = written.article?.length ? written.article : written.body;
    const ok = await enqueue({
      kind: pre ? "spotlight" : tip ? "tip" : "news",
      files, video, caption, handles: tags.map((t) => t.username),
      article: {
        slug, kicker: written.kicker, headline: written.headline, highlight: written.highlight, standfirst: written.body[0] ?? web[0], body: web,
        source: s.source, sourceUrl: s.url, image: photoUrl, hashtags: written.hashtags.map((h) => h.replace(/^#/, "").toLowerCase()),
        issue: issueNo(), points: written.points, beat: s.beat, heat: heatOf.get(s.id), quality, slot: slot || undefined,
      },
      posted: { id: s.id, url: s.url, title: s.title, headline: written.headline, source: s.source, slug },
      featured: pre?.artist.name,
      storyAt: pre || tip ? undefined : s.published.toISOString(),
    });
    if (ok && pre) markFeatured(pre.artist);
    syncQueue(slug);
    if (ok) {
      done++;
      continue;
    }
    fallbackIfLast(s);
    continue;
  }
  let igMediaId: string | undefined;
  if (!dry) {
    const igReady = Boolean(CONFIG.igUserId && CONFIG.igToken);
    let photoUrl: string | undefined;
    try {
      if (imagePath) photoUrl = await hostImage(imagePath);
      if (igReady) {
        const urls: string[] = [];
        for (const f of files) urls.push(await hostImage(f));
        const handles = tags.map((t) => t.username);
        let videoUrl: string | undefined;
        if (video) videoUrl = await hostImage(video).catch(() => undefined);
        try {
          igMediaId = await publishToInstagram(urls, caption, handles, videoUrl);
        } catch (e) {
          if (!videoUrl) throw e;
          console.warn(`  video carousel failed (${(e as Error).message.slice(0, 160)}), posting images only`);
          igMediaId = await publishToInstagram(urls, caption, handles);
        }
        console.log(`  ✓ published on Instagram: ${igMediaId}`);
      } else {
        console.log("  · Instagram not configured yet (IG_USER_ID / IG_ACCESS_TOKEN): website only");
      }
    } catch (e) {
      console.error(`  ✗ publish failed: ${(e as Error).message}`);
      await closeRenderer();
      saveState(state);
      process.exit(1);
    }

    const web = written.article?.length ? written.article : written.body;
    saveArticle({
      slug,
      date: new Date().toISOString(),
      kicker: written.kicker,
      headline: written.headline,
      highlight: written.highlight,
      standfirst: written.body[0] ?? web[0],
      body: web,
      source: s.source,
      sourceUrl: s.url,
      image: photoUrl,
      hashtags: written.hashtags.map((h) => h.replace(/^#/, "").toLowerCase()),
      igMediaId,
      issue: issueNo(),
      points: written.points,
      beat: s.beat,
      heat: heatOf.get(s.id),
      quality,
      slot: tip ? "tip" : radar ? "radar" : slot || undefined,
    });
    console.log(`  ✓ on the website: ${link}`);

    state.posted.push({
      id: s.id,
      url: s.url,
      title: s.title,
      headline: written.headline,
      source: s.source,
      at: new Date().toISOString(),
      igMediaId,
      slug,
    });
  }
  done++;
  if (pre && !dry) markFeatured(pre.artist);
  if (!dry) syncSite(slug);
  if (gapMin > 0 && done < count) {
    console.log(`  … next post in ${gapMin} min`);
    await sleep(gapMin * 60_000);
  }
}

await closeRenderer();
saveState(state);
// Portugal slots never fall back to foreign news first: nothing Portuguese cleared the bar, so the
// slot becomes a community poll (if none went out in the last day), and only then any good story.
if (refresh && done === 0) {
  // Nothing fresher. Keep the queued post unless it's news that would be too old by slot time:
  // then drop it and prepare the slot the normal way (Portuguese spotlight, poll, ...).
  const q = loadQueue();
  const it = q.find((i) => i.key === `${prepareDay}-${slot}` && i.status === "ready");
  if (it && tooOld(it, slotTime(prepareDay, slot).getTime())) {
    console.log(`\nrefresh: "${it.headline}" would be too old at slot time, preparing the slot again without it`);
    saveQueue(q.filter((i) => i !== it));
    const r = spawnSync(process.execPath, [process.argv[1], ...args.filter((a) => a !== "--refresh" && a !== "--any" && a !== "--last")], { stdio: "inherit" });
    process.exit(r.status ?? 1);
  }
  console.log("\nrefresh: nothing fresher cleared the bar, the queued post stays");
}
if (done === 0 && slot.startsWith("pt-") && !tip && fmtArg < 0 && !anyStory && !refresh) {
  const ref = prepare ? slotTime(prepareDay, slot).getTime() : Date.now();
  const pollNear = loadQueue().some((i) => i.kind === "poll" && i.status !== "failed" && Math.abs(Date.parse(i.at) - ref) < 20 * 36e5);
  const next = pollNear ? ["--any"] : ["--format", "poll"];
  console.log(`\nnothing Portuguese cleared the bar: trying ${pollNear ? "a huge story from abroad" : "a community poll"}`);
  const r = spawnSync(process.execPath, [process.argv[1], ...args, ...next], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}
// Last resort: nothing abroad was big enough either. A Portuguese poll beats filler news, and it keeps
// the slot from staying empty (an empty slot would be retried every run and block the radar).
if (done === 0 && slot.startsWith("pt-") && !tip && fmtArg < 0 && anyStory && !refresh) {
  // A poll already runs near this slot: rather than another poll, take the best story from abroad at
  // the normal bar (--last). Only if even that fails does the slot get a poll.
  const next = lastResort ? args.filter((a) => a !== "--any" && a !== "--last").concat("--format", "poll") : [...args, "--last"];
  console.log(`\nnothing from abroad was big enough: ${lastResort ? "a community poll instead" : "trying the best story from abroad at the normal bar"}`);
  const r = spawnSync(process.execPath, [process.argv[1], ...next], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}
console.log(`\ndone: ${done} post(s) ${dry ? "rendered (dry run)" : prepare ? "prepared and queued" : "published"}`);
process.exit(0); // don't wait on idle keep-alive sockets

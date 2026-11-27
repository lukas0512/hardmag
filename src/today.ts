// "Today in Lisbon & Porto": every afternoon, stories only (no feed post). The day's parties per city
// as dense lists (lineup, venue and promoter, sounds, kind of space, day or night), 5 a page.
// Prepared on the Mac (Shotgun blocks GitHub's servers): scripts/guides-local.sh today, run by
// ~/Library/LaunchAgents/pt.hardmag.today.plist. It goes into the queue like any post, is sent to
// Telegram for approval, and GitHub publishes the stories at TODAY_AT (UTC).
//   node src/today.ts [--day YYYY-MM-DD] [--dry]
import fs from "node:fs";
import path from "node:path";
import { BRAND, CONFIG, PATHS } from "./config.ts";
import { writeWeek, dayLabel, shotgunDetails } from "./formats.ts";
import { enrichNights, nightStories } from "./nights.ts";
import { renderAnimation, STORY_BEATS } from "./video.ts";
import { closeRenderer } from "./render.ts";
import { hostImage } from "./publish.ts";
import { loadQueue, saveQueue, validate, type QueueItem } from "./queue.ts";
import { writeQueueReport } from "./queue-status.ts";
import { loadState } from "./state.ts";
import type { WeekItem } from "./templates.ts";

const TODAY_AT = process.env.TODAY_AT || "17:00"; // UTC (= Lisbon in winter)
const MIN_PARTIES = 3;

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const dayArg = args.indexOf("--day");
const day = dayArg >= 0 ? args[dayArg + 1] : new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Lisbon" });
const key = `${day}-pt-today`;
const [h, m] = TODAY_AT.split(":").map(Number);
const at = new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), h, m));

if (!dry && loadQueue().some((i) => i.key === key && i.status !== "failed")) {
  console.log(`${key} already queued`);
  process.exit(0);
}
if (!dry && Date.now() > at.getTime() + 3 * 36e5) {
  console.log(`${key}: too late in the day for today's stories`);
  process.exit(0);
}

const w = await writeWeek("today", new Date(`${day}T12:00:00Z`));
if (!w || w.events.length < MIN_PARTIES) {
  console.log(`today: only ${w?.events.length ?? 0} parties, no stories today`);
  process.exit(0);
}
const same = (a: string, b: string) => { const n = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, ""); return !n(a) || n(b).includes(n(a)) || n(a).includes(n(b)); };
const items: WeekItem[] = w.events.map((e) => ({ ...e, party: same(e.party, e.name) ? "" : e.party, time: /\d/.test(e.time) ? e.time : "late", day: dayLabel(e.date) }));
enrichNights(items, w.events, await shotgunDetails(items.map((e) => e.link ?? "")));
// Day parties first, then by start time (a 02:00 start belongs to the night before, so it sorts last).
const order = (e: WeekItem) => `${e.daytime ? 0 : 1}${e.time < "06" ? "z" : ""}${e.time}`;
items.sort((a, b) => order(a).localeCompare(order(b)));
console.log(`today: ${items.length} parties (${items.filter((e) => e.city !== "Porto").length} Lisbon, ${items.filter((e) => e.city === "Porto").length} Porto), promoter for ${items.filter((e) => e.organizer).length}`);

const slug = `${day}-today-lisbon-porto`;
const outDir = path.join(PATHS.out, slug);
fs.mkdirSync(outDir, { recursive: true });
const issue = loadState().posted.length || undefined;
const pages = nightStories(slug, "Today", [[dayLabel(day), items]], issue, { line: "Tickets on Shotgun", sub: "Send it to who you're going with" });
const videos: string[] = [];
for (const p of pages) {
  const r = await renderAnimation(p.slide, outDir, p.track, STORY_BEATS);
  if (r.video) videos.push(r.video);
  else console.warn(`  no video for ${p.slide.name} (still: ${r.still})`);
}
await closeRenderer();
console.log(`today: ${videos.length}/${pages.length} stories rendered → ${path.relative(process.cwd(), outDir)}`);

// What the editor reads on Telegram (stories have no caption on Instagram).
const line = (e: WeekItem) => `${e.pick ? "★ " : ""}${e.time}${e.end ? `–${e.end}` : ""} · ${[e.headliner || e.name, ...(e.support ?? [])].slice(0, 5).join(" / ")} @ ${e.venue}${e.organizer ? ` (by ${e.organizer})` : ""} · ${(e.moods?.length ? e.moods.slice(0, 3) : [e.genre]).join(", ").toLowerCase()} · ${(e.space ?? "club").toLowerCase()}${e.price ? ` · ${e.price}` : ""}`;
const summary = ["Lisbon", "Porto"].map((c) => { const xs = items.filter((e) => (e.city === "Porto" ? "Porto" : "Lisbon") === c); return xs.length ? `${c.toUpperCase()}\n${xs.map(line).join("\n")}` : ""; }).filter(Boolean).join("\n\n");
fs.writeFileSync(path.join(outDir, "summary.txt"), summary + "\n");
if (dry || !videos.length) process.exit(0);

const storyVideos: string[] = [];
for (const v of videos) storyVideos.push(await hostImage(v));
const headline = `Today in Lisbon & Porto, ${dayLabel(day)}`;
const item: QueueItem = {
  key, day, slot: "pt-today", at: at.toISOString(), status: "ready", preparedAt: new Date().toISOString(),
  headline, kind: "today", urls: [], storyVideos, caption: summary, handles: [...new Set(items.flatMap((e) => e.handles ?? []))].slice(0, 30), checks: [],
  article: { slug, kicker: "TODAY", headline, highlight: [], standfirst: headline, body: summary.split("\n"), source: BRAND.name, sourceUrl: BRAND.site, hashtags: [], issue, beat: "pt", slot: "today" },
  posted: { id: `today-${day}`, url: BRAND.site, title: headline, headline, source: BRAND.name, slug },
};
try {
  item.checks = await validate(item, Boolean(CONFIG.igUserId && CONFIG.igToken));
  for (const c of item.checks) console.log(`  ✓ ${c}`);
} catch (e) {
  item.status = "failed";
  item.error = (e as Error).message.slice(0, 300);
  console.error(`  ✗ validation failed: ${item.error}`);
}
const q = loadQueue().filter((i) => !(i.key === key && i.status === "ready"));
q.push(item);
saveQueue(q);
writeQueueReport();
console.log(`  ${item.status === "ready" ? "✓ queued" : "✗ not queued"} for ${item.at.slice(0, 16).replace("T", " ")} UTC (${key})`);

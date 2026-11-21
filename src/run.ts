// HARDMAG pipeline: fetch -> pick -> write -> render -> host -> publish.
// Flags: --dry (render only, never publish), --count N (posts this run)
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { CONFIG, PATHS, BRAND } from "./config.ts";
import { fetchStories, fetchArticle, downloadImage, type Story } from "./fetch.ts";
import { pickStories, writePost, reviewPost, rewritePost, writeSpotlight, buildCaption, hasClaude, type WrittenPost } from "./write.ts";
import { postSlides, agendaCover, agendaList, pollCover, storyFrame, type PostContent, type Slide } from "./templates.ts";
import { writeAgenda, agendaSlidesData, writePoll } from "./formats.ts";
import { preparePhoto } from "./photo.ts";
import { renderCoverVideo } from "./video.ts";
import { nextArtist, gatherMaterial, markFeatured, type Artist } from "./spotlight.ts";
import { renderSlides, closeRenderer } from "./render.ts";
import { hostImage, publishToInstagram } from "./publish.ts";
import { loadState, saveState, normTitle } from "./state.ts";
import { saveArticle, articleUrl } from "./articles.ts";
import { resolveTags } from "./people.ts";
import { collectInsights, learnings, writeReport } from "./insights.ts";
import { SOURCES } from "./sources.ts";
import crypto from "node:crypto";
import { loadQueue, saveQueue, slotTime, validate, type QueueItem } from "./queue.ts";
import { writeQueueReport } from "./queue-status.ts";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const countArg = args.indexOf("--count");
// --radar: hourly check. Posts one story only if the editor rates it hot (heat >= RADAR_MIN_HEAT),
// at most RADAR_DAILY_MAX posts in 24h overall, and never within RADAR_GAP_MIN of the last post.
const radar = args.includes("--radar");
const RADAR_MIN_HEAT = Number(process.env.RADAR_MIN_HEAT ?? 9);
const RADAR_DAILY_MAX = Number(process.env.RADAR_DAILY_MAX ?? 5);
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
  "pt-scene": "What matters to ravers in Portugal tonight: Portuguese scene news first; otherwise the biggest techno or hard techno story of the day, ideally with a Portugal angle (artists touring Portugal, festivals with Portuguese dates).",
};
const slotArg = args.indexOf("--slot");
const slot = slotArg >= 0 ? args[slotArg + 1] : "";
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
  sh("git", ["add", "--", ...existing("state/state.json", "state/articles.json", "state/handles-pending.json", "state/performance.json", "state/spotlight.json", "state/polls.json", "reports/desempenho.md")]);
  if (spawnSync("git", ["diff", "--cached", "--quiet"]).status === 0) return;
  sh("git", ["commit", "-q", "-m", `post: ${label}`]);
  sh("git", ["pull", "-q", "--rebase"]);
  if (sh("git", ["push", "-q"])) sh("gh", ["workflow", "run", "site.yml"]);
}

function syncQueue(label: string) {
  const sh = (cmd: string, a: string[]) => spawnSync(cmd, a, { stdio: "inherit" }).status === 0;
  saveState(state);
  sh("git", ["add", "--", ...existing("state/queue.json", "reports/fila.md", "state/state.json", "state/handles-pending.json", "state/performance.json", "state/spotlight.json", "state/polls.json", "reports/desempenho.md")]);
  if (spawnSync("git", ["diff", "--cached", "--quiet"]).status === 0) return;
  sh("git", ["commit", "-q", "-m", `queue: ${label}`]);
  for (let i = 0; i < 3; i++) if (sh("git", ["pull", "-q", "--rebase"]) && sh("git", ["push", "-q"])) break;
}

// Prepare mode: host the rendered files, validate everything (incl. a real Instagram container that is
// never published) and add the post to the queue.
async function enqueue(p: { kind: QueueItem["kind"]; files: string[]; video?: string; caption: string; handles: string[]; article: QueueItem["article"]; posted: QueueItem["posted"]; featured?: string }) {
  const urls: string[] = [];
  for (const f of p.files) urls.push(await hostImage(f));
  const videoUrl = p.video ? await hostImage(p.video).catch(() => undefined) : undefined;
  const at = slotTime(prepareDay, slot);
  // Story version: the cover in a 9:16 frame with a call to action fitting the format.
  const cta = { poll: ["Vote now", "Comment A, B, C… on our latest post"], agenda: ["Your weekend", "Full guide on our latest post"] }[p.kind as "poll" | "agenda"] ?? ["New on HARDMAG", "Swipe the post · full story on hardmag.pt"];
  let storyUrl: string | undefined;
  try {
    const [storyFile] = await renderSlides([storyFrame(path.resolve(p.files[0]), p.article.slug, p.article.issue, p.kind === "spotlight" ? "Spotlight" : p.kind === "poll" ? "Poll" : p.kind === "agenda" ? "Weekend guide" : "News", cta[0], cta[1])], path.dirname(p.files[0]));
    storyUrl = await hostImage(storyFile);
  } catch (e) {
    console.warn(`  [story] ${(e as Error).message.slice(0, 120)}`);
  }
  const item: QueueItem = {
    key: `${prepareDay}-${slot}`, day: prepareDay, slot, at: at.toISOString(), status: "ready", preparedAt: new Date().toISOString(),
    headline: p.article.headline, kind: p.kind, urls, videoUrl, storyUrl, caption: p.caption, handles: p.handles, article: p.article, posted: p.posted, featured: p.featured, checks: [],
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

// Special formats: weekend agenda on Friday mornings, community poll on Tuesday and Sunday evenings.
// --format agenda|poll forces one (handy for testing with --dry).
const fmtArg = args.indexOf("--format");
const weekday = (prepareDay ? new Date(`${prepareDay}T12:00:00Z`) : new Date()).getUTCDay();
const format = fmtArg >= 0 ? args[fmtArg + 1] : slot === "pt-news" && weekday === 5 ? "agenda" : slot === "pt-scene" && [0, 2, 4].includes(weekday) ? "poll" : "";
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
  if (format === "agenda") {
    const a = await writeAgenda();
    if (a && a.lisbon.length + a.porto.length >= 4) {
      const parts = agendaSlidesData(a);
      const total = 1 + parts.lisbon.length + (parts.porto.length ? 1 : 0);
      const slug = `${day}-weekend-guide-lisbon-porto`;
      kicker = "WEEKEND GUIDE";
      headline = `Weekend guide: Lisbon & Porto, ${a.label}`;
      slides.push(agendaCover(slug, `Lisbon &amp; Porto <span class="hl">this weekend</span>`, `${a.label} · ${a.lisbon.length + a.porto.length} parties worth your night`, "Weekend guide", issue, new Date(), total));
      parts.lisbon.forEach((items, i) => slides.push(agendaList(slug, parts.lisbon.length > 1 ? `Lisbon <span class="hl">${i + 1}/${parts.lisbon.length}</span>` : "Lisbon", items, issue, new Date(), slides.length + 1, total)));
      if (parts.porto.length) slides.push(agendaList(slug, "Porto", parts.porto, issue, new Date(), slides.length + 1, total));
      const list = (city: string, xs: typeof a.lisbon) => xs.length ? `\n\n${city.toUpperCase()}\n${xs.map((e) => `${e.day} ${e.time} · ${e.name} @ ${e.venue}${e.price ? ` (${e.price})` : ""}`).join("\n")}` : "";
      caption = `${a.caption.trim()}${list("Lisbon", a.lisbon)}${list("Porto", a.porto)}\n\n${a.question.trim()} 👇\n\nTickets on Shotgun.`;
      body = [a.caption, ...a.lisbon.map((e) => `Lisbon · ${e.day} ${e.time}: ${e.name} at ${e.venue}${e.price ? `, ${e.price}` : ""}.`), ...a.porto.map((e) => `Porto · ${e.day} ${e.time}: ${e.name} at ${e.venue}${e.price ? `, ${e.price}` : ""}.`)];
      people = a.people;
      hashtags = a.hashtags;
    } else console.log("agenda: not enough listings, posting news instead");
  } else if (format === "poll") {
    const handles = JSON.parse(fs.readFileSync(path.join(PATHS.state, "..", "handles.json"), "utf8")).handles as Record<string, string>;
    const names = [...new Set(Object.keys(handles))].filter((n) => !["Mixmag", "DJ Mag", "Crack Magazine", "Electronic Groove", "Rimas e Batidas"].includes(n));
    const pl = await writePoll(names);
    if (pl) {
      const slug = `${day}-poll-${slugify(pl.topic)}`;
      kicker = "COMMUNITY POLL";
      headline = pl.question;
      slides = [pollCover(slug, pl.question, pl.highlight, pl.options, issue, new Date())];
      caption = `${pl.caption.trim()}\n\n${pl.options.map((o, i) => `${String.fromCharCode(65 + i)}: ${o}`).join("\n")}\n\nVote with the letter in the comments 👇`;
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
    fs.writeFileSync(path.join(outDir, "caption.txt"), fullCaption + "\n");
    console.log(`${format}: rendered ${files.length} slide(s) → ${path.relative(process.cwd(), outDir)}${tags.length ? ` · tags ${tags.map((t) => "@" + t.username).join(" ")}` : ""}`);
    if (prepare) {
      const article = { slug, kicker, headline, highlight: [], standfirst: body[0] ?? "", body, source: BRAND.name, sourceUrl: `https://www.instagram.com/${BRAND.handle.replace(/^@/, "")}/`, hashtags, issue, beat: "pt" as const, slot: format };
      await enqueue({ kind: format as "agenda" | "poll", files, caption: fullCaption, handles: tags.map((t) => t.username), article, posted: { id: `${format}-${day}`, url: `${BRAND.site}/news/${slug}/`, title: headline, headline, source: BRAND.name, slug } });
      syncQueue(slug);
    } else if (!dry) {
      let igMediaId: string | undefined;
      if (CONFIG.igUserId && CONFIG.igToken) {
        const urls: string[] = [];
        for (const f of files) urls.push(await hostImage(f));
        igMediaId = await publishToInstagram(urls, fullCaption, tags.map((t) => t.username));
        console.log(`  ✓ published on Instagram: ${igMediaId}`);
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

const stories = tip ? [] : await fetchStories(state.seen);
const fresh = stories.filter((s) => !postedUrls.has(s.url) && !postedTitles.has(normTitle(s.title)));
for (const s of fresh) state.seen[s.id] ??= new Date().toISOString();
console.log(`feeds: ${stories.length} recent stories, ${fresh.length} not posted yet`);

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
const preset = new Map<string, { written: WrittenPost; image?: string; artist: Artist; material?: string }>();
let spotStory: Story | undefined;
if (slot === "artists" || slot === "pt-artists") {
  // Portuguese artists first; the rest of the time techno, house and bouncy/hard house artists.
  const artist = slot === "pt-artists" ? (nextArtist(/portugal|lisbon/i, 10) ?? nextArtist(undefined, 14)) : nextArtist();
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
      preset.set(spotStory.id, { written: w, image: mat.image, artist, material: mat.text });
    } else console.log("  spotlight skipped by editor, falling back to news");
  }
}
// Story choice: a hand-picked tip wins; then an Artist Spotlight; then news. Portugal slots look at
// Portuguese stories first and only fall back to the whole pool when nothing local is worth it.
// Spotlights keep news queued behind them in case the chief editor drops the spotlight.
async function newsPicks() {
  if (slot.startsWith("pt-")) {
    const local = fresh.filter((s) => s.beat === "pt" || /portugal|portugu|lisbo|lisbon|\bporto\b|algarve|coimbra|braga/i.test(`${s.title} ${s.summary}`));
    console.log(`portugal pool: ${local.length} stories`);
    if (local.length) {
      const p = (await pickStories(local.slice(0, 80), recent, count + 2, `${focus} Only pick stories genuinely about electronic music, clubs, DJs, festivals or nightlife; return none if nothing qualifies.`, lessons)).filter((x) => x.heat >= 4);
      // Global picks queue behind the Portuguese ones, in case the chief editor drops them all.
      const global = await pickStories(fresh.slice(0, 80), recent, count + 2, focus, lessons);
      return [...p, ...global.filter((g) => !p.some((x) => x.id === g.id))];
    }
  }
  return pickStories(fresh.slice(0, 80), recent, radar ? 3 : count + 3, focus, lessons);
}
const picks = tipStory
  ? [{ id: tipStory.id, heat: 9 }]
  : spotStory
    ? [{ id: spotStory.id, heat: 7 }, ...(await newsPicks())]
    : await newsPicks();
const heatOf = new Map(picks.map((p) => [p.id, p.heat]));
const byId = new Map([...fresh, ...(spotStory ? [spotStory] : []), ...(tipStory ? [tipStory] : [])].map((s) => [s.id, s]));
for (const p of picks) console.log(`  pick heat ${p.heat}: ${byId.get(p.id)?.title ?? p.id}`);
const chosen = radar ? picks.filter((p) => p.heat >= RADAR_MIN_HEAT) : picks;
if (radar && !chosen.length) {
  console.log(`radar: nothing at heat ${RADAR_MIN_HEAT}+ right now`);
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
  if (s === queue[queue.length - 1] && done === 0 && fallback && !reuse.size) {
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
    fallbackIfLast(s);
    continue;
  }

  const slug = `${prepareDay || new Date().toISOString().slice(0, 10)}-${slugify(written.headline)}`;
  // og:image is usually the biggest version; feed thumbnails are often ~600px.
  let imagePath: string | undefined;
  if (!article.ogImage && !s.feedImage) console.warn("  [img] no image in article or feed: typographic cover");
  for (const url of [article.ogImage, s.feedImage]) {
    if (url && (imagePath = await downloadImage(url.replace(/&amp;/g, "&"), slug))) break;
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
  const video = files.length > 1 ? await renderCoverVideo(content, files.length, outDir) : undefined;
  if (video) console.log("  video cover rendered");
  const link = articleUrl(slug);
  const tags = resolveTags(written.people);
  if (tags.length) console.log(`  tags: ${tags.map((t) => "@" + t.username).join(" ")}`);
  const caption = buildCaption(written, s, link, tags);
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
console.log(`\ndone: ${done} post(s) ${dry ? "rendered (dry run)" : prepare ? "prepared and queued" : "published"}`);
process.exit(0); // don't wait on idle keep-alive sockets

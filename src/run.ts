// HARDMAG pipeline: fetch -> pick -> write -> render -> host -> publish.
// Flags: --dry (render only, never publish), --count N (posts this run)
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { CONFIG, PATHS } from "./config.ts";
import { fetchStories, fetchArticle, downloadImage, type Story } from "./fetch.ts";
import { pickStories, writePost, buildCaption, hasClaude } from "./write.ts";
import { postSlides } from "./templates.ts";
import { preparePhoto } from "./photo.ts";
import { renderSlides, closeRenderer } from "./render.ts";
import { hostImage, publishToInstagram } from "./publish.ts";
import { loadState, saveState, normTitle } from "./state.ts";
import { saveArticle, articleUrl } from "./articles.ts";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const countArg = args.indexOf("--count");
// --radar: hourly check. Posts one story only if the editor rates it hot (heat >= RADAR_MIN_HEAT),
// at most RADAR_DAILY_MAX posts in 24h overall, and never within RADAR_GAP_MIN of the last post.
const radar = args.includes("--radar");
const RADAR_MIN_HEAT = Number(process.env.RADAR_MIN_HEAT ?? 8);
const RADAR_DAILY_MAX = Number(process.env.RADAR_DAILY_MAX ?? 7);
const RADAR_GAP_MIN = Number(process.env.RADAR_GAP_MIN ?? 75);
const count = radar ? 1 : countArg >= 0 ? Number(args[countArg + 1]) : CONFIG.postsPerRun;
// --gap N: minutes between posts (launch mode: several posts spread over a few hours).
const gapArg = args.indexOf("--gap");
const gapMin = gapArg >= 0 ? Number(args[gapArg + 1]) : 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// In CI: commit the article right after each post and redeploy the site, so the
// "full story" link works while the remaining launch posts are still queued.
function syncSite(label: string) {
  if (!process.env.GITHUB_ACTIONS) return;
  const sh = (cmd: string, a: string[]) => spawnSync(cmd, a, { stdio: "inherit" }).status === 0;
  saveState(state);
  sh("git", ["add", "state/state.json", "state/articles.json"]);
  if (spawnSync("git", ["diff", "--cached", "--quiet"]).status === 0) return;
  sh("git", ["commit", "-q", "-m", `post: ${label}`]);
  sh("git", ["pull", "-q", "--rebase"]);
  if (sh("git", ["push", "-q"])) sh("gh", ["workflow", "run", "site.yml"]);
}

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 50).replace(/-+$/, "");

const state = loadState();
const postedTitles = new Set(state.posted.map((p) => normTitle(p.title)));
const postedUrls = new Set(state.posted.map((p) => p.url));

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

console.log(`HARDMAG ${radar ? "radar" : "run"} — ${dry ? "DRY RUN" : "LIVE"} — ${count} post(s) — writer: ${hasClaude ? `${CONFIG.model} via Claude subscription` : "fallback (Claude Code not found)"}`);

const stories = await fetchStories(state.seen);
const fresh = stories.filter((s) => !postedUrls.has(s.url) && !postedTitles.has(normTitle(s.title)));
for (const s of fresh) state.seen[s.id] ??= new Date().toISOString();
console.log(`feeds: ${stories.length} recent stories, ${fresh.length} not posted yet`);

if (!fresh.length) {
  console.log("nothing new to post");
  saveState(state);
  process.exit(0);
}

const recent = state.posted.slice(-40).map((p) => `${p.headline} (${p.source})`);
// Ask for a couple of spares in case a story gets skipped by the writer.
const picks = await pickStories(fresh.slice(0, 60), recent, radar ? 3 : count + 2);
const byId = new Map(fresh.map((s) => [s.id, s]));
for (const p of picks) console.log(`  pick heat ${p.heat}: ${byId.get(p.id)?.title ?? p.id}`);
const chosen = radar ? picks.filter((p) => p.heat >= RADAR_MIN_HEAT) : picks;
if (radar && !chosen.length) {
  console.log(`radar: nothing at heat ${RADAR_MIN_HEAT}+ right now`);
  saveState(state);
  process.exit(0);
}
const queue = chosen.map((p) => byId.get(p.id)).filter((s): s is Story => Boolean(s));

let done = 0;
for (const s of queue) {
  if (done >= count) break;
  console.log(`\n→ ${s.source}: ${s.title}`);
  const article = await fetchArticle(s.url);
  const written = await writePost(s, article.text);
  if (!written || written.skip) {
    console.log("  skipped by editor");
    continue;
  }

  const slug = `${new Date().toISOString().slice(0, 10)}-${slugify(written.headline)}`;
  // og:image is usually the biggest version; feed thumbnails are often ~600px.
  let imagePath: string | undefined;
  if (!article.ogImage && !s.feedImage) console.warn("  [img] no image in article or feed: typographic cover");
  for (const url of [article.ogImage, s.feedImage]) {
    if (url && (imagePath = await downloadImage(url.replace(/&amp;/g, "&"), slug))) break;
  }

  const photo = imagePath ? await preparePhoto(imagePath) : undefined;
  if (photo) console.log(`  photo: ${photo.mode}, scale ${photo.scale.toFixed(2)}x`);
  const outDir = path.join(PATHS.out, slug);
  const files = await renderSlides(
    postSlides({
      slug,
      kicker: written.kicker,
      headline: written.headline,
      highlight: written.highlight,
      body: written.body,
      source: s.source,
      date: new Date(),
      issue: state.posted.length + 1,
      points: written.points,
      imagePath: photo?.file,
      photoMode: photo?.mode,
      photoHeight: photo?.height,
    }),
    outDir,
  );
  const link = articleUrl(slug);
  const caption = buildCaption(written, s, link);
  fs.writeFileSync(path.join(outDir, "caption.txt"), caption + "\n");
  fs.writeFileSync(path.join(outDir, "source.json"), JSON.stringify({ ...s, written }, null, 2));
  console.log(`  rendered ${files.length} slide(s) → ${path.relative(process.cwd(), outDir)}`);

  let igMediaId: string | undefined;
  if (!dry) {
    const igReady = Boolean(CONFIG.igUserId && CONFIG.igToken);
    let photoUrl: string | undefined;
    try {
      if (imagePath) photoUrl = await hostImage(imagePath);
      if (igReady) {
        const urls: string[] = [];
        for (const f of files) urls.push(await hostImage(f));
        igMediaId = await publishToInstagram(urls, caption);
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
      issue: state.posted.length + 1,
      points: written.points,
      beat: s.beat,
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
  if (!dry) syncSite(slug);
  if (gapMin > 0 && done < count) {
    console.log(`  … next post in ${gapMin} min`);
    await sleep(gapMin * 60_000);
  }
}

await closeRenderer();
saveState(state);
console.log(`\ndone: ${done} post(s) ${dry ? "rendered (dry run)" : "published"}`);
process.exit(0); // don't wait on idle keep-alive sockets

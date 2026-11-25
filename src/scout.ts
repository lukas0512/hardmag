// News scout: Claude searches the web (and reads what Portugal is searching on Google Trends) for
// fresh stories about the Portuguese scene that our feeds miss. Every story it returns is checked:
// the page must open and look like an article, and stories older than 24 h are dropped.
// Runs at most every SCOUT_EVERY_H hours; results are cached in state/scout.json.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";
import { ROOT } from "./config.ts";
import { askClaudeJson } from "./write.ts";
import { UA, type Story } from "./fetch.ts";

const FILE = path.join(ROOT, "state", "scout.json");
const SCOUT_EVERY_H = Number(process.env.SCOUT_EVERY_H ?? 3);

const ScoutSchema = z.object({
  stories: z.array(z.object({
    title: z.string(),
    url: z.string().describe("the article's own URL, exactly as found"),
    source: z.string().describe("outlet name"),
    published: z.string().describe("publication date-time in ISO 8601, as stated on the page"),
    summary: z.string().describe("2-3 sentences of what the article says, facts only"),
    portugal: z.boolean().describe("true if the story is about Portugal or Portuguese artists, clubs, festivals"),
  })).max(12),
});

async function trendsPT(): Promise<string> {
  try {
    const r = await fetch("https://trends.google.com/trending/rss?geo=PT", { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
    const xml = await r.text();
    return [...xml.matchAll(/<item>[\s\S]*?<title>([^<]+)<\/title>[\s\S]*?<ht:approx_traffic>([^<]+)</g)].map((m) => `${m[1]} (${m[2]})`).join(", ");
  } catch {
    return "";
  }
}

// The page must open, and its text must contain a few words of the title (no invented links).
async function check(url: string, title: string): Promise<{ ok: boolean; published?: string; image?: string }> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
    if (!r.ok) return { ok: false };
    const html = await r.text();
    const words = title.toLowerCase().normalize("NFKD").replace(/[^\w\s]/g, " ").split(/\s+/).filter((w) => w.length > 4);
    const text = html.toLowerCase().normalize("NFKD");
    const hits = words.filter((w) => text.includes(w)).length;
    if (!words.length || hits / words.length < 0.5) return { ok: false };
    const meta = (p: string) => html.match(new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${p}["'][^>]+content=["']([^"']+)`, "i"))?.[1];
    return { ok: true, published: meta("article:published_time") || meta("datePublished") || meta("pubdate"), image: meta("og:image") };
  } catch {
    return { ok: false };
  }
}

export async function scoutStories(force = false): Promise<Story[]> {
  const cache = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : { lastRun: "", stories: [] };
  const fresh = (s: any) => Date.now() - Date.parse(s.published) <= 24 * 36e5;
  const cached = (cache.stories ?? []).filter(fresh);
  if (!force && Date.now() - Date.parse(cache.lastRun || 0) < SCOUT_EVERY_H * 36e5) return toStories(cached);
  const trends = await trendsPT();
  const today = new Date().toISOString().slice(0, 16);
  let found: z.infer<typeof ScoutSchema>["stories"] = [];
  try {
    const out = await askClaudeJson(
      ScoutSchema,
      `It is ${today} UTC. You are HARDMAG's news scout. Search the web for news published in the LAST 24 HOURS that HARDMAG's audience in Portugal would care about:
1. Portugal first: electronic music, techno and house, clubs and nightlife in Lisbon, Porto and the rest of Portugal (Lux Frágil, KØMPLEX, Ministerium, Musicbox, Gare, Planeta Manas...), festivals (Neopop, Boom, Waking Life, Primavera Sound Porto...), Portuguese DJs and producers, nightlife policy, party lineups announced. Search in Portuguese and English (SIC Notícias, Público, Expresso, Observador, JN, Time Out Lisboa, Rimas e Batidas, Blitz and others).
2. Then what the global scene is talking about today (fast groove, bouncy, hard techno, big techno names, viral moments, controversies).
3. What Portugal is searching right now on Google Trends: ${trends || "(unavailable)"}. If a trend touches music, DJs, festivals or nightlife, find the article behind it.
Rules: only real articles you actually opened in your search results, with their exact URL and publication date. Nothing older than 24 hours. No invented stories, no event listings pages, no social media posts. If you find nothing good, return an empty list.`,
      true,
    );
    found = out?.stories ?? [];
  } catch (e) {
    console.warn(`  [scout] ${(e as Error).message.slice(0, 160)}`);
  }
  const ok: any[] = [];
  for (const s of found) {
    const c = await check(s.url, s.title);
    if (!c.ok) { console.log(`  [scout] dropped (page doesn't match): ${s.title}`); continue; }
    const published = c.published && !isNaN(Date.parse(c.published)) ? new Date(c.published).toISOString() : s.published;
    const st = { ...s, published, image: c.image };
    if (!fresh(st)) { console.log(`  [scout] dropped (older than 24 h): ${s.title}`); continue; }
    ok.push(st);
  }
  const merged = [...ok, ...cached.filter((c: any) => !ok.some((o) => o.url === c.url))];
  fs.writeFileSync(FILE, JSON.stringify({ lastRun: new Date().toISOString(), trends, stories: merged }, null, 2) + "\n");
  console.log(`scout: ${ok.length} new verified stor${ok.length === 1 ? "y" : "ies"} from the web (${found.length} found)`);
  return toStories(merged);
}

function toStories(xs: any[]): Story[] {
  return xs.map((s) => ({
    id: crypto.createHash("sha1").update(s.url).digest("hex").slice(0, 12),
    source: s.source, weight: s.portugal ? 2 : 1, title: s.title, url: s.url, summary: s.summary,
    published: new Date(s.published), feedImage: s.image, beat: s.portugal ? ("pt" as const) : ("club" as const),
  }));
}

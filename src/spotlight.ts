// Picks the next artist for an original Artist Spotlight (the one featured least recently)
// and gathers what our feeds have published about them lately.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./config.ts";
import { fetchArticle, type Story } from "./fetch.ts";

export type Artist = { name: string; handle: string; lane: string; wiki?: string }; // wiki: "en:Title" or "pt:Title"
const FILE = path.join(ROOT, "state", "spotlight.json");
const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

// lane: only artists whose lane matches (e.g. /portugal/i). minDays: don't repeat an artist sooner.
export function nextArtist(lane?: RegExp, minDays = 0): Artist | undefined {
  if (!fs.existsSync(FILE)) return;
  const { artists = [], featured = {}, tried = {} } = JSON.parse(fs.readFileSync(FILE, "utf8"));
  // Least recently featured (or tried and dropped) first; artists with a Wikipedia page first among equals.
  const last = (a: Artist) => [featured[a.handle] ?? "", tried[a.handle] ?? ""].sort().pop()!;
  return [...(artists as Artist[])]
    .filter((a) => !lane || lane.test(a.lane))
    .filter((a) => !featured[a.handle] || Date.now() - Date.parse(featured[a.handle]) > minDays * 864e5)
    .sort((a, b) => last(a).slice(0, 10).localeCompare(last(b).slice(0, 10)) || Number(!a.wiki) - Number(!b.wiki))[0];
}

// The chief editor dropped this artist's spotlight: rotate to the next one on the following attempt.
export function markTried(a: Artist) {
  const d = JSON.parse(fs.readFileSync(FILE, "utf8"));
  d.tried = { ...(d.tried ?? {}), [a.handle]: new Date().toISOString() };
  fs.writeFileSync(FILE, JSON.stringify(d, null, 2) + "\n");
}

export function markFeatured(a: Artist) {
  const d = JSON.parse(fs.readFileSync(FILE, "utf8"));
  d.featured = { ...(d.featured ?? {}), [a.handle]: new Date().toISOString() };
  fs.writeFileSync(FILE, JSON.stringify(d, null, 2) + "\n");
}

export async function gatherMaterial(a: Artist, stories: Story[]): Promise<{ text: string; image?: string }> {
  const n = norm(a.name);
  const hits = stories.filter((s) => norm(`${s.title} ${s.summary}`).includes(n)).slice(0, 3);
  const parts: string[] = [];
  let image: string | undefined;
  for (const s of hits) {
    const art = await fetchArticle(s.url);
    parts.push(`[${s.source}] ${s.title}\n${(art.text || s.summary).slice(0, 2500)}`);
    image ??= art.ogImage || s.feedImage;
  }
  // Background from Wikipedia (public API), so a spotlight has verifiable facts even when no
  // outlet wrote about the artist this week.
  const bio = await wikipedia(a);
  if (bio) parts.push(bio);
  return { text: parts.join("\n\n"), image };
}

async function wikipedia(a: Artist): Promise<string> {
  const [lang, title] = a.wiki?.includes(":") ? [a.wiki.slice(0, 2), a.wiki.slice(3)] : ["en", a.name];
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&titles=${encodeURIComponent(title)}`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "HARDMAG-bot/1.0 (music news)" }, signal: AbortSignal.timeout(20000) });
    const pages = (await r.json())?.query?.pages ?? {};
    const page = Object.values(pages)[0] as { extract?: string; title?: string } | undefined;
    const text = page?.extract?.trim();
    if (!text || text.length < 200 || (!a.wiki && (norm(page!.title ?? "") !== norm(a.name) || !/music|dj|producer|músic|produtor/i.test(text.slice(0, 600))))) return "";
    return `[Wikipedia (${lang}): ${page!.title}]\n${text.replace(/\n{2,}/g, "\n").slice(0, 5000)}`;
  } catch {
    return "";
  }
}

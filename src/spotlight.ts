// Picks the next artist for an original Artist Spotlight (the one featured least recently)
// and gathers what our feeds have published about them lately.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./config.ts";
import { fetchArticle, type Story } from "./fetch.ts";

export type Artist = { name: string; handle: string; lane: string };
const FILE = path.join(ROOT, "state", "spotlight.json");
const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

// lane: only artists whose lane matches (e.g. /portugal/i). minDays: don't repeat an artist sooner.
export function nextArtist(lane?: RegExp, minDays = 0): Artist | undefined {
  if (!fs.existsSync(FILE)) return;
  const { artists = [], featured = {} } = JSON.parse(fs.readFileSync(FILE, "utf8"));
  return [...(artists as Artist[])]
    .filter((a) => !lane || lane.test(a.lane))
    .filter((a) => !featured[a.handle] || Date.now() - Date.parse(featured[a.handle]) > minDays * 864e5)
    .sort((a, b) => (featured[a.handle] ?? "").localeCompare(featured[b.handle] ?? ""))[0];
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
  return { text: parts.join("\n\n"), image };
}

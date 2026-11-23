// Real photos for covers that have no press photo, so we don't fall back to type-only covers:
// - an artist's photo from their own Wikipedia article (only freely licensed files on Commons),
// - otherwise a scene photo from our library (state/photos.json), least recently used first.
// Every photo comes with a credit line for the caption.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./config.ts";
import { downloadImage } from "./fetch.ts";

export type RealPhoto = { file: string; credit: string };
const LIB = path.join(ROOT, "state", "photos.json");
const UA = { "User-Agent": "HARDMAG-bot/1.0 (music news; hardmag.pt)" };
const FREE = /^(cc[ -]?by|cc[ -]?by[ -]?sa|cc0|public domain|pd)/i;
const strip = (s = "") => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

async function commons(file: string): Promise<{ url: string; credit: string } | undefined> {
  const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=2000&iiextmetadatafilter=LicenseShortName|Artist&titles=${encodeURIComponent("File:" + file)}`;
  const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) });
  const page = Object.values((await r.json())?.query?.pages ?? {})[0] as any;
  const ii = page?.imageinfo?.[0];
  if (!ii || page.missing !== undefined) return;
  const lic = strip(ii.extmetadata?.LicenseShortName?.value);
  if (!FREE.test(lic)) return;
  return { url: ii.thumburl || ii.url, credit: `${strip(ii.extmetadata?.Artist?.value) || "Unknown"}, ${lic}, via Wikimedia Commons` };
}

// The lead image of the artist's own Wikipedia article (the same page the spotlight's facts come from).
export async function wikiPhoto(title: string, lang = "en", slug: string): Promise<RealPhoto | undefined> {
  try {
    const u = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=name&redirects=1&titles=${encodeURIComponent(title)}`;
    const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) });
    const page = Object.values((await r.json())?.query?.pages ?? {})[0] as any;
    const norm = (t = "") => t.replace(/\s*\(.*\)$/, "").normalize("NFKD").replace(/[^a-z0-9]/gi, "").toLowerCase();
    // A redirect to another page (e.g. an artist to their label) would give someone else's photo.
    if (!page?.pageimage || norm(page.title) !== norm(title)) return;
    const name = page.pageimage;
    const c = await commons(name); // a file only on Wikipedia (not Commons) is usually non-free: skip it
    if (!c) return;
    const file = (await downloadImage(c.url, `${slug}-wiki`)) ?? (await new Promise((r) => setTimeout(r, 6000)), await downloadImage(c.url, `${slug}-wiki`));
    return file ? { file, credit: c.credit } : undefined;
  } catch {
    return;
  }
}

export async function libraryPhoto(slug: string, prefer: string[] = []): Promise<RealPhoto | undefined> {
  if (!fs.existsSync(LIB)) return;
  const lib = JSON.parse(fs.readFileSync(LIB, "utf8"));
  const used: Record<string, string> = lib.used ?? {};
  // Earlier tags in `prefer` matter more; then the least recently used photo.
  const score = (p: any) => Math.min(...prefer.map((t, i) => (p.tags?.includes(t) ? i : prefer.length)), prefer.length);
  const order = [...lib.photos].sort((a, b) => score(a) - score(b) || (used[a.file ?? a.url] ?? "").localeCompare(used[b.file ?? b.url] ?? ""));
  for (const p of order) {
    try {
      let file: string | undefined;
      let credit = p.credit;
      if (p.url) file = await downloadImage(p.url, `${slug}-lib`);
      else if (fs.existsSync(path.join(ROOT, "photos", p.file))) file = path.join(ROOT, "photos", p.file);
      else {
        const c = await commons(p.file);
        if (c) {
          file = await downloadImage(c.url, `${slug}-lib`);
          credit ||= c.credit;
        }
      }
      if (!file) continue;
      lib.used = { ...used, [p.file ?? p.url]: new Date().toISOString() };
      fs.writeFileSync(LIB, JSON.stringify(lib, null, 2) + "\n");
      return { file, credit };
    } catch {
      continue;
    }
  }
  return;
}

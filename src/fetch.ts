// Pulls RSS feeds, resolves a lead image and the article text for each story.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Parser from "rss-parser";
import { imageSize } from "image-size";
import { SOURCES, type Source } from "./sources.ts";
import { CONFIG, PATHS } from "./config.ts";

export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export type Story = {
  id: string;
  source: string;
  weight: number;
  title: string;
  url: string;
  summary: string;
  published: Date;
  feedImage?: string;
};

type Item = Parser.Item & {
  mediaContent?: { $?: { url?: string } } | { $?: { url?: string } }[];
  mediaThumbnail?: { $?: { url?: string } };
  "content:encoded"?: string;
};

const parser: Parser<object, Item> = new Parser({
  timeout: 20000,
  headers: { "User-Agent": UA },
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: false }],
      ["media:thumbnail", "mediaThumbnail"],
      ["content:encoded", "content:encoded"],
    ],
  },
});

const strip = (html = "") =>
  decodeEntities(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

function decodeEntities(s: string) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function feedImage(it: Item): string | undefined {
  const mc = Array.isArray(it.mediaContent) ? it.mediaContent[0] : it.mediaContent;
  return (
    mc?.$?.url ||
    it.mediaThumbnail?.$?.url ||
    (it.enclosure?.type?.startsWith("image") ? it.enclosure.url : undefined) ||
    (it["content:encoded"] || it.content || "").match(/<img[^>]+src="([^"]+)"/i)?.[1]
  );
}

async function readFeed(src: Source, firstSeen: Record<string, string>): Promise<Story[]> {
  try {
    const feed = await parser.parseURL(src.feed);
    // Undated feeds list newest first: only trust the top of the list.
    const items = src.noDate ? feed.items.slice(0, 12) : feed.items;
    return items.flatMap((it) => {
      if (!it.link || !it.title) return [];
      const id = crypto.createHash("sha1").update(it.link).digest("hex").slice(0, 12);
      const raw = it.isoDate || it.pubDate;
      const published = raw && !isNaN(Date.parse(raw)) ? new Date(raw) : new Date(firstSeen[id] ?? Date.now());
      return [
        {
          id,
          source: src.name,
          weight: src.weight,
          title: decodeEntities(it.title.trim()),
          url: it.link,
          summary: strip(it.contentSnippet || it.content || it["content:encoded"] || "").slice(0, 500),
          published,
          feedImage: feedImage(it),
        },
      ];
    });
  } catch (e) {
    console.warn(`[feed] ${src.name} failed: ${(e as Error).message}`);
    return [];
  }
}

export async function fetchStories(firstSeen: Record<string, string> = {}): Promise<Story[]> {
  const all = (await Promise.all(SOURCES.map((s) => readFeed(s, firstSeen)))).flat();
  const cutoff = Date.now() - CONFIG.maxAgeHours * 36e5;
  return all.filter((s) => s.published.getTime() >= cutoff).sort((a, b) => +b.published - +a.published);
}

/* ---------- Article page: text + og:image ---------- */

export type Article = { text: string; ogImage?: string };

export async function fetchArticle(url: string): Promise<Article> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
    if (!res.ok) {
      console.warn(`  [article] ${res.status} from ${new URL(url).host}: using the feed summary`);
      return { text: "" };
    }
    const html = await res.text();
    const meta = (prop: string) =>
      html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)`, "i"))?.[1] ||
      html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, "i"))?.[1];
    const body = html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html;
    const paras = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((m) => strip(m[1]))
      .filter((t) => t.length > 60);
    return { text: paras.join("\n").slice(0, 7000), ogImage: decodeEntities(meta("og:image") || meta("twitter:image") || "") || undefined };
  } catch (e) {
    console.warn(`  [article] fetch failed: ${(e as Error).message}`);
    return { text: "" };
  }
}

/* ---------- Image download ---------- */

export async function downloadImage(url: string, name: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "image/*" }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) {
      console.warn(`  [img] ${res.status} from ${new URL(url).host}`);
      return;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const { width = 0, height = 0, type } = imageSize(buf);
    if (width < 700 || height < 450) {
      console.warn(`[img] too small (${width}x${height}) — typographic cover instead`);
      return;
    }
    const dir = path.join(PATHS.tmp, "img");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${name}.${type ?? "jpg"}`);
    fs.writeFileSync(file, buf);
    return file;
  } catch (e) {
    console.warn(`  [img] download failed: ${(e as Error).message}`);
    return;
  }
}

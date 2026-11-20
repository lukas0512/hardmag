// The website's article store (state/articles.json). One entry per published story.
import fs from "node:fs";
import path from "node:path";
import { ROOT, BRAND } from "./config.ts";

export type Article = {
  slug: string;
  date: string;          // ISO
  kicker: string;
  headline: string;
  highlight: string[];
  standfirst: string;    // first paragraph / summary line
  body: string[];        // website paragraphs
  source: string;
  sourceUrl: string;
  image?: string;        // public URL of the story photo
  hashtags: string[];
  igMediaId?: string;
  issue?: number;        // catalog number HM.0001
  points?: { title: string; text: string }[];
};

export const ARTICLES = path.join(ROOT, "state", "articles.json");

export const articleUrl = (slug: string) => `${BRAND.site.replace(/\/$/, "")}/news/${slug}/`;

export function loadArticles(): Article[] {
  if (!fs.existsSync(ARTICLES)) return [];
  return JSON.parse(fs.readFileSync(ARTICLES, "utf8"));
}

export function saveArticle(a: Article) {
  const all = loadArticles().filter((x) => x.slug !== a.slug);
  all.push(a);
  all.sort((x, y) => y.date.localeCompare(x.date));
  fs.mkdirSync(path.dirname(ARTICLES), { recursive: true });
  fs.writeFileSync(ARTICLES, JSON.stringify(all, null, 2) + "\n");
}

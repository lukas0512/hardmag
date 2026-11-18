import fs from "node:fs";
import path from "node:path";
import { PATHS } from "./config.ts";

export type PostedEntry = {
  id: string;
  url: string;
  title: string;
  headline: string;
  source: string;
  at: string;
  igMediaId?: string;
  slug: string;
};

export type State = { seen: Record<string, string>; posted: PostedEntry[] };

export function loadState(): State {
  if (!fs.existsSync(PATHS.state)) return { seen: {}, posted: [] };
  return JSON.parse(fs.readFileSync(PATHS.state, "utf8"));
}

export function saveState(s: State) {
  // Keep the file small: forget "seen" ids older than 21 days, keep last 500 posts.
  const cutoff = Date.now() - 21 * 864e5;
  for (const [k, v] of Object.entries(s.seen)) if (Date.parse(v) < cutoff) delete s.seen[k];
  s.posted = s.posted.slice(-500);
  fs.mkdirSync(path.dirname(PATHS.state), { recursive: true });
  fs.writeFileSync(PATHS.state, JSON.stringify(s, null, 2) + "\n");
}

export const normTitle = (t: string) =>
  t.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();

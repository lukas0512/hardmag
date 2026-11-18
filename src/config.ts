import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env loader (no dependency). Real env vars win.
const envFile = path.join(ROOT, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const env = (k: string, d = "") => process.env[k] ?? d;

export const BRAND = {
  name: env("BRAND_NAME", "HARDMAG"),
  handle: env("BRAND_HANDLE", "@hardmag.news"),
  site: env("SITE_URL", "https://hardmag.pt"),
};

export const CONFIG = {
  model: env("CLAUDE_MODEL", "claude-opus-5-5"),
  postsPerRun: Number(env("POSTS_PER_RUN", "1")),
  maxAgeHours: Number(env("MAX_AGE_HOURS", "48")),
  // Instagram API with Instagram Login (graph.instagram.com)
  igUserId: env("IG_USER_ID"),
  igToken: env("IG_ACCESS_TOKEN"),
  igApiVersion: env("IG_API_VERSION", "v23.0"),
  // Public image hosting: rendered JPEGs are pushed to this public GitHub repo
  // and served from raw.githubusercontent.com (Instagram needs a public URL).
  mediaRepo: env("MEDIA_REPO"),              // "owner/repo"
  mediaBranch: env("MEDIA_BRANCH", "media"),
  githubToken: env("GITHUB_TOKEN") || env("GH_TOKEN"),
};

export const PATHS = {
  state: path.join(ROOT, "state", "state.json"),
  out: path.join(ROOT, "out"),
  tmp: path.join(ROOT, "out", "tmp"),
};

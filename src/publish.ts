// Hosts rendered images publicly (GitHub raw) and publishes to Instagram.
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------- Public hosting via a GitHub branch ---------- */

async function gh(method: string, url: string, body?: unknown) {
  const res = await fetch(`https://api.github.com${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${CONFIG.githubToken}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = res.status === 204 ? {} : await res.json().catch(() => ({}));
  return { status: res.status, json: json as Record<string, any> };
}

async function ensureMediaBranch() {
  const repo = CONFIG.mediaRepo;
  const b = await gh("GET", `/repos/${repo}/git/ref/heads/${CONFIG.mediaBranch}`);
  if (b.status === 200) return;
  const info = await gh("GET", `/repos/${repo}`);
  const def = await gh("GET", `/repos/${repo}/git/ref/heads/${info.json.default_branch}`);
  const r = await gh("POST", `/repos/${repo}/git/refs`, {
    ref: `refs/heads/${CONFIG.mediaBranch}`,
    sha: def.json.object.sha,
  });
  if (r.status >= 300) throw new Error(`could not create media branch: ${JSON.stringify(r.json)}`);
}

export async function hostImage(file: string): Promise<string> {
  if (!CONFIG.mediaRepo || !CONFIG.githubToken) throw new Error("MEDIA_REPO and GITHUB_TOKEN are required to host images");
  await ensureMediaBranch();
  const day = new Date().toISOString().slice(0, 10);
  const rel = `media/${day}/${path.basename(file)}`;
  const r = await gh("PUT", `/repos/${CONFIG.mediaRepo}/contents/${rel}`, {
    message: `media: ${path.basename(file)}`,
    content: fs.readFileSync(file).toString("base64"),
    branch: CONFIG.mediaBranch,
  });
  if (r.status >= 300 && r.status !== 422) throw new Error(`upload failed ${r.status}: ${JSON.stringify(r.json)}`);
  // Videos go through jsDelivr, which serves them as video/mp4 (raw.githubusercontent does not).
  const url = file.endsWith(".mp4")
    ? `https://cdn.jsdelivr.net/gh/${CONFIG.mediaRepo}@${CONFIG.mediaBranch}/${rel}`
    : `https://raw.githubusercontent.com/${CONFIG.mediaRepo}/${CONFIG.mediaBranch}/${rel}`;
  for (let i = 0; i < 15; i++) {
    const head = await fetch(url, { method: "HEAD" });
    if (head.ok) return url;
    await sleep(2000);
  }
  throw new Error(`hosted image never became reachable: ${url}`);
}

/* ---------- Instagram API (Instagram Login, graph.instagram.com) ---------- */

async function ig(pathPart: string, params: Record<string, string>, method: "GET" | "POST" = "POST") {
  const base = `https://${CONFIG.igApiHost}/${CONFIG.igApiVersion}/${pathPart}`;
  const qs = new URLSearchParams({ ...params, access_token: CONFIG.igToken });
  const res =
    method === "GET"
      ? await fetch(`${base}?${qs}`)
      : await fetch(base, { method: "POST", body: qs, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  const json = (await res.json()) as Record<string, any>;
  if (!res.ok || json.error) throw new Error(`Instagram ${pathPart}: ${JSON.stringify(json.error ?? json)}`);
  return json;
}

async function waitReady(containerId: string) {
  for (let i = 0; i < 60; i++) {
    const s = await ig(containerId, { fields: "status_code,status" }, "GET");
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error(`container ${containerId}: ${s.status}`);
    await sleep(3000);
  }
  throw new Error(`container ${containerId} not ready in time`);
}

// user_tags on the first image: tagged accounts get notified (and often reshare).
const userTags = (handles: string[]) =>
  JSON.stringify(handles.slice(0, 5).map((username, i) => ({ username, x: 0.18 + 0.16 * i, y: 0.9 })));

export async function publishToInstagram(imageUrls: string[], caption: string, tagHandles: string[] = [], videoUrl?: string): Promise<string> {
  if (!CONFIG.igUserId || !CONFIG.igToken) throw new Error("IG_USER_ID and IG_ACCESS_TOKEN are required");
  const me = CONFIG.igUserId;
  let creationId: string;
  if (videoUrl && imageUrls.length > 1) {
    // Carousel: motion cover first, then the image slides (tags go on the first image).
    const children: string[] = [(await ig(`${me}/media`, { media_type: "VIDEO", video_url: videoUrl, is_carousel_item: "true" })).id];
    for (const [i, url] of imageUrls.slice(1).entries()) {
      const params: Record<string, string> = { image_url: url, is_carousel_item: "true" };
      if (i === 0 && tagHandles.length) params.user_tags = userTags(tagHandles);
      children.push((await ig(`${me}/media`, params)).id);
    }
    for (const c of children) await waitReady(c);
    creationId = (await ig(`${me}/media`, { media_type: "CAROUSEL", children: children.join(","), caption })).id;
  } else if (imageUrls.length === 1) {
    creationId = (await ig(`${me}/media`, { image_url: imageUrls[0], caption, ...(tagHandles.length ? { user_tags: userTags(tagHandles) } : {}) })).id;
  } else {
    const children: string[] = [];
    for (const [i, url] of imageUrls.entries()) {
      const params: Record<string, string> = { image_url: url, is_carousel_item: "true" };
      if (i === 0 && tagHandles.length) params.user_tags = userTags(tagHandles);
      const c = await ig(`${me}/media`, params);
      children.push(c.id);
    }
    for (const c of children) await waitReady(c);
    creationId = (await ig(`${me}/media`, { media_type: "CAROUSEL", children: children.join(","), caption })).id;
  }
  await waitReady(creationId);
  const pub = await ig(`${me}/media_publish`, { creation_id: creationId });
  return pub.id;
}

export async function refreshIgToken(): Promise<{ token: string; expiresInDays: number }> {
  if (CONFIG.igApiHost !== "graph.instagram.com") return { token: CONFIG.igToken, expiresInDays: Infinity }; // system-user tokens never expire
  const res = await fetch(
    `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(CONFIG.igToken)}`,
  );
  const json = (await res.json()) as Record<string, any>;
  if (!res.ok || json.error) throw new Error(`refresh failed: ${JSON.stringify(json.error ?? json)}`);
  return { token: json.access_token, expiresInDays: Math.round(json.expires_in / 86400) };
}

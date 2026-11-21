// Publishes the queued post whose slot time has come (prepared and validated hours earlier by
// `npm run prepare`). No writing or rendering here: it only builds the container and publishes,
// so it takes a minute. Posts not published within PUBLISH_WINDOW_H of their time expire.
import { spawnSync } from "node:child_process";
import { CONFIG } from "./config.ts";
import { loadQueue, saveQueue, PUBLISH_WINDOW_H } from "./queue.ts";
import { writeQueueReport } from "./queue-status.ts";
import { publishToInstagram, publishStory } from "./publish.ts";
import { saveArticle } from "./articles.ts";
import { loadState, saveState } from "./state.ts";

const dry = process.argv.includes("--dry");
const now = Date.now();
const q = loadQueue();

let changed = false;
for (const i of q) {
  if (i.status === "ready" && now - Date.parse(i.at) > PUBLISH_WINDOW_H * 36e5) {
    i.status = "expired";
    changed = true;
    console.log(`expired: ${i.key} (${i.headline})`);
  }
}

const due = q.filter((i) => i.status === "ready" && Date.parse(i.at) <= now).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0];
if (!due) {
  console.log("publish: nothing due");
} else {
  console.log(`publish: ${due.key} — ${due.headline} (planned ${due.at.slice(11, 16)} UTC)`);
  if (dry) {
    console.log("  dry run: not publishing");
  } else {
    try {
      let id: string;
      try {
        id = await publishToInstagram(due.urls, due.caption, due.handles, due.videoUrl);
      } catch (e) {
        if (!due.videoUrl) throw e;
        console.warn(`  video carousel failed (${(e as Error).message.slice(0, 160)}), posting images only`);
        id = await publishToInstagram(due.urls, due.caption, due.handles);
      }
      due.status = "posted";
      due.igMediaId = id;
      due.publishedAt = new Date().toISOString();
      const at = due.publishedAt;
      saveArticle({ ...due.article, date: at, igMediaId: id });
      const state = loadState();
      state.posted.push({ ...due.posted, at, igMediaId: id });
      saveState(state);
      console.log(`  ✓ published on Instagram: ${id}`);
      if (due.storyUrl) {
        try {
          console.log(`  ✓ story: ${await publishStory(due.storyUrl)}`);
        } catch (e) {
          console.warn(`  story failed (the post is out): ${(e as Error).message.slice(0, 160)}`);
        }
      }
    } catch (e) {
      due.error = (e as Error).message.slice(0, 300);
      console.error(`  ✗ publish failed: ${due.error}`);
      // stays "ready": the next trigger retries until the window closes
    }
    changed = true;
  }
}

if (changed && !dry) {
  saveQueue(q);
  writeQueueReport();
  if (process.env.GITHUB_ACTIONS) {
    const sh = (cmd: string, a: string[]) => spawnSync(cmd, a, { stdio: "inherit" }).status === 0;
    sh("git", ["add", "state/queue.json", "reports/fila.md", "state/state.json", "state/articles.json"]);
    if (spawnSync("git", ["diff", "--cached", "--quiet"]).status !== 0) {
      sh("git", ["commit", "-q", "-m", `publish: ${due?.key ?? "queue"}`]);
      for (let i = 0; i < 3; i++) if (sh("git", ["pull", "-q", "--rebase"]) && sh("git", ["push", "-q"])) break;
      if (due?.status === "posted") sh("gh", ["workflow", "run", "site.yml"]);
    }
  }
}
if (due && due.status !== "posted" && !dry && CONFIG.igToken) process.exitCode = 1;
process.exit();

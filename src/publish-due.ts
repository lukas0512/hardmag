// Publishes the queued post whose slot time has come (prepared and validated hours earlier by
// `npm run prepare`). No writing or rendering here: it only builds the container and publishes,
// so it takes a minute. Posts not published within PUBLISH_WINDOW_H of their time expire.
import { spawnSync } from "node:child_process";
import { CONFIG } from "./config.ts";
import { loadQueue, saveQueue, PUBLISH_WINDOW_H, tooOld, type QueueItem } from "./queue.ts";
import { awaitingApproval } from "./approvals.ts";
import { isManual, sendHandoff, findManualPost, issueClosed, closeIssue, MANUAL_WAIT_H } from "./handoff.ts";
import { writeQueueReport } from "./queue-status.ts";
import { publishToInstagram, publishStory } from "./publish.ts";
import { saveArticle } from "./articles.ts";
import { loadState, saveState } from "./state.ts";

const dry = process.argv.includes("--dry");
const now = Date.now();
const q = loadQueue();

let changed = false;
for (const i of q) {
  // Guides keep 36 h: a guide missed at night goes out the next morning instead of being lost.
  if (i.status === "ready" && now - Date.parse(i.at) > (i.kind === "agenda" ? 36 : PUBLISH_WINDOW_H) * 36e5) {
    i.status = "expired";
    changed = true;
    console.log(`expired: ${i.key} (${i.headline})`);
  }
}

// Last line of defence: we're a news channel, old news never goes out.
for (const i of q.filter((i) => i.status === "ready" && Date.parse(i.at) <= now && tooOld(i, now))) {
  i.status = "skipped";
  i.error = "news too old to publish";
  changed = true;
  console.log(`skipped (too old): ${i.key} (${i.headline})`);
}
// A late guide waits for the morning (09:00 UTC) rather than going out in the middle of the night.
const heldForMorning = (i: (typeof q)[number]) => i.kind === "agenda" && now - Date.parse(i.at) > PUBLISH_WINDOW_H * 36e5 && new Date(now).getUTCHours() < 9;
for (const i of q.filter((i) => i.status === "ready" && Date.parse(i.at) <= now && awaitingApproval(i, now))) console.log(`waiting for approval on Telegram: ${i.key}`);
const due = q.filter((i) => i.status === "ready" && Date.parse(i.at) <= now && !heldForMorning(i) && !awaitingApproval(i, now)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0];
async function publishStories(i: QueueItem) {
  for (const v of i.storyVideos?.length ? i.storyVideos : i.storyUrl ? [i.storyUrl] : []) {
    try {
      console.log(`  ✓ story: ${await publishStory(v)}`);
    } catch (e) {
      console.warn(`  story failed (the post is out): ${(e as Error).message.slice(0, 160)}`);
    }
  }
}

function markPosted(i: QueueItem, id: string | undefined) {
  i.status = "posted";
  if (id) i.igMediaId = id;
  i.publishedAt = new Date().toISOString();
  const at = i.publishedAt;
  saveArticle({ ...i.article, date: at, ...(id ? { igMediaId: id } : {}) });
  const state = loadState();
  state.posted.push({ ...i.posted, at, ...(id ? { igMediaId: id } : {}) });
  saveState(state);
}

async function publishNow(i: QueueItem) {
  let id: string;
  try {
    id = await publishToInstagram(i.urls, i.caption, i.handles, i.videoUrl, i.slideHandles);
  } catch (e) {
    if (!i.videoUrl) throw e;
    console.warn(`  video carousel failed (${(e as Error).message.slice(0, 160)}), posting images only`);
    id = await publishToInstagram(i.urls, i.caption, i.handles, undefined, i.slideHandles);
  }
  markPosted(i, id);
  console.log(`  ✓ published on Instagram: ${id}`);
  await publishStories(i);
}

// Hand-offs waiting on the phone: done when the post shows up on Instagram (or the issue is closed);
// after MANUAL_WAIT_H we publish it ourselves, without music.
let handled: QueueItem | undefined;
for (const i of q.filter((i) => i.status === "manual")) {
  if (dry || !CONFIG.igToken) break;
  const found = await findManualPost(i, i.manualSentAt ?? i.at).catch(() => undefined);
  if (found || issueClosed(i.issue)) {
    console.log(`hand-off done: ${i.key} — posted from the phone${found ? ` (${found})` : ""}`);
    markPosted(i, found);
    i.manualBy = "phone";
    await publishStories(i);
    closeIssue(i.issue, "✅ Visto no Instagram. Stories publicados.");
    changed = true;
    handled = i;
  } else if (now - Date.parse(i.manualSentAt ?? i.at) > MANUAL_WAIT_H * 36e5) {
    console.log(`hand-off timed out: ${i.key}, publishing without music`);
    try {
      await publishNow(i);
      i.manualBy = "auto";
      closeIssue(i.issue, "⏱️ Não apareceu no Instagram a tempo: publiquei eu, sem música.");
    } catch (e) {
      i.error = (e as Error).message.slice(0, 300);
      console.error(`  ✗ publish failed: ${i.error}`);
    }
    changed = true;
    handled = i;
  } else console.log(`hand-off waiting: ${i.key} (sent ${i.manualSentAt?.slice(11, 16)} UTC)`);
}

if (!due) {
  console.log("publish: nothing due");
} else {
  console.log(`publish: ${due.key} — ${due.headline} (planned ${due.at.slice(11, 16)} UTC)`);
  if (dry) {
    console.log("  dry run: not publishing");
  } else if (isManual(due)) {
    const r = await sendHandoff(due);
    console.log(`  📲 sent to the phone: issue #${r.issue ?? "-"}, telegram ${r.telegram ? "yes" : "no"}; music: ${r.music.map((m) => `${m.artist} – ${m.title}`).join(" | ") || "-"}`);
    if (r.issue || r.telegram) {
      due.status = "manual";
      due.manualSentAt = new Date().toISOString();
      due.issue = r.issue;
    } else {
      console.warn("  hand-off couldn't be delivered, publishing now without music");
      try {
        await publishNow(due);
      } catch (e) {
        due.error = (e as Error).message.slice(0, 300);
      }
    }
    changed = true;
  } else {
    try {
      await publishNow(due);
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
      sh("git", ["commit", "-q", "-m", `publish: ${due?.key ?? handled?.key ?? "queue"}`]);
      for (let i = 0; i < 3; i++) if ((sh("git", ["pull", "-q", "--rebase", "-X", "theirs"]) || (sh("git", ["rebase", "--abort"]), false)) && sh("git", ["push", "-q"])) break;
      if (due?.status === "posted" || handled?.status === "posted") sh("gh", ["workflow", "run", "site.yml"]);
    }
  }
}
if (due && !["posted", "manual"].includes(due.status) && !dry && CONFIG.igToken) process.exitCode = 1;
process.exit();

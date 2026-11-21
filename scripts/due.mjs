// Slot dispatcher. GitHub delays scheduled runs by minutes to hours, so instead of one cron per
// slot the workflow wakes up every 20 minutes and asks this script whether a slot is due:
// its target time has passed today (UTC), it is still within its window, and it has not run today.
// Prints `slot=<name>` (or `slot=`) for $GITHUB_OUTPUT and records the slot in state/slots.json.
// Plain JS with no dependencies so it runs before `npm ci`.
import fs from "node:fs";

const SLOTS = [
  { name: "pt-news", at: "08:50" },
  { name: "pt-artists", at: "13:30" },
  { name: "pt-scene", at: "19:45" },
];
const WINDOW_MIN = 150; // after this long past the target, the slot is skipped for the day
const FILE = "state/slots.json";

const now = new Date(process.env.NOW || Date.now());
const today = now.toISOString().slice(0, 10);
const pauseUntil = process.env.PAUSE_UNTIL || "";
const done = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : {};

let slot = "";
if (pauseUntil && today < pauseUntil) {
  console.error(`paused until ${pauseUntil}`);
} else {
  for (const s of SLOTS) {
    const [h, m] = s.at.split(":").map(Number);
    const target = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m);
    const late = (now.getTime() - target) / 60000;
    if (late >= 0 && late <= WINDOW_MIN && done[s.name] !== today) {
      slot = s.name;
      console.error(`${s.name} due (${Math.round(late)} min after ${s.at} UTC)`);
      break;
    }
  }
  if (!slot) console.error("no slot due");
}
if (slot && !process.env.DRY) {
  done[slot] = today;
  fs.writeFileSync(FILE, JSON.stringify(done, null, 2) + "\n");
}
console.log(`slot=${slot}`);

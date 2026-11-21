// Scheduler brain, run on every trigger: prints for $GITHUB_OUTPUT whether a queued post is due
// (publish=1) and which slot to prepare next (prepare="YYYY-MM-DD slot"), if any.
import { plan, loadQueue } from "./queue.ts";

const now = process.env.NOW ? new Date(process.env.NOW) : new Date();
const p = plan(now, process.env.PAUSE_UNTIL ?? "");
// Don't burn Claude runs on a slot that already failed twice today.
let prepare = p.prepare;
if (prepare) {
  const key = prepare.replace(" ", "-");
  if (loadQueue().filter((i) => i.key === key && i.status === "failed").length >= 2) prepare = undefined;
}
console.error(`plan @ ${now.toISOString().slice(0, 16)}: publish ${p.publish ?? "-"}, prepare ${prepare ?? "-"}`);
console.log(`publish=${p.publish ? 1 : ""}`);
console.log(`prepare_day=${prepare?.split(" ")[0] ?? ""}`);
console.log(`prepare_slot=${prepare?.split(" ")[1] ?? ""}`);

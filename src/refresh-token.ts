// Long-lived Instagram tokens last 60 days. Run this at least once a month.
// With --gh, writes the new token straight into the GitHub repo secret (needs `gh` logged in).
import { execFileSync } from "node:child_process";
import { refreshIgToken } from "./publish.ts";

const { token, expiresInDays } = await refreshIgToken();
if (expiresInDays === Infinity) {
  console.log("This token never expires (Facebook system-user token): nothing to refresh.");
  process.exit(0);
}
if (process.argv.includes("--gh")) {
  execFileSync("gh", ["secret", "set", "IG_ACCESS_TOKEN"], { input: token });
  console.log(`IG_ACCESS_TOKEN refreshed in GitHub secrets (valid ${expiresInDays} days).`);
} else {
  console.log(`New token (valid ${expiresInDays} days). Put it in .env as IG_ACCESS_TOKEN:\n${token}`);
}

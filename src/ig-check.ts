// Checks the Instagram token and prints the account id to use as IG_USER_ID.
import { CONFIG } from "./config.ts";

const res = await fetch(
  `https://graph.instagram.com/${CONFIG.igApiVersion}/me?fields=user_id,username,account_type,media_count&access_token=${encodeURIComponent(CONFIG.igToken)}`,
);
const json = (await res.json()) as Record<string, unknown>;
if (!res.ok) {
  console.error("Token not accepted:", JSON.stringify(json));
  process.exit(1);
}
console.log(json);
console.log(`\nIG_USER_ID=${json.user_id}`);

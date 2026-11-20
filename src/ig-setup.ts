// One-step Instagram setup: paste the token (hidden), it is checked, saved to .env
// and to the GitHub secrets IG_ACCESS_TOKEN / IG_USER_ID. The token is never printed.
// Run: npm run ig-setup
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, CONFIG } from "./config.ts";

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === "\r" || c === "\n") {
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          return resolve(value.trim());
        }
        if (c === "\u0003") process.exit(130);
        if (c === "\u007f") value = value.slice(0, -1);
        else value += c;
      }
    };
    stdin.on("data", onData);
  });
}

function setEnv(key: string, value: string) {
  const file = path.join(ROOT, ".env");
  let text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const line = `${key}=${value}`;
  text = new RegExp(`^${key}=.*$`, "m").test(text) ? text.replace(new RegExp(`^${key}=.*$`, "m"), line) : `${text.replace(/\n?$/, "\n")}${line}\n`;
  fs.writeFileSync(file, text, { mode: 0o600 });
}

const raw = await askHidden("Cole o token do Instagram e aperte Enter (não aparece na tela): ");
// Terminals wrap pasted text in bracketed-paste markers (ESC[200~ … ESC[201~); keep only token characters.
const token = raw.replace(/\x1b\[20[01]~/g, "").replace(/[^A-Za-z0-9_\-.|]/g, "");
if (token.length < 50) {
  console.error(`Isso não parece um token (${token.length} caracteres). Nada foi salvo.`);
  process.exit(1);
}
const kind = token.startsWith("IGA") ? "Instagram (IGA…)" : token.startsWith("EAA") ? "Facebook (EAA…)" : `desconhecido (${token.slice(0, 3)}…)`;
console.log(`Token recebido: ${token.length} caracteres, tipo ${kind}`);

const KNOWN_IG_ID = process.argv[2] || "17841452523490693"; // @hardmag.news
const v = CONFIG.igApiVersion;
async function get(url: string) {
  const r = await fetch(url);
  return { ok: r.ok, json: (await r.json()) as Record<string, any> };
}

let host = "", userId = "", username = "";
const ig = await get(`https://graph.instagram.com/${v}/me?fields=user_id,username&access_token=${encodeURIComponent(token)}`);
if (ig.ok) {
  host = "graph.instagram.com"; userId = String(ig.json.user_id); username = ig.json.username;
} else {
  const fb = await get(`https://graph.facebook.com/${v}/${KNOWN_IG_ID}?fields=id,username&access_token=${encodeURIComponent(token)}`);
  if (fb.ok) {
    host = "graph.facebook.com"; userId = String(fb.json.id); username = fb.json.username;
  } else {
    console.error("O token foi recusado nos dois endereços da API.");
    console.error(`  graph.instagram.com: ${ig.json.error?.message ?? "erro"}`);
    console.error(`  graph.facebook.com:  ${fb.json.error?.message ?? "erro"}`);
    process.exit(1);
  }
}
console.log(`✓ Token aceito: @${username}, IG_USER_ID=${userId} (via ${host})`);

setEnv("IG_ACCESS_TOKEN", token);
setEnv("IG_USER_ID", userId);
setEnv("IG_API_HOST", host);
console.log("✓ Salvo no .env");

for (const [name, value] of [["IG_ACCESS_TOKEN", token], ["IG_USER_ID", userId], ["IG_API_HOST", host]]) {
  const r = spawnSync("gh", ["secret", "set", name], { cwd: ROOT, input: value, encoding: "utf8" });
  console.log(r.status === 0 ? `✓ Secret ${name} salvo no GitHub` : `✗ Não consegui salvar ${name} no GitHub: ${r.stderr.trim()}`);
}

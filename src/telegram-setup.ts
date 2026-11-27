// npm run telegram-setup: connects the Telegram bot that receives the phone hand-offs (src/handoff.ts).
// You paste the bot token from @BotFather (hidden), send any message to the bot, and this finds your
// chat, sends a test message and saves TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID as GitHub secrets and in .env.
// The token is never printed.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT } from "./config.ts";

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

const raw = await askHidden("Cole o token do bot (do @BotFather) e aperte Enter (não aparece no ecrã): ");
const token = raw.replace(/\x1b\[20[01]~/g, "").replace(/[^A-Za-z0-9:_\-]/g, "");
const api = async (method: string, payload: Record<string, unknown> = {}) => {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  return (await r.json()) as { ok: boolean; result?: any; description?: string };
};

const me = await api("getMe");
if (!me.ok) {
  console.error(`O Telegram não aceitou esse token (${me.description}). Nada foi salvo.`);
  process.exit(1);
}
console.log(`✓ Bot @${me.result.username}`);
console.log(`Agora abre o Telegram, procura @${me.result.username}, carrega em Iniciar e manda "oi". Fico à espera até 3 minutos…`);

let chat: { id: number; name: string } | undefined;
for (let t = 0; t < 36 && !chat; t++) {
  const u = await api("getUpdates", { timeout: 5 });
  const m = (u.result ?? []).map((x: any) => x.message).filter(Boolean).pop();
  if (m) chat = { id: m.chat.id, name: m.chat.first_name ?? m.chat.title ?? "" };
}
if (!chat) {
  console.error("Não chegou nenhuma mensagem ao bot. Corre de novo e manda a mensagem enquanto espero.");
  process.exit(1);
}
await api("sendMessage", { chat_id: chat.id, text: "✅ HARDMAG ligado. Os posts para publicar com música vão chegar aqui." });
console.log(`✓ Conversa encontrada (${chat.name}); mandei uma mensagem de teste.`);

setEnv("TELEGRAM_BOT_TOKEN", token);
setEnv("TELEGRAM_CHAT_ID", String(chat.id));
console.log("✓ Salvo no .env");
for (const [name, value] of [["TELEGRAM_BOT_TOKEN", token], ["TELEGRAM_CHAT_ID", String(chat.id)]]) {
  const r = spawnSync("gh", ["secret", "set", name], { cwd: ROOT, input: value, encoding: "utf8" });
  console.log(r.status === 0 ? `✓ Secret ${name} salvo no GitHub` : `✗ Não consegui salvar ${name} no GitHub: ${r.stderr.trim()}`);
}

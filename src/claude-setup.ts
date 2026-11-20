// Saves the Claude Code OAuth token (from `claude setup-token`) as the GitHub secret
// CLAUDE_CODE_OAUTH_TOKEN, after checking it works. The token is never printed.
// Run: npm run claude-setup
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
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
          // Newlines inside a bracketed paste come from wrapped lines: keep reading.
          if (value.includes("\x1b[200~") && !value.includes("\x1b[201~")) continue;
          if (!value.trim()) continue;
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          return resolve(value);
        }
        if (c === "\u0003") process.exit(130);
        if (c === "\u007f") value = value.slice(0, -1);
        else value += c;
      }
    };
    stdin.on("data", onData);
  });
}

const raw = await askHidden("Cole o token do `claude setup-token` e aperte Enter (não aparece na tela): ");
const token = raw.replace(/\x1b\[20[01]~/g, "").replace(/[^A-Za-z0-9_\-]/g, "");
console.log(`Token recebido: ${token.length} caracteres, começa com ${token.slice(0, 13)}…`);
if (!token.startsWith("sk-ant-oat")) {
  console.error("Isso não parece um token do Claude (deveria começar com sk-ant-oat…). Nada foi salvo.");
  process.exit(1);
}

console.log("Testando o token com uma chamada curta ao Claude…");
const env: NodeJS.ProcessEnv = { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: token };
delete env.ANTHROPIC_API_KEY;
const test = spawnSync(
  process.env.CLAUDE_BIN || "claude",
  ["-p", "Reply with just: ok", "--output-format", "json", "--tools", "", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
   "--setting-sources", "", "--disable-slash-commands", "--no-session-persistence", "--model", "claude-haiku-5-5"],
  { cwd: tmpdir(), env, encoding: "utf8", timeout: 120_000 },
);
let ok = false, why = test.stderr?.slice(0, 200) ?? "";
try {
  const j = JSON.parse(test.stdout);
  ok = test.status === 0 && !j.is_error;
  why = j.result ?? why;
} catch {}
if (!ok) {
  console.error(`✗ O Claude recusou o token: ${why}`);
  console.error("Rode `claude setup-token` de novo e copie o token inteiro (ele pode ocupar mais de uma linha).");
  process.exit(1);
}
console.log("✓ Token funciona");

const r = spawnSync("gh", ["secret", "set", "CLAUDE_CODE_OAUTH_TOKEN"], { cwd: ROOT, input: token, encoding: "utf8" });
console.log(r.status === 0 ? "✓ Secret CLAUDE_CODE_OAUTH_TOKEN salvo no GitHub" : `✗ Não consegui salvar no GitHub: ${r.stderr.trim()}`);

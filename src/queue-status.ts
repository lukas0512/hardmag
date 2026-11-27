// reports/fila.md: the editorial queue in Portuguese for the team — what goes out next, when,
// with the slides, the caption and the checks it passed. Updated after every prepare and publish.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./config.ts";
import { loadQueue, upcoming, type QueueItem } from "./queue.ts";

const FILE = path.join(ROOT, "reports", "fila.md");
const lisbon = (iso: string) =>
  new Date(iso).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const STATUS: Record<QueueItem["status"], string> = { ready: "✅ pronto", manual: "📲 no telemóvel", posted: "📤 publicado", failed: "❌ falhou", expired: "⌛ expirou", skipped: "⏭️ pulado" };
const SLOT: Record<string, string> = { "pt-news": "Notícias PT", "pt-midday": "Almoço", "pt-artists": "Artistas", "pt-scene": "Cena", "pt-night": "Noite", "pt-today": "Hoje (stories)" };

export function writeQueueReport(): string {
  const q = loadQueue().sort((a, b) => a.at.localeCompare(b.at));
  const ready = q.filter((i) => i.status === "ready");
  const empty = upcoming(new Date(), 1).filter((u) => !q.some((i) => i.key === `${u.day}-${u.slot}` && i.status !== "failed"));
  const block = (i: QueueItem) => `### ${lisbon(i.at)} · ${SLOT[i.slot] ?? i.slot} · ${STATUS[i.status]}
**${i.headline}** (${i.kind})${i.error ? `\n\n> Erro: ${i.error}` : ""}

${i.urls.map((u, n) => `<img src="${u}" width="${n === 0 ? 260 : 130}">`).join(" ")}

<details><summary>Legenda</summary>

\`\`\`
${i.caption}
\`\`\`
</details>

Verificado: ${i.checks.join(" · ") || "–"}${i.igMediaId ? ` · [ver no Instagram](https://www.instagram.com/hardmag.news/)` : ""}
`;
  const md = `# HARDMAG: fila de posts

Atualizado ${lisbon(new Date().toISOString())} (hora de Lisboa). Cada post é escrito, revisado pelo editor-chefe, renderizado e testado na API do Instagram até 2 dias antes do horário. No horário, só é publicado.

**Prontos:** ${ready.length} · **Horários ainda sem post (próximas 24 h):** ${empty.map((u) => `${lisbon(u.at.toISOString())} ${SLOT[u.slot]}`).join(", ") || "nenhum"}

## Próximos
${ready.map(block).join("\n") || "_Nada na fila agora._"}

## Recentes
${q.filter((i) => i.status !== "ready").slice(-8).reverse().map(block).join("\n") || "_Ainda nada._"}
`;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, md);
  return md;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeQueueReport();
  for (const i of loadQueue().sort((a, b) => a.at.localeCompare(b.at)).slice(-10)) console.log(`${i.at.slice(0, 16)} ${i.slot.padEnd(10)} ${i.status.padEnd(8)} ${i.headline}${i.error ? `  [${i.error.slice(0, 80)}]` : ""}`);
  console.log(`→ ${path.relative(process.cwd(), FILE)}`);
}

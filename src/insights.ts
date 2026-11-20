// Studies how our posts perform and feeds the lessons back to the editor.
// - collectInsights(): likes/comments for every post (plus reach, saves and shares when the
//   token has instagram_manage_insights), stored in state/performance.json.
// - learnings(): a short brief for the editor (what themes, angles and hours work).
// - writeReport(): reports/desempenho.md, a readable report in Portuguese for the team.
import fs from "node:fs";
import path from "node:path";
import { CONFIG, ROOT } from "./config.ts";
import { loadArticles, type Article } from "./articles.ts";

type Perf = { likes: number; comments: number; reach?: number; saves?: number; shares?: number; updated: string };
const FILE = path.join(ROOT, "state", "performance.json");
const REPORT = path.join(ROOT, "reports", "desempenho.md");

const load = (): Record<string, Perf> => (fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : {});
const base = () => `https://${CONFIG.igApiHost}/${CONFIG.igApiVersion}`;
const tok = () => `access_token=${encodeURIComponent(CONFIG.igToken)}`;

export async function collectInsights(): Promise<number> {
  if (!CONFIG.igToken || !CONFIG.igUserId) return 0;
  const perf = load();
  const posts = loadArticles().filter((a) => a.igMediaId && Date.now() - Date.parse(a.date) < 30 * 864e5);
  let n = 0;
  for (const a of posts) {
    try {
      const m = (await (await fetch(`${base()}/${a.igMediaId}?fields=like_count,comments_count&${tok()}`)).json()) as Record<string, any>;
      if (m.error) continue;
      const p: Perf = { likes: m.like_count ?? 0, comments: m.comments_count ?? 0, updated: new Date().toISOString() };
      const ins = (await (await fetch(`${base()}/${a.igMediaId}/insights?metric=reach,saved,shares&${tok()}`)).json()) as Record<string, any>;
      for (const d of ins.data ?? []) {
        const v = d.values?.[0]?.value ?? d.total_value?.value;
        if (d.name === "reach") p.reach = v;
        if (d.name === "saved") p.saves = v;
        if (d.name === "shares") p.shares = v;
      }
      perf[a.igMediaId!] = p;
      n++;
    } catch {}
  }
  fs.writeFileSync(FILE, JSON.stringify(perf, null, 2) + "\n");
  return n;
}

// Engagement score: comments and shares/saves weigh more than likes (they drive reach).
const score = (p: Perf) => p.likes + 3 * p.comments + 4 * (p.saves ?? 0) + 5 * (p.shares ?? 0);

type Row = { a: Article; p: Perf; s: number; hour: number };
function rows(): Row[] {
  const perf = load();
  return loadArticles()
    .filter((a) => a.igMediaId && perf[a.igMediaId] && Date.now() - Date.parse(a.date) > 12 * 36e5)
    .map((a) => ({ a, p: perf[a.igMediaId!], s: score(perf[a.igMediaId!]), hour: new Date(a.date).getUTCHours() }));
}

function groupAvg(rs: Row[], key: (r: Row) => string) {
  const g = new Map<string, number[]>();
  for (const r of rs) g.set(key(r), [...(g.get(key(r)) ?? []), r.s]);
  return [...g.entries()].map(([k, v]) => ({ k, avg: v.reduce((x, y) => x + y, 0) / v.length, n: v.length })).sort((x, y) => y.avg - x.avg);
}

const beatName = (b?: string) => (b === "pt" ? "Lisbon/Portugal" : b === "tech" ? "AI/tech" : "club/hard techno");

export function learnings(): string {
  const rs = rows();
  if (rs.length < 6) return "";
  const byBeat = groupAvg(rs, (r) => beatName(r.a.beat)).map((g) => `${g.k} ${g.avg.toFixed(1)} (${g.n})`).join(", ");
  const byKicker = groupAvg(rs, (r) => r.a.kicker).slice(0, 4).map((g) => `${g.k} ${g.avg.toFixed(1)}`).join(", ");
  const sorted = [...rs].sort((x, y) => y.s - x.s);
  const top = sorted.slice(0, 3).map((r) => `"${r.a.headline}" (${r.p.likes} likes, ${r.p.comments} comments)`).join("; ");
  const low = sorted.slice(-2).map((r) => `"${r.a.headline}"`).join("; ");
  return `Average engagement score by theme: ${byBeat}. Best kickers: ${byKicker}. Best posts: ${top}. Weakest: ${low}. Lean towards what works, but keep every theme in the mix.`;
}

export function writeReport() {
  const rs = rows();
  const sorted = [...rs].sort((x, y) => y.s - x.s);
  const fmt = (r: Row) =>
    `| ${r.a.headline.replace(/\|/g, "/")} | ${beatName(r.a.beat)} | ${r.p.likes} | ${r.p.comments} | ${r.p.saves ?? "–"} | ${r.p.shares ?? "–"} | ${r.p.reach ?? "–"} |`;
  const table = (list: Row[]) => `| Post | Tema | Curtidas | Coment. | Salvos | Compart. | Alcance |\n|---|---|---|---|---|---|---|\n${list.map(fmt).join("\n")}`;
  const md = `# HARDMAG: desempenho dos posts

Atualizado em ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · ${rs.length} posts analisados (com mais de 12h no ar).
Pontuação = curtidas + 3×comentários + 4×salvos + 5×compartilhamentos.${rs.some((r) => r.p.reach !== undefined) ? "" : "\n\n> Alcance, salvos e compartilhamentos aparecem quando o token tiver a permissão `instagram_manage_insights`."}

## Por tema
${groupAvg(rs, (r) => beatName(r.a.beat)).map((g) => `- **${g.k}**: média ${g.avg.toFixed(1)} (${g.n} posts)`).join("\n") || "- ainda sem dados"}

## Por editoria
${groupAvg(rs, (r) => r.a.kicker).map((g) => `- **${g.k}**: média ${g.avg.toFixed(1)} (${g.n})`).join("\n") || "- ainda sem dados"}

## Por horário (UTC)
${groupAvg(rs, (r) => `${String(r.hour).padStart(2, "0")}h`).map((g) => `- **${g.k}**: média ${g.avg.toFixed(1)} (${g.n})`).join("\n") || "- ainda sem dados"}

## Melhores posts
${table(sorted.slice(0, 5))}

## Piores posts
${table(sorted.slice(-5).reverse())}

## O que o editor está usando agora
${learnings() || "Ainda poucos dados (precisa de 6+ posts com 12h no ar)."}
`;
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, md);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`insights: ${await collectInsights()} post(s) updated`);
  writeReport();
  console.log(`report → ${path.relative(process.cwd(), REPORT)}`);
}

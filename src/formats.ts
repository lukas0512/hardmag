// Special formats for the Portugal audience:
// - Weekend agenda (Fridays): the best electronic parties in Lisbon and Porto, from Shotgun and Lux Frágil.
// - Community poll (Tuesdays and Sundays): "who's the reference…", "best club…", debates; vote in the comments.
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { chromium } from "playwright";
import { ROOT } from "./config.ts";
import { askClaudeJson } from "./write.ts";
import { UA } from "./fetch.ts";
import type { AgendaItem } from "./templates.ts";

/* ---------- Weekend agenda ---------- */

const PAGES = [
  { city: "Lisbon", url: "https://shotgun.live/en/cities/lisbon/techno" },
  { city: "Lisbon", url: "https://shotgun.live/en/cities/lisbon/house" },
  { city: "Porto", url: "https://shotgun.live/en/cities/porto/techno" },
  { city: "Porto", url: "https://shotgun.live/en/cities/porto/house" },
];

export async function scrapeListings(): Promise<{ shotgun: string; lux: string }> {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ userAgent: UA, locale: "en-GB" });
  const lines = new Set<string>();
  for (const pg of PAGES) {
    const p = await ctx.newPage();
    try {
      await p.goto(pg.url, { waitUntil: "domcontentloaded", timeout: 40000 });
      await p.waitForTimeout(3000);
      for (let i = 0; i < 5; i++) {
        await p.mouse.wheel(0, 4000);
        await p.waitForTimeout(700);
      }
      const ev = await p.evaluate(() =>
        [...document.querySelectorAll('a[href*="/events/"]')].map((a) => `${(a as HTMLElement).innerText.replace(/\s+/g, " ").trim()} | ${(a as HTMLAnchorElement).href}`),
      );
      for (const e of ev) if (e.length > 20) lines.add(`[${pg.city}] ${e}`);
    } catch (e) {
      console.warn(`  [agenda] ${pg.url}: ${(e as Error).message.slice(0, 80)}`);
    }
    await p.close();
  }
  let lux = "";
  try {
    const p = await ctx.newPage();
    await p.goto("https://www.luxfragil.com/", { waitUntil: "networkidle", timeout: 40000 });
    await p.waitForTimeout(2000);
    lux = (await p.evaluate(() => document.body.innerText)).replace(/\n+/g, " / ").slice(0, 2500);
  } catch {}
  await browser.close();
  return { shotgun: [...lines].join("\n").slice(0, 14000), lux };
}

const Ev = z.object({
  day: z.string().describe("e.g. FRI 21"),
  time: z.string().describe("e.g. 23:45"),
  name: z.string().describe("party name or headliners, short (max ~45 chars)"),
  venue: z.string(),
  price: z.string().optional().describe("e.g. €10, Free"),
  tags: z.string().optional().describe("1-2 genres, e.g. HARD GROOVE, HOUSE"),
});
const AgendaSchema = z.object({
  lisbon: z.array(Ev).max(8),
  porto: z.array(Ev).max(5),
  caption: z.string().describe("Instagram caption: a hook line, then 1-2 sentences on the weekend's highlights. No hashtags."),
  question: z.string().describe("an open question for the comments, e.g. 'Where are you ending up on Saturday?'"),
  people: z.array(z.object({ name: z.string() })).describe("every venue in the picks (e.g. KØMPLEX, Lux Frágil, Ministerium, Gare Porto) plus artists and promoters named, so we can tag them"),
  hashtags: z.array(z.string()),
});
export type Agenda = z.infer<typeof AgendaSchema>;

export function weekendLabel(d = new Date()): { from: Date; to: Date; label: string } {
  const day = d.getUTCDay(); // 5 = Friday
  const from = new Date(d);
  from.setUTCDate(d.getUTCDate() + ((5 - day + 7) % 7));
  const to = new Date(from);
  to.setUTCDate(from.getUTCDate() + 2);
  const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const label = from.getUTCMonth() === to.getUTCMonth() ? `${from.getUTCDate()}–${to.getUTCDate()} ${m[to.getUTCMonth()]}` : `${from.getUTCDate()} ${m[from.getUTCMonth()]} – ${to.getUTCDate()} ${m[to.getUTCMonth()]}`;
  return { from, to, label };
}

export async function writeAgenda(): Promise<(Agenda & { label: string }) | null> {
  const { from, to, label } = weekendLabel();
  const { shotgun, lux } = await scrapeListings();
  console.log(`agenda: ${shotgun.split("\n").filter(Boolean).length} Shotgun listings, Lux ${lux ? "ok" : "missing"}`);
  if (!shotgun && !lux) return null;
  const out = await askClaudeJson(
    AgendaSchema,
    `Build the HARDMAG weekend guide for Lisbon and Porto, ${label} (${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}, Friday to Sunday night).
We are HARDMAG: hard techno, hard groove and bounce come first, then techno and house. KØMPLEX (Lisbon) is the home of hard techno in the city: always include its nights this weekend and list them first on their day.
Pick the best electronic parties (hard techno, techno, hard groove, bounce/hard house, house, minimal) for a club-literate audience: credible lineups, good venues, anniversaries, special nights. 5-8 for Lisbon, up to 5 for Porto. Skip anything outside those dates, duplicates, kickboxing/wellness gimmicks, pure psytrance/EDM.
Use only what is in the listings below (names, venues, times, prices). Times in 24h. Order by day, then time.

Shotgun listings ([city] text | link):
${shotgun}

Lux Frágil programme (Lisbon):
${lux}`,
  );
  return out ? { ...out, label } : null;
}

export const agendaSlidesData = (a: Agenda): { lisbon: AgendaItem[][]; porto: AgendaItem[] } => ({
  lisbon: a.lisbon.length > 5 ? [a.lisbon.slice(0, Math.ceil(a.lisbon.length / 2)), a.lisbon.slice(Math.ceil(a.lisbon.length / 2))] : [a.lisbon],
  porto: a.porto,
});

/* ---------- Community polls ---------- */

const POLLS = path.join(ROOT, "state", "polls.json");
const PollSchema = z.object({
  topic: z.string().describe("short id of the angle, e.g. 'pt-reference-dj'"),
  question: z.string().describe("max ~8 words, punchy, e.g. 'Who is the reference of Portuguese techno?'"),
  highlight: z.array(z.string()).describe("1-2 words of the question to set in thin italic"),
  options: z.array(z.string()).min(3).max(5).describe("short options (names or positions), without letters or numbers in front"),
  caption: z.string().describe("caption: why we're asking and a line of context, inviting people to say why in the comments. Do not list the options (we add them). No hashtags."),
  people: z.array(z.object({ name: z.string() })).describe("artists/clubs among the options, so we can tag them"),
  hashtags: z.array(z.string()),
});
export type Poll = z.infer<typeof PollSchema>;

export async function writePoll(verifiedNames: string[]): Promise<Poll | null> {
  const used: string[] = fs.existsSync(POLLS) ? JSON.parse(fs.readFileSync(POLLS, "utf8")) : [];
  const poll = await askClaudeJson(
    PollSchema,
    `Create a HARDMAG community poll for our audience in Portugal (techno, house, hard groove, club culture). It must spark comments and friendly debate, and make Portuguese ravers feel represented.
Angles to rotate (pick one we haven't used recently): the reference of Portuguese electronic music; most underrated Portuguese producer; best club in Lisbon; best club in Porto; the night you'd relive; best Portuguese festival for electronic music; hard techno vs groovy techno; vinyl vs USB; phones on the dancefloor; ideal closing time; the best b2b pairing from Portugal; this-or-that between two scenes.
Recently used topics (avoid): ${used.slice(-12).join(", ") || "none"}.
When the poll is about clubs in Lisbon, KØMPLEX must be one of the options (it's the home of hard techno, and we are HARDMAG). Lean the angles towards hard techno, hard groove and bounce.
Rules: when options are people, clubs or festivals, use only names from this verified list (exact spelling): ${verifiedNames.join(", ")}. 3-5 options. Keep it respectful: celebrate, don't mock anyone.`,
  );
  if (poll) poll.options = poll.options.map((o) => o.replace(/^\s*[A-Ea-e1-5][).:\-]\s*/, "").trim());
  if (poll) fs.writeFileSync(POLLS, JSON.stringify([...used, poll.topic].slice(-50), null, 2) + "\n");
  return poll;
}

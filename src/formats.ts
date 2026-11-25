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
  people: z.array(z.object({ name: z.string() })).describe("every venue in the picks (e.g. Lux Frágil, KØMPLEX, Ministerium, Gare Porto) plus artists and promoters named, so we can tag them"),
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

// mode "tonight": only tonight's parties (posted in the evening on Fridays and Saturdays).
// mode "week": Monday to Thursday parties (posted Monday midday).
export async function writeAgenda(mode: "weekend" | "tonight" | "week" = "weekend"): Promise<(Agenda & { label: string }) | null> {
  const tonight = mode === "tonight" || mode === "week";
  const w = weekendLabel();
  const today = new Date();
  const dn = (d: Date) => `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()]} ${d.getUTCDate()}`;
  const thu = new Date(today.getTime() + ((4 - today.getUTCDay() + 7) % 7) * 864e5);
  const { from, to, label } = mode === "tonight" ? { from: today, to: today, label: dn(today) } : mode === "week" ? { from: today, to: thu, label: `${dn(today)} – ${dn(thu)}` } : w;
  const when = mode === "week" ? `this week, ${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)} (Monday to Thursday nights)` : `tonight, ${from.toISOString().slice(0, 10)}`;
  const { shotgun, lux } = await scrapeListings();
  console.log(`agenda: ${shotgun.split("\n").filter(Boolean).length} Shotgun listings, Lux ${lux ? "ok" : "missing"}`);
  if (!shotgun && !lux) return null;
  const out = await askClaudeJson(
    AgendaSchema,
    tonight
      ? `Build HARDMAG's "${mode === "week" ? "This week" : "Tonight"} in Lisbon & Porto" guide: only parties ${when} (evening to the early hours). 3-6 for Lisbon, up to 4 for Porto. Write the caption like a friend telling you where to go ${mode === "week" ? "this week" : "tonight"}: a hook, the one or two nights you'd pick and why, with personality. The rest of these rules still apply:
We are HARDMAG: our core is fast groove and bouncy (bounce, hard house, hard groove), next to hard techno, with techno and house around them. Be fair: pick on merit, keep the mix varied (different venues and sounds). Use only what is in the listings below (names, venues, times, prices). Times in 24h. Order by day, then time.

Shotgun listings ([city] text | link):
${shotgun}

Lux Frágil programme (Lisbon):
${lux}`
      : `Build the HARDMAG weekend guide for Lisbon and Porto, ${label} (${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}, Friday to Sunday night).
We are HARDMAG: our core is fast groove and bouncy (bounce, hard house, hard groove), next to hard techno, with techno and house around them. Be a fair, independent curator: pick on merit (lineup, occasion, sound, value), no venue or promoter gets favours, and keep the mix varied (different venues and sounds, at most 2 nights from the same venue per city). The caption highlights the weekend's strongest nights, whoever runs them; don't build it around one club.
Pick the best electronic parties (fast groove, bouncy/hard house, hard groove, hard techno, techno, house, minimal; fast groove and bouncy nights first) for a club-literate audience: credible lineups, good venues, anniversaries, special nights. 5-8 for Lisbon, up to 5 for Porto. Skip anything outside those dates, duplicates, kickboxing/wellness gimmicks, pure psytrance/EDM.
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
  question: z.string().describe("max ~8 words, punchy, e.g. 'Phones on the dancefloor: yes or no?'"),
  highlight: z.array(z.string()).describe("1-2 words of the question to set in thin italic"),
  options: z.array(z.string()).max(4).describe("short options (names or positions), without letters or numbers in front; EMPTY for a nomination poll"),
  caption: z.string().describe("caption: why we're asking and a line of context, inviting people to say why in the comments. Do not list the options (we add them). No hashtags."),
  people: z.array(z.object({ name: z.string() })).describe("artists/clubs among the options, so we can tag them"),
  hashtags: z.array(z.string()),
});
export type Poll = z.infer<typeof PollSchema>;

// state/poll-ideas.json: angles we asked for by hand, used first (one per poll), oldest first.
const IDEAS = path.join(ROOT, "state", "poll-ideas.json");
export async function writePoll(verifiedNames: string[], angle = ""): Promise<Poll | null> {
  const used: string[] = fs.existsSync(POLLS) ? JSON.parse(fs.readFileSync(POLLS, "utf8")) : [];
  const ideas: string[] = fs.existsSync(IDEAS) ? JSON.parse(fs.readFileSync(IDEAS, "utf8")) : [];
  const fromIdeas = !angle && ideas.length > 0;
  if (fromIdeas) angle = ideas[0];
  const poll = await askClaudeJson(
    PollSchema,
    `Create a HARDMAG community poll for our audience in Portugal (fast groove, bouncy, hard techno, techno, house, club culture). It must spark comments and friendly debate, and make Portuguese ravers feel represented.
Our account is still small, so polls should be things everyone can answer. Angles to rotate (pick one we haven't used recently):
- Nominations, about 1 in 3 polls (these get shared most): "Who's the best hard techno DJ in Portugal right now?", best fast groove DJ in Portugal, best bouncy DJ in Portugal, most underrated Portuguese DJ, best resident in Lisbon, best resident in Porto, best Portuguese producer this year, best closing set you saw in Portugal this year. A nomination has NO options (empty list) and NO people: the audience tags the DJ in the comments, each tag notifies that DJ, and DJs reshare to get their fans voting. The caption asks them to tag their pick and say why, and to tag friends who'd disagree.
- Name-free debates (about half the polls): fast groove or bouncy; bouncy: guilty pleasure or the future; fast groove vs hard techno; hard techno vs groovy techno; vinyl vs USB; phones on the dancefloor; ideal closing time; day party or all-nighter; front row or back of the room; alone or with your crew; the BPM that feels right; earplugs or not; best time to arrive; festival or club; dark room or big lights; Lisbon or Porto for a night out; what makes a perfect closing track; what ruins a night.
- With names (rarely, 3 options only): best club in Lisbon; best club in Porto; best Portuguese festival for electronic music.
${angle ? `Use exactly this angle: ${angle}\n` : ""}Recently used topics (avoid): ${used.slice(-12).join(", ") || "none"}.
Be neutral: options must be a fair, representative set (the names people would actually argue about), never stacked to favour one club, artist or sound. Club polls in Lisbon should cover the main rooms across sounds (e.g. KØMPLEX, Lux Frágil, Ministerium, Planeta Manas). Mix angles: most about fast groove, bouncy and hard techno, others about techno, house and club culture in general. Never hint at a preferred answer.
Rules: when options are people, clubs or festivals, use only names from this verified list (exact spelling): ${verifiedNames.join(", ")}. Otherwise 3-4 short options (2-4 words each). Keep it respectful: celebrate, don't mock anyone.`,
  );
  if (poll && poll.options.length === 1) poll.options = [];
  if (poll) poll.options = poll.options.map((o) => o.replace(/^\s*[A-Ea-e1-5][).:\-]\s*/, "").trim());
  if (poll && fromIdeas) fs.writeFileSync(IDEAS, JSON.stringify(ideas.slice(1), null, 2) + "\n");
  if (poll) fs.writeFileSync(POLLS, JSON.stringify([...used, poll.topic].slice(-50), null, 2) + "\n");
  return poll;
}

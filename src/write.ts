// Editorial brain: picks the stories worth posting and writes them in HARDMAG's voice.
// Claude runs through the Claude Code CLI (`claude -p`), billed to your Claude subscription:
// locally it uses your logged-in Claude Code, on GitHub Actions the CLAUDE_CODE_OAUTH_TOKEN secret.
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { z } from "zod";
import { CONFIG, BRAND } from "./config.ts";
import type { Story } from "./fetch.ts";

const CLI = process.env.CLAUDE_BIN || "claude";
export const hasClaude = spawnSync(CLI, ["--version"], { stdio: "ignore" }).status === 0;

function jsonSchema(schema: z.ZodType) {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

// The model sometimes leaves JSON escapes (\\") inside string values; strip them.
function unescape(v: unknown): unknown {
  if (typeof v === "string") return v.replace(/\\(["'])/g, "$1");
  if (Array.isArray(v)) return v.map(unescape);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unescape(x)]));
  return v;
}

/** One isolated, tool-less Claude call that must return JSON matching `schema`. */
async function askClaude<T extends z.ZodType>(schema: T, system: string, prompt: string, effort: "low" | "medium"): Promise<z.infer<T> | null> {
  const args = [
    "-p", "--output-format", "json",
    "--json-schema", JSON.stringify(jsonSchema(schema)),
    "--system-prompt", system,
    "--model", CONFIG.model, "--effort", effort,
    // Isolation: no tools, no MCP servers, plugins, skills or settings from this machine.
    "--tools", "", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
    "--setting-sources", "", "--disable-slash-commands", "--no-session-persistence",
  ];
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY; // never bill the API by accident: subscription only
  const out = await new Promise<string>((resolve, reject) => {
    const child = spawn(CLI, args, { cwd: tmpdir(), env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 5 * 60_000);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve(stdout);
      let why = (stderr || stdout).slice(0, 500);
      try {
        const j = JSON.parse(stdout);
        why = `${j.subtype ?? ""} ${j.api_error_status ?? ""} ${j.result ?? ""} ${(j.errors ?? []).join("; ")}`.trim() || why;
      } catch {}
      reject(new Error(`claude exited ${code}: ${why}${stderr ? ` | stderr: ${stderr.slice(0, 300)}` : ""}`));
    });
    child.stdin.end(prompt);
  });
  const res = JSON.parse(out);
  if (res.is_error || res.subtype !== "success") throw new Error(`claude: ${res.result ?? res.subtype}`);
  const parsed = schema.safeParse(unescape(res.structured_output ?? JSON.parse(res.result)));
  return parsed.success ? parsed.data : null;
}

const KICKERS = [
  "NEWS", "RELEASE", "LINEUP", "FESTIVAL", "CLUB CULTURE", "SCENE",
  "GEAR", "INTERVIEW", "MIX", "IN MEMORIAM", "INDUSTRY", "NIGHTLIFE POLICY", "ARTIST SPOTLIGHT",
] as const;

const VOICE = `You are the editor of ${BRAND.name} (${BRAND.handle}), an Instagram news magazine about techno, house and club culture, in English, in the spirit of Resident Advisor, Mixmag and underground scene magazines.
Audience: DJs, producers, ravers and club people worldwide. Priorities, high to low: underground techno & house (artists, labels, releases, clubs, scenes, festivals with credible lineups), club culture and nightlife politics (closures, licensing, night mayors, safety), gear and production, industry. Low priority: EDM/mainstream pop-dance, celebrity gossip, sponsored content, ticket giveaways, listicles, generic "best of" roundups.
We are HARDMAG: hard techno, hard groove and bounce are our home turf, with techno and house around them. We are independent and fair: no club, promoter or artist gets special treatment. Judge every story on its merit; KØMPLEX (Lisbon's hard techno club) is part of the beat like Lux Frágil, Ministerium, Gare and the rest, not above them.
Main focus right now: PORTUGAL. Our audience is mostly in Portugal, so Lisbon, Porto and Portuguese artists, clubs, labels, festivals and nightlife come first; international stories qualify when they are big or have a Portugal angle.
Editorial beats we want in the mix every day (not only straight news):
- Lisbon & Portugal: clubs (KØMPLEX, Lux Frágil, Ministerium, Planeta Manas, Gare and others), festivals, Portuguese DJs/producers/labels, nightlife policy in Lisbon and Porto. Portuguese-language sources are welcome: translate faithfully.
- AI and technology in electronic music: AI production tools, AI-generated tracks and labels, rights and royalties, new gear and software, what it changes for DJs and producers.
- Techno and house artists, including the bouncy hard house / hard groove wave (artists like Hannah Laing, DJ Heartstring, Partiboi69) and house selectors: releases, big sets, tours, milestones.
- Hard techno: the fastest-growing corner of the scene (artists like I Hate Models, Klangkuenstler, Sara Landry, Indira Paganotto, Dax J, 999999999, Funk Tribu, Nico Moreno, Holy Priest), its parties, labels, BPM wars and the arguments around it.
- Debates and controversies the scene is arguing about: DJ fees and ticket prices, phone bans, ghost production, AI tracks, lineup backlash, club closures and licensing, drug policy, safety and harassment, festival ethics and sponsors. Report them straight from the facts and give each side its say; never manufacture outrage.
- Viral moments: whatever the scene is talking about today (a set, a statement, a clash, a record) when there is real reporting behind it.
- Useful pieces for the community: things a DJ, producer or raver can act on (new tools, rules that affect clubs, opportunities, context that explains a trend).
Mainstream music, pop and general culture stories only qualify when they clearly touch electronic music, clubs or these beats.
Voice: sharp, informed, no hype words ("epic", "insane", "banger"), no emojis in headlines, never invent facts. Use only facts present in the material you're given.`;

/* ---------- Step 1: pick ---------- */

const PickSchema = z.object({
  picks: z.array(z.object({
    id: z.string(),
    heat: z.number().int().min(1).max(10).describe("how much the scene will react right now: 10 = breaking or everyone is talking about it (big name, controversy, viral, several outlets on it), 5 = solid news, 1 = filler"),
    reason: z.string(),
  })),
});
export type Pick = { id: string; heat: number };

export async function pickStories(cands: Story[], recentHeadlines: string[], n: number, focus = "", learnings = ""): Promise<Pick[]> {
  if (!hasClaude) {
    // Heuristic: source weight first, then freshness.
    return [...cands].sort((a, b) => Number(!!b.feedImage) - Number(!!a.feedImage) || b.weight - a.weight || +b.published - +a.published).slice(0, n).map((s) => ({ id: s.id, heat: 5 }));
  }
  const list = cands
    .map(
      (s) =>
        `id=${s.id} | ${s.source} [${s.beat ?? "club"}] | ${s.published.toISOString().slice(0, 16)} | ${s.feedImage ? "has photo" : "photo unknown"}\n  ${s.title}\n  ${s.summary.slice(0, 280)}`,
    )
    .join("\n");
  const out = await askClaude(PickSchema, VOICE, `Candidate stories:\n${list}\n\nAlready posted recently (do not repeat these stories, even from another outlet):\n${recentHeadlines.join("\n") || "(none)"}\n\n${focus ? `This slot's theme: ${focus}\nStrongly prefer stories that fit this theme; only fall back to the best story overall if nothing on-theme is worth posting.\n\n` : ""}${learnings ? `What has worked on our account so far (use it to choose angles and stories):\n${learnings}\n\n` : ""}Pick the ${n} best stories to post next, best first, and rate each one's heat. Prefer what will get people commenting and sharing: controversies, hard techno, Lisbon, AI, big names, stories several outlets are covering at once. Rate crossovers high: club music landing in mainstream culture (video games like GTA, film and TV, fashion, sport, huge brands) travels far beyond the scene, as long as our artists, labels or clubs are at the centre of it. Mix the beats: when there are worthy candidates, include Lisbon/Portugal and AI/technology stories, not only global club news. If the same story appears from several outlets, pick it once (prefer the outlet with the most detail). Skip anything off-topic for our audience. Return fewer than ${n} if fewer are worth posting.`, "low");
  return out ? out.picks.map((p) => ({ id: p.id, heat: p.heat })) : [];
}

/* ---------- Step 2: write ---------- */

const PostSchema = z.object({
  skip: z.boolean().describe("true if the material is too thin, off-topic, or not a real news story"),
  kicker: z.enum(KICKERS),
  headline: z.string().describe("max 9 words / ~55 characters, sentence case (capitalise only the first word and proper names), set in a newspaper serif. Concrete: name the artist/club/place."),
  highlight: z.array(z.string()).describe("1-2 words copied exactly from the headline to set in red italic (the key name or fact)"),
  body: z.array(z.string()).describe("2-3 short paragraphs, 60-95 words total, the facts of the story for the second slide"),
  points: z.array(z.object({ title: z.string().describe("2-5 words"), text: z.string().describe("1-2 sentences, max 40 words") })).max(3).optional().describe("0-3 extra carousel slides for stories with real depth (AI, Lisbon scene, policy, explainers): why it matters, what changes for DJs/producers/clubs, what happens next. Only facts from the material; empty for simple news."),
  article: z.array(z.string()).optional().describe("the website version: 4-6 paragraphs, 180-320 words, inverted pyramid, same facts only, with context a reader of a club-culture magazine would want. No headline, no source line."),
  people: z.array(z.object({ name: z.string(), instagram: z.string().optional().describe("their Instagram handle only if you are sure") })).max(6).describe("every artist, DJ, label, club or festival in this story whose attention we want (as written in the story), most central first, so we can tag them"),
  question: z.string().describe("one short, open question for the comments that invites opinions or experiences about this story (no yes/no bait, no emojis), e.g. 'Would you give up your phone for a better dancefloor?'"),
  caption: z.string().describe("Instagram caption: a hook line (max 110 chars), blank line, 2-3 sentences of context. No hashtags, no source line. Name every artist, label, club and festival from people in it, spelled exactly as in people (we turn those names into @tags)."),
  hashtags: z.array(z.string()).describe("4-6 specific lowercase hashtags without #, e.g. techno, berghain, housemusic"),
});
export type WrittenPost = z.infer<typeof PostSchema>;

export async function writePost(s: Story, articleText: string): Promise<WrittenPost | null> {
  const material = articleText || s.summary;
  if (!hasClaude) {
    const words = s.title.split(/\s+/);
    return {
      skip: false,
      kicker: "NEWS",
      headline: words.length <= 12 ? s.title : words.slice(0, 12).join(" ") + "…",
      highlight: [],
      body: material ? [material.split(/(?<=[.!?])\s+/).slice(0, 3).join(" ").slice(0, 520)] : [],
      caption: `${s.title}\n\n${s.summary.slice(0, 300)}`,
      question: "",
      people: [],
      hashtags: ["techno", "housemusic", "clubculture", "electronicmusic"],
    };
  }
  return askClaude(PostSchema, VOICE, `Write a ${BRAND.name} Instagram carousel post for this story.\n\nOutlet: ${s.source}\nOriginal title: ${s.title}\nURL: ${s.url}\n\nArticle text:\n${material}\n\nSlide 1 shows the kicker and headline over the photo. Slide 2 shows the body. Optional "points" become extra slides; use them when the story deserves a deeper carousel people will save and share. The "article" field is the full story published on our website, in your own words (never copy sentences from the source). Write everything in English. Stick strictly to the facts above; if a date, venue or name is not in the text, leave it out.`, "medium");
}

// Tags go inside the text: the first time a tagged name appears in the caption it becomes its @handle
// (that notifies them and reads like a news post). Tagged names the caption never mentions get their own line.
export function inlineMentions(text: string, tags: { name: string; username: string }[]): { text: string; rest: string[] } {
  const rest: string[] = [];
  for (const t of tags) {
    if (text.includes(`@${t.username}`)) continue;
    const esc = t.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^\\p{L}\\p{N}@])${esc}(?![\\p{L}\\p{N}])`, "u");
    if (re.test(text)) text = text.replace(re, `$1@${t.username}`);
    else rest.push(t.username);
  }
  return { text, rest };
}

export function buildCaption(p: WrittenPost, s: Story, articleUrl?: string, tags: { name: string; username: string }[] = []): string {
  const hashtags = [...new Set(p.hashtags.map((h) => h.replace(/^#/, "").toLowerCase()))].slice(0, 6);
  const read = articleUrl ? `\n\nFull story → ${articleUrl.replace(/^https?:\/\//, "")} (link in bio)` : "";
  const credit = s.ig ? `@${s.ig}` : s.source;
  const ask = p.question?.trim() ? `\n\n${p.question.trim()} 👇` : "";
  const { text, rest } = inlineMentions(p.caption.trim(), tags);
  const feat = rest.length ? `\n\n${rest.map((t) => `@${t}`).join(" ")}` : "";
  const src = s.source === BRAND.name ? "" : `\n\nSource: ${credit}\n📸 via ${credit}`;
  return `${text}${feat}${ask}${read}${src}\n\n${hashtags.map((t) => `#${t}`).join(" ")}`;
}

/* ---------- Original content: Artist Spotlight ---------- */

export async function writeSpotlight(artist: { name: string; handle: string; lane: string }, material: string): Promise<WrittenPost | null> {
  if (!hasClaude) return null;
  return askClaude(PostSchema, VOICE, `Write an original ${BRAND.name} "Artist Spotlight" carousel about ${artist.name} (${artist.lane}, Instagram @${artist.handle}).
Goal: a piece the artist and their fans will be proud to share, that also introduces them to new listeners. Warm, specific and scene-literate, never fan-girl hype.

Recent coverage of ${artist.name} from music outlets (may be empty):
${material || "(none in our feeds right now)"}

Rules for facts: use concrete facts (releases, labels, events, dates, numbers) only if they appear in the coverage above. Beyond that, you may describe only well-established, widely known things about the artist's sound, style and role in the scene that you are certain of. Never invent releases, gigs, collaborations, dates or quotes. If you do not know enough about this artist to write accurately, set skip=true.

Format: kicker ARTIST SPOTLIGHT. Headline: the artist's name plus a short angle (put the artist's name in highlight). Body (slide 2): who they are and what their sound is. Points (2-3 slides): e.g. "The sound", "Why now", "Start here" (only titles you can back up). "article" is the website version. "people" must include ${artist.name}. The caption must speak to the community and end before the question; the question should invite people to share their favourite track or set of the artist.`, "medium");
}

/* ---------- Quality gate: a second editor reviews every post before it goes out ---------- */

const ReviewSchema = z.object({
  interest: z.number().int().min(1).max(10).describe("would a techno/house fan in Portugal stop scrolling and read this? 10 = must-read, 5 = fine but forgettable, 1 = filler"),
  accuracy: z.number().int().min(1).max(10).describe("every fact in the post is supported by the source material; 10 = fully supported, below 7 = something is invented, wrong or overstated"),
  hook: z.number().int().min(1).max(10).describe("strength of the headline and the caption's first line"),
  verdict: z.enum(["publish", "rewrite", "reject"]).describe("reject when the story itself is not interesting enough for our audience, no matter how it is written"),
  problems: z.array(z.string()).describe("concrete issues: unsupported claims, dull angle, weak hook, hype words, repetition, wrong tone"),
  fixes: z.string().describe("specific instructions to make it sharper and more interesting, if rewriting"),
});
export type Review = z.infer<typeof ReviewSchema>;

const CRITIC = `You are the strict chief editor of ${BRAND.name}, an Instagram magazine for techno, house and club culture, focused on Portugal. You review drafts before they are published. You care about two things: it must be genuinely interesting to people in the scene, and every fact must be true to the source. Be demanding: most drafts should need at least one improvement, and boring stories should be rejected.`;

export async function reviewPost(p: WrittenPost, material: string, origin: string): Promise<Review | null> {
  if (!hasClaude) return null;
  const draft = JSON.stringify({ kicker: p.kicker, headline: p.headline, body: p.body, points: p.points, caption: p.caption, question: p.question }, null, 1);
  return askClaude(ReviewSchema, CRITIC, `Origin: ${origin}\n\nSource material:\n${material || "(no source text: the draft must stay within widely known facts)"}\n\nDraft:\n${draft}\n\nScore it and decide.`, "medium");
}

export async function rewritePost(p: WrittenPost, material: string, origin: string, r: Review): Promise<WrittenPost | null> {
  if (!hasClaude) return null;
  return askClaude(PostSchema, VOICE, `Rewrite this ${BRAND.name} post following the chief editor's notes. Keep only facts supported by the source material.\n\nOrigin: ${origin}\n\nSource material:\n${material || "(none)"}\n\nCurrent draft:\n${JSON.stringify(p)}\n\nChief editor's problems:\n- ${r.problems.join("\n- ")}\n\nFixes requested:\n${r.fixes}`, "medium");
}

/** Structured Claude call with the HARDMAG editor voice, for special formats (agenda, polls). */
export function askClaudeJson<T extends z.ZodType>(schema: T, prompt: string): Promise<z.infer<T> | null> {
  if (!hasClaude) return Promise.resolve(null);
  return askClaude(schema, VOICE, prompt, "medium");
}

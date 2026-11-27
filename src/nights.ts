// Shared by the guides (run.ts) and the daily "Today" stories (today.ts): fills each night with what its
// own Shotgun page says (who plays, the promoter, genres, start and end, the kind of space, Instagram
// accounts), and cuts a list of nights into story pages per day and city.
import { resolveTags } from "./people.ts";
import { storyDay, type Slide, type WeekItem } from "./templates.ts";
import { pickTrack, type Track } from "./music.ts";
import type { EventDetails, WeekEvent } from "./formats.ts";

const key = (x: string) => x.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[Øø]/g, "o").toLowerCase().replace(/[^a-z0-9]/g, "");
const lisbonTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit" });

export function enrichNights(items: WeekItem[], listed: WeekEvent[], details: Map<string, EventDetails>) {
  for (const e of items) {
    const d = details.get(e.link ?? "");
    const known = resolveTags([{ name: e.venue }, ...(e.headliner ? [{ name: e.headliner }] : [])]).map((t) => t.username);
    e.handles = [...new Set([...(d?.tags.map((t) => t.username) ?? []), ...known])];
    // Supporting artists (shown smaller than the headliner): the lineup on the event's Shotgun page,
    // else the names in the listing. They share the post, so they're our marketing.
    const fromPage = d?.artists.map((a) => a.name).filter(Boolean) ?? [];
    // A night listed under its party name ("Rave360 Girls Power", "Ovelha Trax 5th Anniversary"):
    // when its Shotgun lineup doesn't include that name, the lineup is who plays and the name is the party.
    const orig = listed.find((x) => x.link === e.link && x.date === e.date);
    if (fromPage.length && !fromPage.some((a) => key(e.name).includes(key(a)) || key(a).includes(key(e.headliner || e.name)))) {
      e.party = e.party || orig?.party || e.name;
      e.headliner = fromPage[0];
      e.name = fromPage.slice(0, 4).join(", ");
      e.short = fromPage[0].slice(0, 14);
    }
    const fromName = e.name.split(/\s*(?:,|&|\+| b2b | x | w\/| with )\s*/i);
    const head = e.headliner || fromName[0] || "";
    const seen = [key(head), key(e.venue), key(e.party ?? "")].filter(Boolean);
    const dup = (k: string) => !k || seen.some((x) => x.includes(k) || k.includes(x));
    e.support = [...fromPage, ...fromName].map((x) => x.trim()).filter((x) => { const k = key(x); if (x.length < 2 || dup(k)) return false; seen.push(k); return true; }).slice(0, 6);
    if (!e.headliner && head) e.headliner = head;
    // The page's own facts: who runs it, its sounds, when it ends, day or night, what kind of space.
    if (d) {
      if (d.organizer && !key(e.venue).includes(key(d.organizer).slice(0, 6))) e.organizer = d.organizer.split(/\s*\|\s*/).slice(0, 2).join(" | ");
      e.moods = d.moods.length ? d.moods : undefined;
      if (d.start) e.time = lisbonTime(d.start);
      if (d.end) e.end = lisbonTime(d.end);
      e.space = d.space;
    }
    const h = Number(e.time.slice(0, 2));
    e.daytime = /\d/.test(e.time) && h >= 6 && h < 18;
  }
}

const cityOf = (e: WeekItem) => (e.city === "Porto" ? "Porto" : "Lisbon");
export const PER_STORY = 5;

// Story pages for each night: per city, PER_STORY nights a page ("LISBON 1/2", "LISBON 2/2", "PORTO 1/1").
// Each page comes with the music for its clip (a permitted track only; else silent).
export function nightStories(slug: string, title: string, nights: [string, WeekItem[]][], issue: number | undefined, cta: { line: string; sub: string }): { slide: Slide; track?: Track }[] {
  const out: { slide: Slide; track?: Track }[] = [];
  for (const [d, xs] of nights) {
    for (const c of ["Lisbon", "Porto"]) {
      const ys = xs.filter((e) => cityOf(e) === c);
      const pages = Math.ceil(ys.length / PER_STORY);
      for (let p = 0; p < pages; p++) {
        const shown = ys.slice(p * PER_STORY, (p + 1) * PER_STORY);
        out.push({
          slide: storyDay(slug, title, d, c, shown, { page: p + 1, pages, total: ys.length }, issue, cta),
          track: pickTrack([...shown.filter((e) => e.pick).map((e) => e.headliner ?? ""), ...shown.map((e) => e.headliner ?? "")], shown.map((e) => e.genre), `${slug}-${d}-${c}-${p}`),
        });
      }
    }
  }
  return out;
}

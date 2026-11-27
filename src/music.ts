// Music for our videos. Only tracks we have written permission to use (from the artist or the label),
// listed in state/music.json with the files in music/. Never generic royalty-free music, never a track
// without permission (Instagram mutes or removes those). Choice: a track by the artist the post is about,
// else a permitted track of the post's sound (techno, house...), else the video goes out silent.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./config.ts";

export type Track = {
  artist: string;
  title: string;
  file: string; // relative to the repo, e.g. music/folamour-ibiza.mp3
  start?: number; // second where the clip starts (the drop, the hook)
  genres: string[]; // e.g. ["house"], ["hard techno", "fast groove"]
  permission: string; // who said yes, where and when, e.g. "DM from @label, 2026-11-27"
};

const FILE = path.join(ROOT, "state", "music.json");
const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function library(): Track[] {
  if (!fs.existsSync(FILE)) return [];
  const all: Track[] = JSON.parse(fs.readFileSync(FILE, "utf8")).tracks ?? [];
  return all.filter((t) => t.permission?.trim() && fs.existsSync(path.join(ROOT, t.file)));
}

// names: artists in the post (headliner first). genres: the post's sound(s).
export function pickTrack(names: string[], genres: string[] = [], seed = new Date().toISOString().slice(0, 10)): Track | undefined {
  const lib = library();
  if (!lib.length) return;
  const wanted = names.map(norm).filter((n) => n.length > 2);
  const byArtist = lib.find((t) => wanted.some((n) => n === norm(t.artist) || n.includes(norm(t.artist))));
  if (byArtist) return byArtist;
  const g = genres.map(norm);
  const byGenre = lib.filter((t) => t.genres.some((x) => g.includes(norm(x))));
  if (!byGenre.length) return;
  // Rotate through the matching tracks day by day, so the same song doesn't follow us around.
  const h = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return byGenre[h % byGenre.length];
}

export const trackCredit = (t?: Track) => (t ? `🎵 ${t.artist} – ${t.title}` : "");

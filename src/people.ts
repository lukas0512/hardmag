// Tags artists, clubs, labels and festivals in posts, but only with Instagram handles
// we verified by hand (state/handles.json). Names the editor mentions that we don't know
// yet are queued in state/handles-pending.json (with the editor's guess) to be checked.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./config.ts";

export type Person = { name: string; instagram?: string };
export type Tag = { name: string; username: string };

const FILE = path.join(ROOT, "state", "handles.json");
const PENDING = path.join(ROOT, "state", "handles-pending.json");
const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

function registry(): Map<string, string> {
  const m = new Map<string, string>();
  if (!fs.existsSync(FILE)) return m;
  const { handles = {} } = JSON.parse(fs.readFileSync(FILE, "utf8"));
  for (const [name, h] of Object.entries(handles as Record<string, string>)) m.set(norm(name), h);
  return m;
}

export function resolveTags(people: Person[] = []): Tag[] {
  const reg = registry();
  const tags: Tag[] = [];
  const pending: { name: string; guess?: string; at: string }[] = fs.existsSync(PENDING) ? JSON.parse(fs.readFileSync(PENDING, "utf8")) : [];
  for (const p of people.slice(0, 8)) {
    const h = reg.get(norm(p.name));
    if (h) {
      if (!tags.some((t) => t.username === h)) tags.push({ name: p.name, username: h });
    } else if (p.name && !pending.some((x) => norm(x.name) === norm(p.name))) {
      pending.push({ name: p.name, guess: p.instagram?.replace(/^@/, ""), at: new Date().toISOString() });
    }
  }
  fs.writeFileSync(PENDING, JSON.stringify(pending.slice(-300), null, 2) + "\n");
  return tags;
}

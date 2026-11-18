// Generates the identity kit: profile picture, logo sheet and the 3 launch posts.
import path from "node:path";
import { ROOT } from "./config.ts";
import { renderSlides, closeRenderer } from "./render.ts";
import { profilePicture, logoSheet, statement } from "./templates.ts";

const out = path.join(ROOT, "brand", "kit");

const launch = [
  statement(
    "launch-1",
    "Vol. 01 — Hello",
    `Techno.<br>House.<br><span style="color:var(--acid)">No filler.</span>`,
    "Club culture news, daily",
    "black",
  ),
  statement(
    "launch-2",
    "What we do",
    `News from the floor, every day.`,
    "Releases · Lineups · Clubs · Scenes",
    "acid",
  ),
  statement(
    "launch-3",
    "Manifesto",
    `Four to the floor.<br><span style="color:var(--acid)">Zero noise.</span>`,
    "Turn notifications on",
    "black",
  ),
];

const files = await renderSlides([profilePicture(), logoSheet()], out, "png");
files.push(...(await renderSlides(launch, out, "jpeg")));
await closeRenderer();
console.log(files.join("\n"));

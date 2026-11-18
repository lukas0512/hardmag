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
    `Techno.<br>House.<br><span class="hl">No filler.</span>`,
    "Club culture news, daily",
    "paper",
  ),
  statement(
    "launch-2",
    "What we do",
    `News from the floor, every day.`,
    "Releases · Lineups · Clubs · Scenes",
    "red",
  ),
  statement(
    "launch-3",
    "Manifesto",
    `Four to the floor.<br><span class="hl">Zero noise.</span>`,
    "Turn notifications on",
    "paper",
  ),
];

const files = await renderSlides([profilePicture(), logoSheet()], out, "png");
files.push(...(await renderSlides(launch, out, "jpeg")));
await closeRenderer();
console.log(files.join("\n"));

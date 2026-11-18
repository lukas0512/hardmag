// Generates the identity kit: profile picture, logo sheet and the 3 launch posts.
import path from "node:path";
import { ROOT } from "./config.ts";
import { renderSlides, closeRenderer } from "./render.ts";
import { profilePicture, logoSheet, statement } from "./templates.ts";

const out = path.join(ROOT, "brand", "kit");

const launch = [
  statement(
    "launch-1",
    "Hello",
    `Techno.<br>House.<br><span class="hl">No filler.</span>`,
    "Club culture news, daily",
    "black",
  ),
  statement(
    "launch-2",
    "About",
    `News from<br>the floor,<br><span class="hl">every day.</span>`,
    "Releases · Lineups · Clubs · Scenes",
    "white",
  ),
  statement(
    "launch-3",
    "Manifesto",
    `Four to the floor.<br><span class="hl">Zero noise.</span>`,
    "Turn notifications on",
    "black",
  ),
];

const files = await renderSlides([profilePicture(), logoSheet()], out, "png");
files.push(...(await renderSlides(launch, out, "jpeg")));
await closeRenderer();
console.log(files.join("\n"));

// Profile grid preview: the 9 most recent covers in out/, cropped to the 3:4 tile Instagram's grid shows,
// newest top-left, as out/grid.jpg. Run: npm run grid
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PATHS } from "./config.ts";

const covers = fs
  .readdirSync(PATHS.out, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => fs.readdirSync(path.join(PATHS.out, d.name)).find((f) => /-1\.jpg$/.test(f)) && path.join(PATHS.out, d.name, fs.readdirSync(path.join(PATHS.out, d.name)).find((f) => /-1\.jpg$/.test(f))!))
  .filter((f): f is string => Boolean(f))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
  .slice(0, 9);
if (!covers.length) {
  console.log("no covers in out/ yet");
  process.exit(0);
}
while (covers.length % 3) covers.push(covers[covers.length - 1]);
const out = path.join(PATHS.out, "grid.jpg");
const tiles = covers.map((_, i) => `[${i}:v]crop=1012:1350,scale=360:480[t${i}]`).join(";");
const rows = covers.length / 3;
const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...covers.flatMap((f) => ["-i", f]), "-filter_complex", `${tiles};${covers.map((_, i) => `[t${i}]`).join("")}xstack=inputs=${covers.length}:layout=${covers.map((_, i) => `${(i % 3) * 362}_${Math.floor(i / 3) * 482}`).join("|")}:fill=white`, "-frames:v", "1", out], { encoding: "utf8" });
if (r.status !== 0) throw new Error(r.stderr);
console.log(`grid (${rows} rows): ${path.relative(process.cwd(), out)}`);

// Turns a cover into a short motion clip for the first carousel slide:
// the photo slowly pushes in under the static HARDMAG overlay, with the text layer fading in,
// with a permitted track from our music library (music.ts) when one fits the post, otherwise silent.
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { cover, type PostContent } from "./templates.ts";
import { renderSlides, renderFrames } from "./render.ts";
import type { Slide } from "./templates.ts";
import { ROOT } from "./config.ts";
import type { Track } from "./music.ts";

const BPM = 130;
const BEAT = 60 / BPM;
const SECONDS = +(BEAT * 16).toFixed(3); // 4 bars ≈ 7.4 s
const FPS = 30;

export const hasFfmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;

// Audio inputs and options: the track's clip with short fades, or no audio stream at all.
const audioIn = (t?: Track) => (t ? ["-ss", String(t.start ?? 0), "-t", String(SECONDS), "-i", path.join(ROOT, t.file)] : []);
const audioOut = (t: Track | undefined, index: number) =>
  t
    ? ["-map", `${index}:a`, "-c:a", "aac", "-b:a", "192k", "-af", `afade=t=in:st=0:d=0.3,afade=t=out:st=${SECONDS - 0.6}:d=0.6,alimiter=limit=0.9`]
    : ["-an"];

export async function renderCoverVideo(p: PostContent, total: number, outDir: string, track?: Track): Promise<string | undefined> {
  if (!hasFfmpeg || !p.imagePath) return;
  try {
    const [overlay] = await renderSlides([cover(p, total, true)], outDir, "png");
    const out = path.join(outDir, `${p.slug}-1.mp4`);
    const h = p.photoMode === "framed" ? (p.photoHeight ?? 780) : 1350;
    const frames = Math.round(SECONDS * FPS);
    // Photo: upscale 2x first so the slow zoom stays smooth, then push in ~8% over the clip.
    const photo =
      `[0:v]scale=2160:-2:flags=lanczos,zoompan=z='1+0.08*on/${frames}':d=${frames}:` +
      `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x${h}:fps=${FPS},` +
      `eq=contrast=1.05:saturation=0.9,pad=1080:1350:0:0:color=0x0b0b0c[bg];` +
      `[1:v]format=rgba[ov];[bg][ov]overlay=0:0:format=auto,format=yuv420p[v]`;
    const r = spawnSync(
      "ffmpeg",
      [
        "-y", "-loglevel", "error",
        "-loop", "1", "-i", p.imagePath,
        "-loop", "1", "-i", overlay,
        ...audioIn(track),
        "-filter_complex", photo,
        "-map", "[v]", ...audioOut(track, 2),
        "-t", String(SECONDS), "-r", String(FPS),
        "-c:v", "libx264", "-profile:v", "high", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        out,
      ],
      { encoding: "utf8" },
    );
    fs.rmSync(overlay, { force: true });
    if (r.status !== 0) {
      console.warn(`  [video] ffmpeg failed: ${(r.stderr || "").slice(0, 300)}`);
      return;
    }
    return out;
  } catch (e) {
    console.warn(`  [video] ${(e as Error).message}`);
    return;
  }
}

// Renders a slide whose page defines window.draw(t) as a 4-bar clip over the same kick loop.
// Returns the clip and its first frame (the finished design, used as the still/thumbnail).
export async function renderAnimation(slide: Slide, outDir: string, track?: Track): Promise<{ video?: string; still: string }> {
  const dir = path.join(outDir, `${slide.name}-frames`);
  const frames = Math.round(SECONDS * FPS);
  const files = await renderFrames(slide, dir, frames, FPS);
  const still = path.join(outDir, `${slide.name}.jpg`);
  fs.copyFileSync(files[0], still);
  if (!hasFfmpeg) return { still };
  const out = path.join(outDir, `${slide.name}.mp4`);
  const r = spawnSync(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      "-framerate", String(FPS), "-i", path.join(dir, "%04d.jpg"),
      ...audioIn(track),
      "-map", "0:v", ...audioOut(track, 1), "-t", String(SECONDS),
      "-c:v", "libx264", "-profile:v", "high", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
      "-movflags", "+faststart", out,
    ],
    { encoding: "utf8" },
  );
  fs.rmSync(dir, { recursive: true, force: true });
  if (r.status !== 0) {
    console.warn(`  [video] ffmpeg failed: ${(r.stderr || "").slice(0, 300)}`);
    return { still };
  }
  return { video: out, still };
}

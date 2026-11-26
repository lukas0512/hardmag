// Turns a cover into a short motion clip for the first carousel slide:
// the photo slowly pushes in under the static HARDMAG overlay, with the text layer fading in,
// over a 4-bar 130 BPM kick + hat loop synthesised here (no third-party audio, no rights issues).
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { cover, type PostContent } from "./templates.ts";
import { renderSlides, renderFrames } from "./render.ts";
import type { Slide } from "./templates.ts";

const BPM = 130;
const BEAT = 60 / BPM;
const SECONDS = +(BEAT * 16).toFixed(3); // 4 bars ≈ 7.4 s
const FPS = 30;

export const hasFfmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;

// Kick: pitch-dropping sine on every beat. Hat: short noise burst on the off-beats.
const KICK = `0.9*sin(2*PI*(45*mod(t,${BEAT})+(110/30)*(1-exp(-30*mod(t,${BEAT})))))*exp(-7*mod(t,${BEAT}))`;
const HAT = `0.12*(2*random(0)-1)*exp(-70*mod(t+${BEAT / 2},${BEAT}))`;
const BASS = `0.25*sin(2*PI*55*t)*exp(-9*mod(t+${BEAT / 2},${BEAT}))`;

export async function renderCoverVideo(p: PostContent, total: number, outDir: string): Promise<string | undefined> {
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
        "-f", "lavfi", "-t", String(SECONDS), "-i", `aevalsrc='${KICK}+${HAT}+${BASS}':s=44100:c=stereo`,
        "-filter_complex", photo,
        "-map", "[v]", "-map", "2:a",
        "-t", String(SECONDS), "-r", String(FPS),
        "-c:v", "libx264", "-profile:v", "high", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "160k", "-af", "afade=t=out:st=" + (SECONDS - 0.4) + ":d=0.4,alimiter=limit=0.9",
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
export async function renderAnimation(slide: Slide, outDir: string): Promise<{ video?: string; still: string }> {
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
      "-f", "lavfi", "-t", String(SECONDS), "-i", `aevalsrc='${KICK}+${HAT}+${BASS}':s=44100:c=stereo`,
      "-map", "0:v", "-map", "1:a", "-t", String(SECONDS),
      "-c:v", "libx264", "-profile:v", "high", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "160k", "-af", "afade=t=out:st=" + (SECONDS - 0.4) + ":d=0.4,alimiter=limit=0.9",
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

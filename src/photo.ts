// Prepares a story photo for the 1080x1350 cover without blurry upscaling.
// - Big portrait-ish photos fill the whole cover ("bleed"), smart-cropped.
// - Landscape or small photos keep their own shape across the top of the cover
//   ("framed"), so a 1200x630 press shot is not blown up 2-3x to fill 1350px.
// Any upscale uses Lanczos with light sharpening.
import path from "node:path";
import sharp from "sharp";

export type PreparedPhoto = { file: string; mode: "bleed" | "framed"; height: number; scale: number };

const W = 1080, H = 1350;
const MIN_FRAMED_H = 780; // keeps the photo meeting the headline block (crops the sides a little)
const MAX_FRAMED_H = 900;

export async function preparePhoto(src: string): Promise<PreparedPhoto | undefined> {
  try {
    const meta = await sharp(src).metadata();
    const w = meta.width ?? 0, h = meta.height ?? 0;
    if (!w || !h) return;
    const out = path.join(path.dirname(src), `${path.parse(src).name}.prepared.jpg`);

    // Full bleed only when it costs (almost) no upscaling.
    const bleedScale = Math.max(W / w, H / h);
    if (bleedScale <= 1.15) {
      await sharp(src)
        .rotate()
        .resize(W, H, { fit: "cover", position: sharp.strategy.attention, kernel: "lanczos3" })
        .sharpen(bleedScale > 1 ? { sigma: 0.7 } : undefined)
        .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
        .toFile(out);
      return { file: out, mode: "bleed", height: H, scale: bleedScale };
    }

    const height = Math.min(Math.max(Math.round(h * (W / w)), MIN_FRAMED_H), MAX_FRAMED_H);
    const scale = Math.max(W / w, height / h);
    await sharp(src)
      .rotate()
      .resize(W, height, { fit: "cover", position: "centre", kernel: "lanczos3" })
      .sharpen(scale > 1.05 ? { sigma: Math.min(1.2, 0.5 + (scale - 1) * 0.6) } : undefined)
      .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
      .toFile(out);
    return { file: out, mode: "framed", height, scale };
  } catch (e) {
    console.warn(`  [img] could not prepare photo: ${(e as Error).message}`);
    return;
  }
}

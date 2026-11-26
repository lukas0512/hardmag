import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser } from "playwright";
import { PATHS } from "./config.ts";
import type { Slide } from "./templates.ts";

let browser: Browser | null = null;

export async function renderSlides(slides: Slide[], outDir: string, type: "jpeg" | "png" = "jpeg"): Promise<string[]> {
  browser ??= await chromium.launch();
  fs.mkdirSync(PATHS.tmp, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  for (const s of slides) {
    const htmlPath = path.join(PATHS.tmp, `${s.name}.html`);
    fs.writeFileSync(htmlPath, s.html);
    const page = await browser.newPage({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
    await page.waitForSelector("body[data-ready='1']", { timeout: 15000 });
    const file = path.join(outDir, `${s.name}.${type === "jpeg" ? "jpg" : "png"}`);
    await page.screenshot({ path: file, type, ...(type === "jpeg" ? { quality: 95 } : { omitBackground: Boolean(s.transparent) }) });
    await page.close();
    files.push(file);
  }
  return files;
}

// Frame-by-frame capture of an animated slide: calls window.draw(t) before every screenshot.
export async function renderFrames(s: Slide, dir: string, frames: number, fps: number): Promise<string[]> {
  browser ??= await chromium.launch();
  fs.mkdirSync(PATHS.tmp, { recursive: true });
  fs.mkdirSync(dir, { recursive: true });
  const htmlPath = path.join(PATHS.tmp, `${s.name}.html`);
  fs.writeFileSync(htmlPath, s.html);
  const page = await browser.newPage({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
  await page.waitForSelector("body[data-ready='1']", { timeout: 15000 });
  const files: string[] = [];
  for (let f = 0; f < frames; f++) {
    await page.evaluate((t) => (window as any).draw(t), f / fps);
    const file = path.join(dir, `${String(f).padStart(4, "0")}.jpg`);
    await page.screenshot({ path: file, type: "jpeg", quality: 92 });
    files.push(file);
  }
  await page.close();
  return files;
}

export async function closeRenderer() {
  await browser?.close();
  browser = null;
}

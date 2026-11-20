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

export async function closeRenderer() {
  await browser?.close();
  browser = null;
}

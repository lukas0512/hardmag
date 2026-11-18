// HTML templates for every HARDMAG visual. Rendered to JPEG/PNG by render.ts.
import { pathToFileURL } from "node:url";
import { ROOT, BRAND } from "./config.ts";

export type Slide = { html: string; width: number; height: number; name: string };

export type PostContent = {
  slug: string;
  kicker: string;          // e.g. NEWS, LINEUP, RELEASE, CLUB CULTURE
  headline: string;        // short, punchy, uppercase-ready
  highlight: string[];     // words of the headline painted acid
  body: string[];          // 2-4 short paragraphs for the story slide
  source: string;          // publication name
  date: Date;
  imagePath?: string;      // local file; absent -> typographic cover
};

const css = pathToFileURL(`${ROOT}/brand/brand.css`).href;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fmtDate = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(
    d.getUTCFullYear(),
  ).slice(2)}`;

const logo = (size: number) =>
  `<span class="logo"><span class="word" style="font-size:${size}px">${BRAND.name}</span><span class="kicks"><i></i><i></i><i></i><i></i></span></span>`;

function paintHeadline(headline: string, highlight: string[]): string {
  const marks = new Set(highlight.flatMap((h) => h.split(/\s+/)).map((w) => w.toUpperCase().replace(/[^\p{L}\p{N}]/gu, "")));
  return headline
    .toUpperCase()
    .split(/\s+/)
    .map((w) => {
      const bare = w.replace(/[^\p{L}\p{N}]/gu, "");
      return marks.has(bare) ? `<span class="acid">${esc(w)}</span>` : esc(w);
    })
    .join(" ");
}

// Shrinks every [data-fit] element until it fits its data-max height.
const fitScript = `
<script>
document.fonts.ready.then(() => {
  for (const el of document.querySelectorAll('[data-fit]')) {
    const max = +el.dataset.max, min = +el.dataset.min;
    let size = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollHeight > max && size > min) { size -= 2; el.style.fontSize = size + 'px'; }
  }
  document.body.dataset.ready = '1';
});
</script>`;

const grain = `<svg class="grain" width="1080" height="1350"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`;

const page = (body: string, extraCss: string, h: number) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${css}"><style>html,body{height:${h}px;overflow:hidden}${extraCss}</style></head>
<body>${body}${fitScript}</body></html>`;

/* ---------- Slide 1: cover ---------- */
export function cover(p: PostContent, total: number): Slide {
  const hasImg = Boolean(p.imagePath);
  const bg = hasImg
    ? `<img class="photo" src="${pathToFileURL(p.imagePath!).href}">${grain}<div class="shade"></div>`
    : `<div class="type-bg"></div>`;
  const body = `
  ${bg}
  <header class="top mono"><span>${logo(30)}</span><span>${fmtDate(p.date)} &nbsp;/&nbsp; ${esc(p.kicker)}</span></header>
  <section class="bottom">
    <div class="tag mono">${esc(p.kicker)}</div>
    <h1 class="display headline" data-fit data-max="520" data-min="60">${paintHeadline(p.headline, p.highlight)}</h1>
    <footer class="mono"><span>Source — ${esc(p.source)}</span>${total > 1 ? "<span>Swipe →</span>" : ""}</footer>
  </section>`;
  const extra = `
  .photo{position:absolute;inset:0;width:1080px;height:1350px;object-fit:cover;object-position:50% 30%;filter:grayscale(.2) contrast(1.1) brightness(.88)}
  .grain{position:absolute;inset:0;opacity:.13;mix-blend-mode:overlay}
  .shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,10,10,.7) 0%,rgba(10,10,10,0) 16%,rgba(10,10,10,0) 36%,rgba(10,10,10,.88) 66%,#0a0a0a 100%)}
  .type-bg{position:absolute;inset:0;background:var(--black);background-image:repeating-linear-gradient(0deg,rgba(204,255,0,.06) 0 2px,transparent 2px 90px)}
  .top{position:absolute;top:52px;left:var(--frame);right:var(--frame);display:flex;justify-content:space-between;align-items:center;font-size:20px;color:var(--white)}
  .bottom{position:absolute;left:var(--frame);right:var(--frame);bottom:60px}
  .tag{display:inline-block;background:var(--acid);color:var(--black);font-size:22px;padding:8px 14px 6px;margin-bottom:26px}
  .headline{font-size:${hasImg ? 108 : 132}px;color:var(--white);max-height:520px}
  footer{display:flex;justify-content:space-between;margin-top:34px;padding-top:22px;border-top:2px solid rgba(242,240,234,.25);font-size:19px;color:var(--grey)}`;
  return { html: page(body, extra, 1350), width: 1080, height: 1350, name: `${p.slug}-1` };
}

/* ---------- Slide 2: the story ---------- */
export function story(p: PostContent, index: number, total: number): Slide {
  const paras = p.body.map((t, i) => `<p class="${i === 0 ? "lead" : ""}">${esc(t)}</p>`).join("");
  const body = `
  <header class="top mono"><span>${logo(30)}</span><span>${index}/${total}</span></header>
  <main>
    <div class="tag mono">${esc(p.kicker)} — The story</div>
    <h2 class="display h2" data-fit data-max="260" data-min="40">${paintHeadline(p.headline, p.highlight)}</h2>
    <div class="text body" data-fit data-max="640" data-min="26">${paras}</div>
  </main>
  <footer class="mono"><span class="kicks big"><i></i><i></i><i></i><i></i></span><span>Follow ${esc(BRAND.handle)} — techno &amp; house, daily</span></footer>`;
  const extra = `
  body{background:var(--black)}
  .top{position:absolute;top:52px;left:var(--frame);right:var(--frame);display:flex;justify-content:space-between;align-items:center;font-size:20px}
  main{position:absolute;top:150px;left:var(--frame);right:var(--frame)}
  .tag{color:var(--acid);font-size:22px;margin-bottom:28px}
  .h2{font-size:64px;margin-bottom:44px;max-height:260px;overflow:hidden}
  .text{font-size:42px;line-height:1.3;color:#d9d7d0;max-height:640px}
  .text p+p{margin-top:.75em}
  .text .lead{color:var(--white);font-weight:600}
  footer{position:absolute;left:var(--frame);right:var(--frame);bottom:60px;display:flex;justify-content:space-between;align-items:center;font-size:19px;color:var(--grey);padding-top:22px;border-top:2px solid rgba(242,240,234,.15)}
  .kicks.big i{width:16px;height:16px}`;
  return { html: page(body, extra, 1350), width: 1080, height: 1350, name: `${p.slug}-${index}` };
}

export function postSlides(p: PostContent): Slide[] {
  const total = p.body.length ? 2 : 1;
  const slides = [cover(p, total)];
  if (total === 2) slides.push(story(p, 2, total));
  return slides;
}

/* ---------- Brand assets ---------- */
export function profilePicture(): Slide {
  const body = `<div class="pp"><span class="m display">HM</span><span class="kicks"><i></i><i></i><i></i><i></i></span></div>`;
  const extra = `
  html,body{width:1080px}
  .pp{width:1080px;height:1080px;background:var(--black);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:56px}
  .m{font-size:420px;letter-spacing:-.06em;color:var(--acid);line-height:.8}
  .kicks{gap:22px}.kicks i{width:58px;height:58px}`;
  return { html: page(body, extra, 1080), width: 1080, height: 1080, name: "profile-picture" };
}

export function logoSheet(): Slide {
  const body = `<div class="sheet">
    <div class="row dark">${logo(118)}</div>
    <div class="row light">${logo(118)}</div>
    <div class="row acidbg">${logo(118)}</div></div>`;
  const extra = `
  html,body{width:1080px}
  .row{height:450px;display:flex;align-items:center;justify-content:center}
  .dark{background:var(--black);color:var(--white)}
  .light{background:var(--white);color:var(--black)}.light .kicks i{background:var(--black)}
  .acidbg{background:var(--acid);color:var(--black)}.acidbg .kicks i{background:var(--black)}
  .kicks i{width:38px;height:38px}.kicks{gap:12px}`;
  return { html: page(body, extra, 1350), width: 1080, height: 1350, name: "logo-sheet" };
}

/* Typographic statement post (launch posts, manifesto, announcements). */
export function statement(slug: string, kicker: string, lines: string, sub: string, variant: "black" | "acid"): Slide {
  const body = `
  <header class="top mono"><span>${logo(30)}</span><span>${esc(kicker)}</span></header>
  <h1 class="display big" data-fit data-max="900" data-min="70">${lines}</h1>
  <footer class="mono"><span>${esc(sub)}</span><span class="kicks"><i></i><i></i><i></i><i></i></span></footer>`;
  const fg = variant === "acid" ? "var(--black)" : "var(--white)";
  const bgc = variant === "acid" ? "var(--acid)" : "var(--black)";
  const extra = `
  body{background:${bgc};color:${fg}}
  .top{position:absolute;top:52px;left:var(--frame);right:var(--frame);display:flex;justify-content:space-between;align-items:center;font-size:20px}
  ${variant === "acid" ? ".kicks i{background:var(--black)}" : ""}
  .big{position:absolute;left:var(--frame);right:var(--frame);bottom:170px;font-size:150px;max-height:900px}
  footer{position:absolute;left:var(--frame);right:var(--frame);bottom:60px;display:flex;justify-content:space-between;align-items:center;font-size:20px;padding-top:22px;border-top:2px solid currentColor}`;
  return { html: page(body, extra, 1350), width: 1080, height: 1350, name: slug };
}

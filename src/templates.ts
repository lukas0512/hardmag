// HTML templates for every HARDMAG visual. Rendered to JPEG/PNG by render.ts.
// Look: a club-culture broadsheet (paper, ink, one red, serif headlines in sentence case).
import { pathToFileURL } from "node:url";
import { ROOT, BRAND } from "./config.ts";

export type Slide = { html: string; width: number; height: number; name: string };

export type PostContent = {
  slug: string;
  kicker: string;          // e.g. NEWS, LINEUP, RELEASE, CLUB CULTURE
  headline: string;        // short, punchy, sentence case
  highlight: string[];     // words of the headline set in red italic
  body: string[];          // 2-4 short paragraphs for the story slide
  source: string;          // publication name
  date: Date;
  imagePath?: string;      // local file; absent -> typographic cover
};

const css = pathToFileURL(`${ROOT}/brand/brand.css`).href;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDate = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

const site = () => BRAND.site.replace(/^https?:\/\//, "").replace(/\/$/, "");

const mast = (size: number) => `<span class="mast" style="font-size:${size}px">${esc(BRAND.name.charAt(0) + BRAND.name.slice(1).toLowerCase())}<span class="dot">.</span></span>`;

// Headlines stay in the writer's sentence case; highlighted words go red italic.
export function paintHeadline(headline: string, highlight: string[]): string {
  const norm = (w: string) => w.toUpperCase().replace(/[^\p{L}\p{N}]/gu, "");
  const marks = new Set(highlight.flatMap((h) => h.split(/\s+/)).map(norm));
  return headline
    .split(/\s+/)
    .map((w) => (marks.has(norm(w)) ? `<span class="hl">${esc(w)}</span>` : esc(w)))
    .join(" ")
    .replace(/<\/span> <span class="hl">/g, " ");
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

const grain = (h: number) =>
  `<svg class="paper-grain" width="1080" height="${h}"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`;

const page = (body: string, extraCss: string, h: number) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${css}"><style>html,body{height:${h}px;overflow:hidden;position:relative}${extraCss}</style></head>
<body>${body}${grain(h)}${fitScript}</body></html>`;

const masthead = (right: string) => `
  <header class="masthead">
    <div class="mrow">${mast(66)}<span class="label meta">${right}</span></div>
    <div class="rules"><i></i><i></i></div>
  </header>`;

const mastCss = `
  .masthead{position:absolute;top:44px;left:var(--frame);right:var(--frame)}
  .mrow{display:flex;justify-content:space-between;align-items:flex-end}
  .meta{font-size:21px;color:var(--ink);padding-bottom:8px}
  .rules{margin-top:14px}
  .rules i{display:block;background:var(--ink)}
  .rules i:first-child{height:4px}
  .rules i:last-child{height:1.5px;margin-top:5px}
  .kicker{display:flex;align-items:center;gap:14px;font-size:24px;color:var(--red)}
  .kicker::before{content:"";width:16px;height:16px;background:var(--red)}`;

/* ---------- Slide 1: cover ---------- */
export function cover(p: PostContent, total: number): Slide {
  const hasImg = Boolean(p.imagePath);
  const photo = hasImg
    ? `<figure class="photo"><img src="${pathToFileURL(p.imagePath!).href}"></figure>
       <div class="credit label">Photo via ${esc(p.source)}</div>`
    : "";
  const body = `
  ${masthead(`${fmtDate(p.date)} &nbsp;·&nbsp; Techno &amp; house`)}
  ${photo}
  <section class="story ${hasImg ? "" : "type"}">
    <div class="kicker label">${esc(p.kicker)}</div>
    <h1 class="display headline" data-fit data-max="${hasImg ? 330 : 760}" data-min="54">${paintHeadline(p.headline, p.highlight)}</h1>
  </section>
  <footer class="foot label"><span>Full story &nbsp;→&nbsp; ${esc(site())}</span>${total > 1 ? "<span>Swipe</span>" : ""}</footer>`;
  const extra = `${mastCss}
  .photo{position:absolute;top:186px;left:var(--frame);right:var(--frame);height:636px;overflow:hidden;background:var(--ink)}
  .photo img{width:100%;height:100%;object-fit:cover;object-position:50% 28%;filter:grayscale(1) contrast(1.18) brightness(1.02);mix-blend-mode:luminosity}
  .credit{position:absolute;top:834px;right:var(--frame);font-size:16px;color:var(--ink-2);letter-spacing:.04em}
  .story{position:absolute;left:var(--frame);right:var(--frame);top:880px}
  .story.type{top:auto;bottom:150px}
  .headline{margin-top:22px;font-size:${hasImg ? 96 : 150}px;max-height:${hasImg ? 330 : 760}px}
  .foot{position:absolute;left:var(--frame);right:var(--frame);bottom:52px;display:flex;justify-content:space-between;font-size:21px;padding-top:18px;border-top:1.5px solid var(--ink)}`;
  return { html: page(body, extra, 1350), width: 1080, height: 1350, name: `${p.slug}-1` };
}

/* ---------- Slide 2: the story ---------- */
export function story(p: PostContent, index: number, total: number): Slide {
  const paras = p.body.map((t, i) => `<p class="${i === 0 ? "lead" : ""}">${esc(t)}</p>`).join("");
  const body = `
  ${masthead(`${index} / ${total}`)}
  <main>
    <div class="kicker label">${esc(p.kicker)}</div>
    <h2 class="display h2" data-fit data-max="230" data-min="40">${paintHeadline(p.headline, p.highlight)}</h2>
    <div class="text serif" data-fit data-max="700" data-min="26">${paras}</div>
  </main>
  <footer class="foot label"><span>Source: ${esc(p.source)}</span><span>Read on ${esc(site())} &nbsp;·&nbsp; link in bio</span></footer>`;
  const extra = `${mastCss}
  main{position:absolute;top:196px;left:var(--frame);right:var(--frame)}
  .h2{margin:20px 0 34px;font-size:66px;max-height:230px;overflow:hidden}
  .text{font-size:38px;line-height:1.36;color:var(--ink);max-height:700px;column-rule:1.5px solid var(--ink)}
  .text p+p{margin-top:.7em}
  .text .lead::first-letter{float:left;font-size:3.3em;line-height:.82;font-weight:700;color:var(--red);padding:.06em .1em 0 0}
  .foot{position:absolute;left:var(--frame);right:var(--frame);bottom:52px;display:flex;justify-content:space-between;font-size:20px;padding-top:18px;border-top:1.5px solid var(--ink)}`;
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
  const body = `<div class="pp"><span class="mast m">H<span class="dot">.</span></span></div>`;
  const extra = `
  html,body{width:1080px}
  .pp{width:1080px;height:1080px;display:flex;align-items:center;justify-content:center}
  .m{font-size:720px;letter-spacing:-.06em;line-height:.8;transform:translate(-14px,88px)}`;
  return { html: page(body, extra, 1080), width: 1080, height: 1080, name: "profile-picture" };
}

export function logoSheet(): Slide {
  const body = `<div class="sheet">
    <div class="row paper">${mast(190)}</div>
    <div class="row ink">${mast(190)}</div>
    <div class="row redbg">${mast(190)}</div></div>`;
  const extra = `
  html,body{width:1080px}
  .row{height:450px;display:flex;align-items:center;justify-content:center;position:relative;z-index:1}
  .ink{background:var(--ink);color:var(--paper)}
  .redbg{background:var(--red);color:var(--paper)}.redbg .dot{color:var(--ink)}`;
  return { html: page(body, extra, 1350), width: 1080, height: 1350, name: "logo-sheet" };
}

/* Typographic statement post (launch posts, manifesto, announcements). */
export function statement(slug: string, kicker: string, lines: string, sub: string, variant: "paper" | "red"): Slide {
  const body = `
  ${masthead(esc(kicker))}
  <h1 class="display big" data-fit data-max="880" data-min="70">${lines}</h1>
  <footer class="foot label"><span>${esc(sub)}</span><span>${esc(site())}</span></footer>`;
  const red = variant === "red";
  const extra = `${mastCss}
  ${red ? "body{background:var(--red);color:var(--paper)} .mast .dot,.hl{color:var(--ink)} .rules i{background:var(--paper)} .meta{color:var(--paper)} .foot{border-color:var(--paper)!important}" : ""}
  .big{position:absolute;left:var(--frame);right:var(--frame);bottom:150px;font-size:150px;max-height:880px}
  .foot{position:absolute;left:var(--frame);right:var(--frame);bottom:52px;display:flex;justify-content:space-between;font-size:21px;padding-top:18px;border-top:1.5px solid var(--ink)}`;
  return { html: page(body, extra, 1350), width: 1080, height: 1350, name: slug };
}

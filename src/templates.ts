// HTML templates for every HARDMAG visual. Rendered to JPEG/PNG by render.ts.
// Look v3: full-bleed photo, white HARDMAG stamp with catalog number, crop marks,
// heavy caps headlines with the key name in thin italic, level meter.
import { pathToFileURL } from "node:url";
import { ROOT, BRAND } from "./config.ts";

export type Slide = { html: string; width: number; height: number; name: string; transparent?: boolean };

export type PostContent = {
  slug: string;
  kicker: string;          // e.g. NEWS, LINEUP, RELEASE, CLUB CULTURE
  headline: string;        // short, punchy
  highlight: string[];     // words of the headline set in thin italic
  body: string[];          // 2-4 short paragraphs for the story slide
  source: string;          // publication name
  date: Date;
  issue?: number;          // catalog number: HM.0001
  points?: { title: string; text: string }[]; // extra carousel slides (why it matters, what's next)
  imagePath?: string;      // local file (already sized by photo.ts); absent -> typographic cover
  photoMode?: "bleed" | "framed"; // framed: photo keeps its shape across the top
  photoHeight?: number;    // px height of a framed photo
};

const css = pathToFileURL(`${ROOT}/brand/brand.css`).href;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDate = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
const dotDate = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
export const catalog = (n?: number) => (n ? `HM.${String(n).padStart(4, "0")}` : "HM.----");

const site = () => BRAND.site.replace(/^https?:\/\//, "").replace(/\/$/, "");

export const stamp = (issue?: number, label = "News") =>
  `<span class="stamp"><span class="w">${esc(BRAND.name.toUpperCase())}</span><span class="n mono"><span>${catalog(issue)}</span><span>${esc(label)}</span></span></span>`;

const crop = `<div class="crop"><i></i><i></i><i></i><i></i></div>`;

// Level meter: lights up a little more with every post in the catalog.
const meter = (issue?: number) => {
  const on = issue ? ((issue - 1) % 12) + 1 : 6;
  return `<span class="meter">${Array.from({ length: 12 }, (_, i) => `<b class="${i < on ? "on" : ""}"></b>`).join("")}</span>`;
};

// Highlighted words (the key name) are set in thin italic.
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

const page = (body: string, extraCss: string, h: number) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${css}"><style>:root{--grade:contrast(1.12) saturate(1.32) brightness(1.04)}.top-right,.kick{color:#f4f4f2!important;text-shadow:0 1px 3px rgba(0,0,0,.7),0 2px 18px rgba(0,0,0,.6)}.kick *{color:inherit!important}html,body{height:${h}px;overflow:hidden;position:relative}${extraCss}</style></head>
<body>${body}${fitScript}</body></html>`;

const frameCss = `
  .top-left{position:absolute;top:80px;left:var(--frame);z-index:2}
  .top-right{position:absolute;top:92px;right:86px;font-size:19px;text-align:right;line-height:1.4;z-index:2}
  .kick{display:inline-flex;align-items:center;gap:10px;font-size:21px;margin-bottom:22px}
  .kick::before{content:"";width:12px;height:12px;background:var(--white)}
  .row{display:flex;justify-content:space-between;align-items:center;margin-top:30px;padding-top:18px;border-top:2px solid rgba(244,244,242,.5);font-size:17px}`;

/* ---------- Slide 1: cover ---------- */
// overlay: renders everything except the photo, on a transparent page (the video's top layer).
export function cover(p: PostContent, total: number, overlay = false): Slide {
  const hasImg = Boolean(p.imagePath);
  const framed = hasImg && p.photoMode === "framed";
  const ph = p.photoHeight ?? 1350;
  const bg = hasImg
    ? `${overlay ? "" : `<img class="ph${framed ? " framed" : ""}" src="${pathToFileURL(p.imagePath!).href}">`}<div class="shade${framed ? " framed" : ""}"></div>`
    : `<div class="type-bg"></div>`;
  const body = `
  ${bg}${crop}
  <div class="top-left">${stamp(p.issue)}</div>
  <div class="top-right mono">${dotDate(p.date)}<br>${total > 1 ? "Swipe →" : ""}</div>
  <section>
    <div class="mono kick">${esc(p.kicker)}</div>
    <h1 class="head headline" data-fit data-max="${hasImg ? 300 : 760}" data-min="48">${paintHeadline(p.headline, p.highlight)}</h1>
    <div class="mono row"><span>${esc(BRAND.handle)}</span>${meter(p.issue)}<span>Full story → ${esc(site())}</span></div>
  </section>`;
  const extra = `${frameCss}
  .ph{position:absolute;inset:0;width:1080px;height:1350px;object-fit:cover;object-position:50% 30%;filter:var(--grade)}
  .shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,11,12,.25) 0%,rgba(11,11,12,0) 16%,rgba(11,11,12,0) 60%,rgba(11,11,12,.78) 80%,rgba(11,11,12,.95) 100%)}
  .ph.framed{inset:auto;top:0;left:0;width:1080px;height:${ph}px;object-fit:none;filter:var(--grade)}
  .shade.framed{inset:auto;top:0;left:0;width:1080px;height:${ph + 2}px;background:linear-gradient(180deg,rgba(11,11,12,.35) 0%,rgba(11,11,12,0) 20%,rgba(11,11,12,0) 62%,rgba(11,11,12,.7) 86%,var(--black) 100%)}
  .type-bg{position:absolute;inset:0;background:var(--black);background-image:linear-gradient(rgba(244,244,242,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(244,244,242,.05) 1px,transparent 1px);background-size:90px 90px}
  section{position:absolute;left:var(--frame);right:var(--frame);bottom:92px}
  .headline{font-size:${hasImg ? 76 : 140}px;max-height:${hasImg ? 300 : 760}px}
  ${overlay ? "html,body{background:transparent!important}" : ""}`;
  return { html: page(body, extra, 1350), width: 1080, height: 1350, name: overlay ? `${p.slug}-overlay` : `${p.slug}-1`, transparent: overlay };
}

/* ---------- Slide 2: the story ---------- */
export function story(p: PostContent, index: number, total: number): Slide {
  const paras = p.body.map((t, i) => `<p class="${i === 0 ? "lead" : ""}">${esc(t)}</p>`).join("");
  const body = `
  ${crop}
  <div class="top-left">${stamp(p.issue)}</div>
  <div class="top-right mono">${dotDate(p.date)}<br>${index} / ${total}</div>
  <main>
    <div class="mono kick">${esc(p.kicker)}</div>
    <h2 class="head h2" data-fit data-max="250" data-min="40">${paintHeadline(p.headline, p.highlight)}</h2>
    <div class="text" data-fit data-max="600" data-min="24">${paras}</div>
  </main>
  <footer class="mono row"><span>${esc(BRAND.handle)}</span>${meter(p.issue)}<span>Read on ${esc(site())} · link in bio</span></footer>`;
  const extra = `${frameCss}
  main{position:absolute;top:290px;left:var(--frame);right:var(--frame)}
  .h2{font-size:64px;margin-bottom:40px;max-height:250px;overflow:hidden}
  .text{font-size:36px;line-height:1.38;color:#cfd0d2;max-height:600px;font-weight:400;letter-spacing:-.01em}
  .text p+p{margin-top:.7em}
  .text .lead{color:var(--white);font-weight:600}
  footer.row{position:absolute;left:var(--frame);right:var(--frame);bottom:92px;margin:0}`;
  return { html: page(body, extra, 1350), width: 1080, height: 1350, name: `${p.slug}-${index}` };
}

/* ---------- Slides 3+: key points ---------- */
export function point(p: PostContent, pt: { title: string; text: string }, n: number, index: number, total: number): Slide {
  const body = `
  ${crop}
  <div class="top-left">${stamp(p.issue)}</div>
  <div class="top-right mono">${dotDate(p.date)}<br>${index} / ${total}</div>
  <main>
    <div class="num mono">${String(n).padStart(2, "0")}</div>
    <h2 class="head ptitle" data-fit data-max="330" data-min="56">${esc(pt.title)}</h2>
    <p class="ptext" data-fit data-max="420" data-min="30">${esc(pt.text)}</p>
  </main>
  <footer class="mono row"><span>${esc(p.kicker)}</span>${meter(p.issue)}<span>${index < total ? "Swipe →" : `Full story → ${esc(site())}`}</span></footer>`;
  const extra = `${frameCss}
  body{background-image:linear-gradient(rgba(244,244,242,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(244,244,242,.05) 1px,transparent 1px);background-size:90px 90px}
  main{position:absolute;left:var(--frame);right:var(--frame);top:330px}
  .num{font-size:30px;padding-bottom:18px;margin-bottom:34px;border-bottom:2px solid rgba(244,244,242,.5);width:120px}
  .ptitle{font-size:120px;margin-bottom:44px;max-height:330px}
  .ptext{font-size:48px;line-height:1.3;font-weight:400;letter-spacing:-.015em;color:#dcdcda;max-height:420px}
  footer.row{position:absolute;left:var(--frame);right:var(--frame);bottom:92px;margin:0}`;
  return { html: page(body, extra, 1350), width: 1080, height: 1350, name: `${p.slug}-${index}` };
}

export function postSlides(p: PostContent): Slide[] {
  const pts = (p.points ?? []).slice(0, 3);
  const total = (p.body.length ? 2 : 1) + pts.length;
  const slides = [cover(p, total)];
  if (p.body.length) slides.push(story(p, 2, total));
  pts.forEach((pt, i) => slides.push(point(p, pt, i + 1, slides.length + 1, total)));
  return slides;
}

/* ---------- Brand assets ---------- */
export function profilePicture(): Slide {
  const body = `<div class="pp"><span class="stamp big"><span class="w">HM</span><span class="n mono"><span>HARDMAG</span><span>NEWS</span></span></span></div>`;
  const extra = `
  html,body{width:1080px}
  .pp{width:1080px;height:1080px;display:flex;align-items:center;justify-content:center}
  .stamp.big{padding:46px 56px 40px;gap:26px}
  .stamp.big .w{font-size:440px;letter-spacing:-.07em}
  .stamp.big .n{font-size:52px;border-top-width:6px;padding-top:24px}`;
  return { html: page(body, extra, 1080), width: 1080, height: 1080, name: "profile-picture" };
}

export function logoSheet(): Slide {
  const body = `<div class="sheet">
    <div class="row dark">${stamp(1)}</div>
    <div class="row light">${stamp(1)}</div>
    <div class="row word"><span class="head" style="font-size:150px">${esc(BRAND.name.toUpperCase())}</span></div></div>`;
  const extra = `
  html,body{width:1080px}
  .row{height:450px;display:flex;align-items:center;justify-content:center;position:relative}
  .row .stamp{transform:scale(2.4)}
  .light{background:var(--white)}.light .stamp{background:var(--black);color:var(--white)}.light .stamp .n{border-color:var(--white)}
  .word{border-top:2px solid rgba(244,244,242,.2)}`;
  return { html: page(body, extra, 1350), width: 1080, height: 1350, name: "logo-sheet" };
}

/* Typographic statement post (launch posts, manifesto, announcements). */
export function statement(slug: string, kicker: string, lines: string, sub: string, variant: "black" | "white"): Slide {
  const body = `
  ${crop}
  <div class="top-left">${stamp(undefined, kicker)}</div>
  <h1 class="head big" data-fit data-max="820" data-min="70">${lines}</h1>
  <footer class="mono row"><span>${esc(sub)}</span>${meter(undefined)}<span>${esc(site())}</span></footer>`;
  const white = variant === "white";
  const extra = `${frameCss}
  ${white ? "body{background:var(--white);color:var(--black)} .crop i{border-color:var(--black)} .stamp{background:var(--black);color:var(--white)} .stamp .n{border-color:var(--white)} .row{border-color:rgba(11,11,12,.5)!important} .meter b{background:rgba(11,11,12,.2)} .meter b.on{background:var(--black)}" : "body{background-image:linear-gradient(rgba(244,244,242,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(244,244,242,.05) 1px,transparent 1px);background-size:90px 90px}"}
  .big{position:absolute;left:var(--frame);right:var(--frame);bottom:190px;font-size:170px;max-height:820px}
  footer.row{position:absolute;left:var(--frame);right:var(--frame);bottom:92px;margin:0}`;
  return { html: page(body, extra, 1350), width: 1080, height: 1350, name: slug };
}

/* ---------- Weekend agenda & community polls (typographic) ---------- */

const gridBg = "body{background-image:linear-gradient(rgba(244,244,242,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(244,244,242,.05) 1px,transparent 1px);background-size:90px 90px}";

export type AgendaItem = { day: string; time: string; name: string; venue: string; price?: string; tags?: string };

export function agendaCover(slug: string, title: string, subtitle: string, kicker: string, issue: number | undefined, date: Date, total: number, imagePath?: string): Slide {
  const img = imagePath ? `<img class="ph" src="${pathToFileURL(imagePath).href}"><div class="shade"></div>` : "";
  const body = `${img}${crop}
  <div class="top-left">${stamp(issue, kicker)}</div>
  <div class="top-right mono">${dotDate(date)}<br>Swipe →</div>
  <section><div class="mono kick">${esc(kicker)}</div>
  <h1 class="head big" data-fit data-max="${imagePath ? 360 : 700}" data-min="60">${title}</h1>
  <p class="sub mono">${esc(subtitle)}</p>
  <div class="mono row"><span>${esc(BRAND.handle)}</span>${meter(issue)}<span>1 / ${total}</span></div></section>`;
  const extra = `${frameCss}${imagePath ? "" : gridBg}
  .ph{position:absolute;inset:0;width:1080px;height:1350px;object-fit:cover;filter:var(--grade)}
  .shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,11,12,.3) 0%,rgba(11,11,12,0) 16%,rgba(11,11,12,0) 48%,rgba(11,11,12,.82) 68%,rgba(11,11,12,.96) 100%)}
  section{position:absolute;left:var(--frame);right:var(--frame);bottom:92px}
  .big{font-size:${imagePath ? 104 : 150}px;max-height:${imagePath ? 360 : 700}px}
  .sub{font-size:26px;margin-top:30px;color:#cfd0d2;line-height:1.5}`;
  return { html: page(body, extra, 1350), width: 1080, height: 1350, name: `${slug}-1` };
}

export function agendaList(slug: string, heading: string, items: AgendaItem[], issue: number | undefined, date: Date, index: number, total: number, label = "Weekend"): Slide {
  const rows = items
    .map((e) => `<div class="ev"><div class="when mono">${esc(e.day)} · ${esc(e.time)}</div><div class="name head">${esc(e.name)}</div><div class="where mono">${esc(e.venue)}${e.price ? ` · ${esc(e.price)}` : ""}${e.tags ? ` · ${esc(e.tags)}` : ""}</div></div>`)
    .join("");
  const body = `${crop}
  <div class="top-left">${stamp(issue, label)}</div>
  <div class="top-right mono">${dotDate(date)}<br>${index} / ${total}</div>
  <main><h2 class="head h2">${heading}</h2><div class="list" data-fit data-max="860" data-min="20">${rows}</div></main>
  <footer class="mono row"><span>${esc(BRAND.handle)}</span>${meter(issue)}<span>${index < total ? "Swipe →" : "Tickets: link in bio"}</span></footer>`;
  const extra = `${frameCss}${gridBg}
  main{position:absolute;top:270px;left:var(--frame);right:var(--frame)}
  .h2{font-size:84px;margin-bottom:26px}
  .list{font-size:30px;max-height:860px}
  .ev{padding:.55em 0;border-top:2px solid rgba(244,244,242,.25)}
  .when{font-size:.62em;color:#cfd0d2}
  .name{font-size:1.25em;margin:.18em 0 .16em;letter-spacing:-.035em;line-height:.98}
  .where{font-size:.6em;color:var(--grey)}
  footer.row{position:absolute;left:var(--frame);right:var(--frame);bottom:92px;margin:0}`;
  return { html: page(body, extra, 1350), width: 1080, height: 1350, name: `${slug}-${index}` };
}

export function pollCover(slug: string, question: string, highlight: string[], options: string[], issue: number | undefined, date: Date, imagePath?: string): Slide {
  // No options = a nomination: people tag their pick in the comments.
  const nominate = !options.length;
  const opts = nominate
    ? `<div class="opt"><span class="n mono">@</span><span class="head">Tag your pick</span></div><div class="opt"><span class="n mono">?</span><span class="head">Tell us why</span></div><div class="opt"><span class="n mono">+</span><span class="head">Tag who disagrees</span></div>`
    : options.map((o, i) => `<div class="opt"><span class="n mono">${String.fromCharCode(65 + i)}</span><span class="head">${esc(o)}</span></div>`).join("");
  const img = imagePath ? `<img class="ph" src="${pathToFileURL(imagePath).href}"><div class="shade"></div>` : "";
  const body = `${img}${crop}
  <div class="top-left">${stamp(issue, nominate ? "Nominate" : "Vote")}</div>
  <div class="top-right mono">${dotDate(date)}<br>${nominate ? "Tag them in the comments" : "Comment A, B, C…"}</div>
  <main><div class="mono kick">Your call</div>
  <h1 class="head q" data-fit data-max="${imagePath ? 260 : 420}" data-min="44">${paintHeadline(question, highlight)}</h1>
  <div class="opts" data-fit data-max="${imagePath ? 300 : 520}" data-min="22">${opts}</div></main>
  <footer class="mono row"><span>${esc(BRAND.handle)}</span>${meter(issue)}<span>${nominate ? "Tag them in the comments 👇" : "Vote in the comments 👇"}</span></footer>`;
  // With a photo: the photo carries the top two thirds, question and options sit low and smaller.
  const extra = `${frameCss}${imagePath ? "" : gridBg}
  .ph{position:absolute;inset:0;width:1080px;height:1350px;object-fit:cover;filter:var(--grade)}
  .shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,11,12,.3) 0%,rgba(11,11,12,0) 16%,rgba(11,11,12,0) 40%,rgba(11,11,12,.82) 62%,rgba(11,11,12,.96) 100%)}
  main{position:absolute;${imagePath ? "bottom:170px" : "top:260px"};left:var(--frame);right:var(--frame)}
  .q{font-size:${imagePath ? 70 : 96}px;max-height:${imagePath ? 260 : 420}px;margin-bottom:${imagePath ? 26 : 40}px}
  .opts{font-size:${imagePath ? 32 : 44}px;max-height:${imagePath ? 300 : 520}px}
  .opt{display:flex;align-items:center;gap:24px;padding:.42em 0;border-top:2px solid rgba(244,244,242,.25)}
  .opt .n{display:inline-flex;align-items:center;justify-content:center;width:1.4em;height:1.4em;background:var(--white);color:var(--black);font-size:.62em;font-weight:600;flex:none}
  .opt .head{letter-spacing:-.035em}
  footer.row{position:absolute;left:var(--frame);right:var(--frame);bottom:92px;margin:0}`;
  return { html: page(body, extra, 1350), width: 1080, height: 1350, name: `${slug}-1` };
}

// Instagram Story (1080x1920): the post's cover in the middle, our stamp on top, a call to action below.
// Stories are re-shares of the feed post, so people who watch stories but skip the feed still see it.
export function storyFrame(coverFile: string, slug: string, issue: number | undefined, label: string, cta: string, sub: string): Slide {
  const extra = `
  html,body{width:1080px;background:var(--black)}
  .top{position:absolute;top:170px;left:86px;right:86px;display:flex;justify-content:space-between;align-items:center}
  .tag{font-size:26px;letter-spacing:.14em;text-transform:uppercase;display:flex;gap:14px;align-items:center}
  .tag::before{content:"";width:14px;height:14px;background:var(--white)}
  .card{position:absolute;top:260px;left:86px;width:908px;height:1135px;object-fit:cover;outline:2px solid rgba(244,244,242,.25)}
  .cta{position:absolute;left:86px;right:86px;top:1500px}
  .cta .big{font-size:74px;line-height:1;letter-spacing:-.03em;text-transform:uppercase;font-weight:900}
  .cta .small{margin-top:26px;font-size:28px;letter-spacing:.1em;text-transform:uppercase;color:#bdbdbb}
  .bar{position:absolute;left:86px;right:86px;bottom:150px;height:6px;background:var(--white)}`;
  const body = `<div class="top"><span class="tag mono">${esc(label)}</span><span class="tag mono">@hardmag.news</span></div>
<img class="card" src="file://${coverFile}">
<div class="cta"><div class="big">${esc(cta)}</div><div class="small mono">${esc(sub)}</div></div><div class="bar"></div>`;
  return { html: page(body, extra, 1920), width: 1080, height: 1920, name: `${slug}-story` };
}

/* ---------- This week / this weekend in Lisbon & Porto (by day, city and sound) ---------- */
// Grid: Instagram's profile grid shows the middle 3:4 of a 4:5 post (about 34px off each side),
// so everything that must read in the thumbnail stays inside the 80px frame.
// Concept: a split-flap departures board. No stock photo: the nights are the image.

export type WeekItem = { date: string; day: string; time: string; name: string; party?: string; short: string; venue: string; city: string; price?: string; genre: string; pick: boolean; handles?: string[]; cover?: boolean; link?: string; headliner?: string; support?: string[]; organizer?: string; moods?: string[]; end?: string; space?: string; daytime?: boolean };
const CORE = new Set(["HARD TECHNO", "FAST GROOVE", "BOUNCY"]);
const chip = (g: string, n?: number) => `<span class="chip mono${CORE.has(g) ? " core" : ""}">${esc(g)}${n ? ` <b>${n}</b>` : ""}</span>`;
const chipCss = `
  .chip{display:inline-flex;align-items:center;gap:.5em;padding:.3em .55em .24em;border:2px solid rgba(244,244,242,.75);font-size:20px;line-height:1;white-space:nowrap}
  .chip.core{background:var(--white);color:var(--black);border-color:var(--white)}
  .chip b{font-weight:600;opacity:.75}`;
const FLAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const flapClean = (x: string) => x.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/Ø/g, "O").replace(/ø/g, "o").toUpperCase().replace(/[^A-Z0-9:&+ .\-/]/g, " ");
const boardText = (e: WeekItem) => flapClean(e.day.split(" ")[0]).padEnd(3).slice(0, 3) + flapClean(e.time).padEnd(5).slice(0, 5) + flapClean(e.short || e.name).slice(0, 14).padEnd(14);
const cityOf = (e: WeekItem) => (e.city === "Porto" ? "Porto" : "Lisbon");
// The line under a board row: where (white), then what (grey).
const boardSub = (e: WeekItem) => `<b>${esc(e.venue)}</b> · ${esc(cityOf(e))}<span class="g">${e.party ? ` — ${esc(e.party)}` : ""} · ${esc(e.genre.toLowerCase())}</span>`;
const badge = (e?: WeekItem) => (e?.cover ? "◉" : e?.pick ? "★" : "");

// Animated cover. window.draw(t) sets the frame at t seconds; t = 0 is the settled first board (the thumbnail).
// The board flips to the other city on beat 6 and back on beat 14, so the clip loops cleanly.
// imagePath: a photo of the cover night's headliner across the top.
export function weekBoard(slug: string, title: string, label: string, pages: { city: string; rows: WeekItem[]; more: number }[], nights: number, picks: number, total: number, issue: number | undefined, date: Date, imagePath?: string, beat = 60 / 130): Slide {
  const rowsN = Math.max(...pages.map((p) => p.rows.length), 1);
  const N = 22;
  const data = pages.map((p) => ({
    city: p.city,
    more: p.more,
    rows: Array.from({ length: rowsN }, (_, r) => (p.rows[r] ? boardText(p.rows[r]) : " ".repeat(N))),
    subs: Array.from({ length: rowsN }, (_, r) => (p.rows[r] ? boardSub(p.rows[r]) : "")),
    badges: Array.from({ length: rowsN }, (_, r) => badge(p.rows[r])),
  }));
  const cell = (r: number, c: number) => `<i class="f${c === 3 || c === 8 ? " gap" : ""}" id="c${r}_${c}">${esc(data[0].rows[r][c] === " " ? "" : data[0].rows[r][c])}</i>`;
  const rows = Array.from({ length: rowsN }, (_, r) => `<div class="r"><div class="cells">${Array.from({ length: N }, (_, c) => cell(r, c)).join("")}<i class="bd" id="b${r}">${data[0].badges[r]}</i></div><div class="sub mono" id="s${r}">${data[0].subs[r]}</div></div>`).join("");
  const tabs = pages.map((p, i) => `<span class="tab${i === 0 ? " on" : ""}" id="t${i}">${esc(p.city)}</span>`).join("");
  const [hA, hB] = title.split(" ");
  const img = imagePath ? `<img class="ph" src="${pathToFileURL(imagePath).href}"><div class="shade"></div>` : "";
  const body = `${img}${crop}
  <div class="top-left">${stamp(issue, title)}</div>
  <div class="top-right mono">${esc(label)}<br>Swipe →</div>
  <header><div class="mono kick">Next departures · Lisbon &amp; Porto</div>
  <h1 class="head big">${esc(hA)} <span class="hl">${esc(hB ?? "")}</span></h1>
  <p class="sub0 mono">${nights} nights · ★ ${picks} we wouldn't miss</p></header>
  <div class="board"><div class="bh mono"><span class="tabs">${tabs}</span><span><b class="dot"></b> <span id="more">${data[0].more ? `+${data[0].more} more inside` : "Day by day inside"}</span></span></div>
  <div class="cols mono"><span style="width:${3 * 39 - 4}px">Night</span><span style="width:${5 * 39 + 12}px">Time</span><span>Who plays</span></div>${rows}</div>
  <footer class="mono row"><span>${esc(BRAND.handle)}</span>${meter(issue)}<span>1 / ${total}</span></footer>
  <script>
  const B = ${beat}, D = ${JSON.stringify(data)}, F = ${JSON.stringify(FLAP)}, R = ${rowsN}, N = ${N};
  const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) % F.length; };
  window.draw = (t) => {
    const flips = D.length > 1 ? [[6 * B, 0, 1], [14 * B, 1, 0]] : [];
    let from = 0, to = 0, t0 = -9;
    for (const [s, a, b] of flips) if (t >= s) { from = a; to = b; t0 = s; }
    const frame = Math.round(t * 30);
    for (let r = 0; r < R; r++) {
      let rowDone = true;
      for (let c = 0; c < N; c++) {
        const el = document.getElementById('c' + r + '_' + c);
        const settle = t0 + 0.02 * c + 0.07 * r + 0.22;
        const start = t0 + 0.015 * c + 0.05 * r;
        const target = D[to].rows[r][c], prev = D[from].rows[r][c];
        let ch = target, flipping = false;
        if (t0 > -9 && t < settle && (target !== ' ' || prev !== ' ')) {
          if (t < start) ch = prev; else { ch = F[hash(r * 31 + c, frame)]; flipping = true; }
          rowDone = false;
        }
        el.textContent = ch === ' ' ? '' : ch;
        el.classList.toggle('flip', flipping && frame % 2 === 0);
      }
      document.getElementById('s' + r).innerHTML = rowDone ? D[to].subs[r] : '';
      document.getElementById('b' + r).textContent = rowDone ? D[to].badges[r] : '';
    }
    const page = t0 > -9 && t >= t0 + 0.3 ? to : from;
    D.forEach((_, i) => document.getElementById('t' + i).classList.toggle('on', i === page));
    document.getElementById('more').textContent = D[page].more ? '+' + D[page].more + ' more inside' : 'Day by day inside';
    document.querySelector('.dot').style.opacity = (t / B) % 1 < 0.5 ? 1 : 0.25;
  };
  window.draw(0);
  </script>`;
  const extra = `${frameCss}${imagePath ? "" : gridBg}
  .ph{position:absolute;left:0;top:0;width:1080px;height:600px;object-fit:cover;object-position:50% 30%;filter:var(--grade)}
  .shade{position:absolute;left:0;top:0;width:1080px;height:602px;background:linear-gradient(180deg,rgba(11,11,12,.35) 0%,rgba(11,11,12,0) 18%,rgba(11,11,12,0) 58%,rgba(11,11,12,.8) 86%,#0b0b0c 100%)}
  header{position:absolute;top:${imagePath ? 330 : 250}px;left:var(--frame);right:var(--frame)}
  .big{font-size:${imagePath ? 112 : 132}px;line-height:.86;white-space:nowrap;text-shadow:0 2px 24px rgba(0,0,0,.5)}
  .sub0{font-size:26px;margin-top:${imagePath ? 12 : 20}px;color:#e2e3e5}
  .board{position:absolute;top:560px;left:var(--frame);right:var(--frame)}
  .bh{display:flex;justify-content:space-between;align-items:center;font-size:21px;padding-bottom:16px;border-bottom:2px solid rgba(244,244,242,.5)}
  .tabs{display:flex;gap:10px}.tab{padding:.3em .6em .25em;border:2px solid rgba(244,244,242,.4);color:#9a9ca1}.tab.on{background:var(--white);color:var(--black);border-color:var(--white)}
  .dot{display:inline-block;width:12px;height:12px;border-radius:50%;background:#f4f4f2;vertical-align:1px}
  .cols{display:flex;gap:24px;font-size:16px;color:#9a9ca1;padding:14px 0 8px}
  .r{padding:9px 0 11px;border-bottom:1px solid rgba(244,244,242,.14)}
  .cells{display:flex;gap:4px;align-items:center}
  .f{width:35px;height:52px;display:flex;align-items:center;justify-content:center;font-style:normal;font-family:"Geist Mono",monospace;font-weight:600;font-size:32px;color:#f4f4f2;background:#1a1a1c;position:relative}
  .f::after{content:"";position:absolute;left:0;right:0;top:50%;height:2px;background:#0b0b0c}
  .f.gap{margin-left:16px}
  .f.flip{background:#2a2a2d;color:#cfd0d2;transform:scaleY(.82)}
  .bd{margin-left:auto;font-style:normal;font-size:30px;width:36px;text-align:center;color:#f4f4f2}
  .sub{font-size:20px;color:#f4f4f2;margin-top:9px;min-height:1.2em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:.03em}
  .sub b{font-weight:600}.sub .g{color:#a9abaf}
  footer.row{position:absolute;left:var(--frame);right:var(--frame);bottom:92px;margin:0}`;
  return { html: page(body, extra, 1350), width: 1080, height: 1350, name: `${slug}-1` };
}

// Slide 2: the week sorted by sound, so people jump straight to theirs (top 3 per sound).
export function weekGenres(slug: string, groups: [string, WeekItem[]][], issue: number | undefined, date: Date, index: number, total: number, label = "This week"): Slide {
  const blocks = groups
    .map(([g, xs]) => `<div class="g"><div class="gh">${chip(g, xs.length)}</div>${xs.slice(0, 3).map((e) => `<div class="li"><span class="mono d">${esc(e.day)}</span><span class="t"><span class="n"><b>${esc(e.headliner || e.name)}</b>${e.support?.length ? `<i> w/ ${esc(e.support.slice(0, 2).join(", "))}</i>` : ""}</span><span class="mono v"><b>${esc(e.venue)}</b> · ${e.city === "Porto" ? "Porto" : "Lisbon"}${e.party && e.party !== e.venue ? ` — ${esc(e.party)}` : ""}</span></span></div>`).join("")}${xs.length > 3 ? `<div class="mono mo">+${xs.length - 3} more in the day slides</div>` : ""}</div>`)
    .join("");
  const body = `${crop}
  <div class="top-left">${stamp(issue, label)}</div>
  <div class="top-right mono">${dotDate(date)}<br>${index} / ${total}</div>
  <main><h2 class="head h2">Pick your <span class="hl">sound</span></h2><div class="list" data-fit data-max="800" data-min="20">${blocks}</div></main>
  <footer class="mono row"><span>${esc(BRAND.handle)}</span>${meter(issue)}<span>Day by day →</span></footer>`;
  const extra = `${frameCss}${chipCss}${gridBg}
  main{position:absolute;top:270px;left:var(--frame);right:var(--frame)}
  .h2{font-size:96px;margin-bottom:30px}
  .list{font-size:31px;max-height:800px}
  .g{margin-bottom:.75em}
  .gh{margin-bottom:.3em}.gh .chip{font-size:.72em}
  .li{display:grid;grid-template-columns:4.4em 1fr;gap:.6em;align-items:baseline;padding:.22em 0;border-top:1px solid rgba(244,244,242,.2)}
  .li .d{font-size:.66em;color:#e2e3e5}.li .t{display:flex;flex-direction:column;min-width:0}
  .li .n{letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .li .n b{font-weight:700}.li .n i{font-style:normal;font-weight:500;font-size:.68em;color:#c4c5c8}
  .li .v{font-size:.52em;color:#b9babd;margin-top:.15em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.li .v b{color:#f4f4f2;font-weight:600}
  .mo{font-size:.55em;color:#9a9ca1;padding-top:.3em}
  footer.row{position:absolute;left:var(--frame);right:var(--frame);bottom:92px;margin:0}`;
  return { html: page(body, extra, 1350), width: 1080, height: 1350, name: `${slug}-${index}` };
}

// One slide per night, Lisbon and Porto in their own blocks.
export function weekDay(slug: string, day: string, items: WeekItem[], issue: number | undefined, date: Date, index: number, total: number, label = "This week"): Slide {
  const [dow, dd] = day.split(" ");
  // who plays (big), where + city (white), the party and sound (grey), time and price on top.
  const ev = (e: WeekItem) => `<div class="ev"><div class="when mono"><span>${esc(e.time)}${e.price ? ` · ${esc(e.price)}` : ""}</span>${e.cover ? `<span class="pick">◉ On the cover</span>` : e.pick ? `<span class="pick">★ Our pick</span>` : ""}</div><div class="name head">${esc(e.headliner || e.name)}</div>${e.support?.length ? `<div class="sup">w/ ${esc(e.support.join(", "))}</div>` : ""}<div class="where"><span class="mono"><b>${esc(e.venue)}</b>${e.party ? `<span class="pt"> — ${esc(e.party)}</span>` : ""}</span>${chip(e.genre)}</div></div>`;
  const city = (c: string) => {
    const xs = items.filter((e) => (e.city === "Porto" ? "Porto" : "Lisbon") === c);
    return xs.length ? `<div class="city mono"><span>${c}</span><span>${xs.length}</span></div>${xs.map(ev).join("")}` : "";
  };
  const body = `${crop}
  <div class="top-left">${stamp(issue, label)}</div>
  <div class="top-right mono">${dotDate(date)}<br>${index} / ${total}</div>
  <main><h2 class="head h2">${esc(dow)} <span class="hl">${esc(dd ?? "")}</span></h2><div class="list" data-fit data-max="760" data-min="20">${city("Lisbon")}${city("Porto")}</div></main>
  <footer class="mono row"><span>${esc(BRAND.handle)}</span>${meter(issue)}<span>${index < total ? "Swipe →" : "Tickets on Shotgun"}</span></footer>`;
  const extra = `${frameCss}${chipCss}${gridBg}
  main{position:absolute;top:250px;left:var(--frame);right:var(--frame)}
  .h2{font-size:150px;margin-bottom:18px}
  .list{font-size:34px;max-height:760px}
  .city{display:flex;justify-content:space-between;font-size:.6em;background:var(--white);color:var(--black);padding:.35em .5em .3em;margin-top:.5em}
  .ev{padding:.45em 0 .5em;border-bottom:1px solid rgba(244,244,242,.2)}
  .when{display:flex;justify-content:space-between;font-size:.6em;color:#e2e3e5}
  .pick{background:var(--white);color:var(--black);padding:0 .45em}
  .name{font-size:1.15em;margin:.16em 0 .2em;letter-spacing:-.035em;line-height:.98}
  .where{display:flex;justify-content:space-between;align-items:center;gap:20px;font-size:.6em;color:#f4f4f2}
  .sup{font-size:.62em;font-weight:600;color:#d6d7da;margin:-.05em 0 .3em;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .where b{font-weight:600}.where .pt{color:#a9abaf}
  .where>span:first-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .where .chip{font-size:18px;flex:none}
  footer.row{position:absolute;left:var(--frame);right:var(--frame);bottom:92px;margin:0}`;
  return { html: page(body, extra, 1350), width: 1080, height: 1350, name: `${slug}-${index}` };
}

// Last slide: saves and sends are what push a guide; ask for both.
export function weekSave(slug: string, question: string, issue: number | undefined, date: Date, index: number, total: number, label = "This week", next = "New guide every Monday"): Slide {
  const body = `${crop}
  <div class="top-left">${stamp(issue, label)}</div>
  <div class="top-right mono">${dotDate(date)}<br>${index} / ${total}</div>
  <main><div class="mono kick">Before you go</div>
  <h2 class="head h2">Save it.<br><span class="hl">Send it</span><br>to your crew.</h2>
  <p class="q">${esc(question)}</p><p class="mono s">Tell us in the comments 👇 · Tickets on Shotgun</p></main>
  <footer class="mono row"><span>${esc(BRAND.handle)}</span>${meter(issue)}<span>${esc(next)}</span></footer>`;
  const extra = `${frameCss}${gridBg}
  main{position:absolute;left:var(--frame);right:var(--frame);top:360px}
  .h2{font-size:150px;line-height:.9}
  .q{font-size:44px;font-weight:700;letter-spacing:-.02em;margin-top:60px;line-height:1.15}
  .s{font-size:22px;margin-top:22px;color:#cfd0d2}
  footer.row{position:absolute;left:var(--frame);right:var(--frame);bottom:92px;margin:0}`;
  return { html: page(body, extra, 1350), width: 1080, height: 1350, name: `${slug}-${index}` };
}

// Story (1080x1920, animated): one night in one city, as a dense list (up to 4 parties a page).
// Each row: start time on flaps (end time and a moon or sun under it), the full lineup headliner first,
// the venue and who runs it, then the sounds and the kind of space. Rows slide in one per beat, then hold.
// Kept between y 220 and 1700, clear of Instagram's own story header and reply bar.
const MOON = `<svg viewBox="0 0 24 24"><path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1z" fill="currentColor"/></svg>`;
const SUN = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.6" fill="currentColor"/><g stroke="currentColor" stroke-width="2.2" stroke-linecap="round">${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<line x1="12" y1="2.2" x2="12" y2="4.6" transform="rotate(${a} 12 12)"/>`).join("")}</g></svg>`;
const CORE_MOOD = /HARD|BOUNC|FAST GROOVE|SCHRANZ|INDUSTRIAL/;
export function storyDay(slug: string, title: string, day: string, city: string, items: WeekItem[], pg: { page: number; pages: number; total?: number }, issue: number | undefined, cta: { line: string; sub: string }, beat = 60 / 130): Slide {
  const T = 5;
  const rows = items
    .map((e, i) => {
      const t = flapClean(e.time).padEnd(T).slice(0, T);
      const lineup = [e.headliner || e.name, ...(e.support ?? [])].filter(Boolean);
      const moods = (e.moods?.length ? e.moods : [e.genre]).slice(0, 3);
      const chips = moods.map((m) => `<span class="chip mono${CORE_MOOD.test(m) || CORE.has(m) ? " core" : ""}">${esc(m)}</span>`).join("") + `<span class="chip mono sp">${esc(e.space || "CLUB")}</span>`;
      return `<div class="r" id="r${i}">
  <div class="tm"><div class="cells">${Array.from({ length: T }, (_, k) => `<i class="f" id="c${i}_${k}" data-ch="${esc(t[k])}"></i>`).join("")}</div>${e.end ? `<div class="end mono">→ ${esc(e.end)}</div>` : ""}<div class="ic">${e.daytime ? SUN : MOON}</div></div>
  <div class="bd"><div class="lu head"><b>${esc(lineup[0])}</b>${lineup.slice(1).map((x) => `<span class="sl"> / </span>${esc(x)}`).join("")}${e.cover ? ` <span class="pk">◉</span>` : e.pick ? ` <span class="pk">★</span>` : ""}</div>
  <div class="vn mono"><b>${esc(e.venue)}</b>${e.organizer ? `<span class="by"> · by ${esc(e.organizer)}</span>` : e.party ? `<span class="by"> · ${esc(e.party)}</span>` : ""}</div>
  <div class="tg">${chips}${e.price ? `<span class="pr mono">${esc(e.price)}</span>` : ""}</div></div>
</div>`;
    })
    .join("");
  const [dow, dd] = day.split(" ");
  const other = city === "Porto" ? "Lisbon" : "Porto";
  const body = `<div class="top">${stamp(issue, title)}<span class="tabs mono"><span class="tab on">${esc(city)}</span><span class="tab">${esc(other)}</span></span></div>
  <header><div class="mono kick">${esc(title)} · departures</div><h1 class="head big">${esc(dow)} <span class="hl">${esc(dd ?? "")}</span></h1></header>
  <div class="cityb mono"><span>${esc(city)}</span><span>${pg.total ?? items.length} ${(pg.total ?? items.length) === 1 ? "party" : "parties"}${pg.pages > 1 ? ` · ${pg.page}/${pg.pages}` : ""}</span></div>
  <main data-fit data-max="975" data-min="18">${rows}</main>
  <div class="cta"><div class="head c1">${esc(cta.line)}</div><div class="mono c2"><span>${esc(cta.sub)}</span><span>${pg.page < pg.pages ? "More →" : esc(BRAND.handle)}</span></div></div>
  <script>
  const B = ${beat}, F = ${JSON.stringify(FLAP)}, R = ${items.length}, N = ${T};
  const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) % F.length; };
  window.draw = (t) => {
    const frame = Math.round(t * 30);
    for (let i = 0; i < R; i++) {
      const t0 = 0.3 + i * B;
      const k0 = Math.min(1, Math.max(0, (t - t0) / 0.28)), ease = 1 - Math.pow(1 - k0, 3);
      const row = document.getElementById('r' + i);
      row.style.opacity = ease;
      row.style.transform = 'translateX(' + (-70 * (1 - ease)) + 'px)';
      for (let k = 0; k < N; k++) {
        const el = document.getElementById('c' + i + '_' + k), ch = el.dataset.ch;
        const settle = t0 + 0.18 + 0.05 * k;
        let out = '', flipping = false;
        if (ch !== ' ') { if (t >= settle) out = ch; else if (t >= t0) { out = F[hash(i * 31 + k, frame)]; flipping = true; } }
        el.textContent = out;
        el.classList.toggle('flip', flipping && frame % 2 === 0);
      }
    }
    document.querySelector('.cityb').style.opacity = Math.min(1, t / 0.25);
  };
  window.draw(0);
  </script>`;
  const extra = `${gridBg}${chipCss}
  html,body{width:1080px}
  .top{position:absolute;top:220px;left:72px;right:72px;display:flex;justify-content:space-between;align-items:center}
  .top .stamp .w{font-size:44px}
  .tabs{display:flex;gap:10px;font-size:22px}.tab{padding:.32em .6em .26em;border:2px solid rgba(244,244,242,.4);color:#9a9ca1}.tab.on{background:var(--white);color:var(--black);border-color:var(--white)}
  header{position:absolute;top:366px;left:72px;right:72px}
  .kick{display:inline-flex;align-items:center;gap:10px;font-size:23px;margin-bottom:6px}
  .kick::before{content:"";width:12px;height:12px;background:var(--white)}
  .big{font-size:150px;line-height:.86}
  .cityb{position:absolute;top:556px;left:72px;right:72px;display:flex;justify-content:space-between;font-size:23px;background:var(--white);color:var(--black);padding:11px 16px 9px}
  main{position:absolute;top:618px;left:72px;right:72px;font-size:40px;max-height:975px}
  .r{display:flex;gap:.6em;padding:.78em 0 .8em;border-bottom:1px solid rgba(244,244,242,.2)}
  .tm{flex:none;width:4.55em;display:flex;flex-direction:column;align-items:flex-start}
  .cells{display:flex;gap:3px}
  .f{width:.84em;height:1.28em;display:flex;align-items:center;justify-content:center;font-style:normal;font-family:"Geist Mono",monospace;font-weight:600;font-size:.74em;color:#f4f4f2;background:#1a1a1c;position:relative}
  .f::after{content:"";position:absolute;left:0;right:0;top:50%;height:2px;background:#0b0b0c}
  .f.flip{background:#2a2a2d;color:#cfd0d2;transform:scaleY(.82)}
  .end{font-size:.5em;color:#a9abaf;margin-top:.6em;letter-spacing:.04em}
  .ic{width:.7em;height:.7em;margin-top:.5em;color:#f4f4f2}.ic svg{width:100%;height:100%;display:block}
  .bd{flex:1;min-width:0}
  .lu{font-size:1em;line-height:1.14;padding-top:.06em;letter-spacing:-.025em;text-transform:uppercase;color:#d6d7da;font-weight:700;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .lu b{color:#f4f4f2;font-weight:900}.lu .sl{color:#77797e;font-weight:500}.lu .pk{color:#f4f4f2}
  .vn{font-size:.6em;line-height:1.3;margin-top:.62em;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#f4f4f2}.vn b{font-weight:600}.vn .by{color:#a9abaf}
  .tg{display:flex;flex-wrap:nowrap;gap:.34em;margin-top:.62em;align-items:center;overflow:hidden}
  .tg .chip{font-size:.46em;border-width:2px}
  .tg .chip.sp{border-style:dashed;color:#cfd0d2;border-color:rgba(244,244,242,.55)}
  .pr{margin-left:auto;font-size:.52em;color:#f4f4f2;flex:none;padding-left:.4em}
  .cta{position:absolute;left:72px;right:72px;top:1612px;border-top:2px solid rgba(244,244,242,.5);padding-top:20px}
  .c1{font-size:46px;letter-spacing:-.03em}.c2{display:flex;justify-content:space-between;font-size:21px;margin-top:10px;color:#cfd0d2}`;
  return { html: page(body, extra, 1920), width: 1080, height: 1920, name: `${slug}-story-${day.replace(/\s+/g, "").toLowerCase()}-${city.toLowerCase()}-${pg.page}` };
}

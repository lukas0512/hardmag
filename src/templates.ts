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
<link rel="stylesheet" href="${css}"><style>html,body{height:${h}px;overflow:hidden;position:relative}${extraCss}</style></head>
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
    <h1 class="head headline" data-fit data-max="${hasImg ? 420 : 760}" data-min="56">${paintHeadline(p.headline, p.highlight)}</h1>
    <div class="mono row"><span>${esc(BRAND.handle)}</span>${meter(p.issue)}<span>Full story → ${esc(site())}</span></div>
  </section>`;
  const extra = `${frameCss}
  .ph{position:absolute;inset:0;width:1080px;height:1350px;object-fit:cover;object-position:50% 30%;filter:contrast(1.08) saturate(.85) brightness(.95)}
  .shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,11,12,.35) 0%,rgba(11,11,12,0) 22%,rgba(11,11,12,0) 42%,rgba(11,11,12,.85) 70%,rgba(11,11,12,.97) 100%)}
  .ph.framed{inset:auto;top:0;left:0;width:1080px;height:${ph}px;object-fit:none;filter:contrast(1.05) saturate(.9)}
  .shade.framed{inset:auto;top:0;left:0;width:1080px;height:${ph + 2}px;background:linear-gradient(180deg,rgba(11,11,12,.6) 0%,rgba(11,11,12,0) 26%,rgba(11,11,12,0) 50%,rgba(11,11,12,.75) 82%,var(--black) 100%)}
  .type-bg{position:absolute;inset:0;background:var(--black);background-image:linear-gradient(rgba(244,244,242,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(244,244,242,.05) 1px,transparent 1px);background-size:90px 90px}
  section{position:absolute;left:var(--frame);right:var(--frame);bottom:92px}
  .headline{font-size:${hasImg ? 94 : 140}px;max-height:${hasImg ? 420 : 760}px}
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

export function agendaCover(slug: string, title: string, subtitle: string, kicker: string, issue: number | undefined, date: Date, total: number): Slide {
  const body = `${crop}
  <div class="top-left">${stamp(issue, kicker)}</div>
  <div class="top-right mono">${dotDate(date)}<br>Swipe →</div>
  <section><div class="mono kick">${esc(kicker)}</div>
  <h1 class="head big" data-fit data-max="700" data-min="70">${title}</h1>
  <p class="sub mono">${esc(subtitle)}</p>
  <div class="mono row"><span>${esc(BRAND.handle)}</span>${meter(issue)}<span>1 / ${total}</span></div></section>`;
  const extra = `${frameCss}${gridBg}
  section{position:absolute;left:var(--frame);right:var(--frame);bottom:92px}
  .big{font-size:150px;max-height:700px}
  .sub{font-size:26px;margin-top:30px;color:#cfd0d2;line-height:1.5}`;
  return { html: page(body, extra, 1350), width: 1080, height: 1350, name: `${slug}-1` };
}

export function agendaList(slug: string, heading: string, items: AgendaItem[], issue: number | undefined, date: Date, index: number, total: number): Slide {
  const rows = items
    .map((e) => `<div class="ev"><div class="when mono">${esc(e.day)} · ${esc(e.time)}</div><div class="name head">${esc(e.name)}</div><div class="where mono">${esc(e.venue)}${e.price ? ` · ${esc(e.price)}` : ""}${e.tags ? ` · ${esc(e.tags)}` : ""}</div></div>`)
    .join("");
  const body = `${crop}
  <div class="top-left">${stamp(issue, "Weekend")}</div>
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

export function pollCover(slug: string, question: string, highlight: string[], options: string[], issue: number | undefined, date: Date): Slide {
  // No options = a nomination: people tag their pick in the comments.
  const nominate = !options.length;
  const opts = nominate
    ? `<div class="opt"><span class="n mono">@</span><span class="head">Tag your pick</span></div><div class="opt"><span class="n mono">?</span><span class="head">Tell us why</span></div><div class="opt"><span class="n mono">+</span><span class="head">Tag who disagrees</span></div>`
    : options.map((o, i) => `<div class="opt"><span class="n mono">${String.fromCharCode(65 + i)}</span><span class="head">${esc(o)}</span></div>`).join("");
  const body = `${crop}
  <div class="top-left">${stamp(issue, nominate ? "Nominate" : "Vote")}</div>
  <div class="top-right mono">${dotDate(date)}<br>${nominate ? "Tag them in the comments" : "Comment A, B, C…"}</div>
  <main><div class="mono kick">Your call</div>
  <h1 class="head q" data-fit data-max="420" data-min="56">${paintHeadline(question, highlight)}</h1>
  <div class="opts" data-fit data-max="520" data-min="24">${opts}</div></main>
  <footer class="mono row"><span>${esc(BRAND.handle)}</span>${meter(issue)}<span>${nominate ? "Tag them in the comments 👇" : "Vote in the comments 👇"}</span></footer>`;
  const extra = `${frameCss}${gridBg}
  main{position:absolute;top:260px;left:var(--frame);right:var(--frame)}
  .q{font-size:96px;max-height:420px;margin-bottom:40px}
  .opts{font-size:44px;max-height:520px}
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

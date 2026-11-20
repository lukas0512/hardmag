// Builds the static hardmag.pt website from state/articles.json into ./site
// (deployed by GitHub Pages). Run: node src/site.ts
import fs from "node:fs";
import path from "node:path";
import { ROOT, BRAND } from "./config.ts";
import { loadArticles, articleUrl, type Article } from "./articles.ts";
import { paintHeadline, fmtDate, stamp, catalog } from "./templates.ts";
import { SOURCES } from "./sources.ts";

const OUT = path.join(ROOT, "site");
const SITE = BRAND.site.replace(/\/$/, "");
const HOST = SITE.replace(/^https?:\/\//, "");
const IG = `https://www.instagram.com/${BRAND.handle.replace(/^@/, "")}/`;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Beat = NonNullable<Article["beat"]>;
const SECTIONS: { beat: Beat; slug: string; name: string; blurb: string }[] = [
  { beat: "pt", slug: "lisbon", name: "Lisbon & Portugal", blurb: "Clubs, festivals, artists and nightlife politics from Lisbon, Porto and the rest of Portugal." },
  { beat: "tech", slug: "tech", name: "AI & Tech", blurb: "AI in electronic music, production tools, gear and the industry deals that change how music gets made." },
];
const beatOf = (a: Article): Beat => a.beat ?? SOURCES.find((x) => x.name === a.source)?.beat ?? "club";

const CSS = `
:root{--black:#0b0b0c;--ink-2:#151517;--ink-3:#1d1d20;--white:#f4f4f2;--soft:#d8d8d6;--grey:#8d8f94;--line:rgba(244,244,242,.16);--w:1240px;--gut:clamp(16px,4vw,32px)}
*{box-sizing:border-box;margin:0;padding:0}
html{background:var(--black);color:var(--white);-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%}
body{font-family:Geist,"Helvetica Neue",Arial,sans-serif;font-size:17px;line-height:1.55;min-height:100vh;display:flex;flex-direction:column;overflow-x:hidden}
a{color:inherit;text-decoration:none}
img{display:block;max-width:100%}
.wrap{width:100%;max-width:var(--w);margin:0 auto;padding:0 var(--gut)}
.mono,.label{font-family:"Geist Mono",ui-monospace,monospace;font-weight:500;text-transform:uppercase;letter-spacing:.05em;font-size:12px}
.head{font-weight:900;text-transform:uppercase;letter-spacing:-.045em;line-height:.93;text-wrap:balance}
.hl{font-style:italic;font-weight:300;letter-spacing:-.03em}
.stamp{display:inline-flex;flex-direction:column;gap:4px;background:var(--white);color:var(--black);padding:8px 11px 7px}
.stamp .w{font-weight:900;font-size:clamp(24px,5vw,32px);letter-spacing:-.06em;line-height:.8}
.stamp .n{display:flex;justify-content:space-between;gap:12px;font-size:9.5px;border-top:1.5px solid var(--black);padding-top:4px}
:focus-visible{outline:2px solid var(--white);outline-offset:3px}

/* header */
header.site{position:sticky;top:0;z-index:20;background:rgba(11,11,12,.86);backdrop-filter:saturate(1.4) blur(14px);-webkit-backdrop-filter:saturate(1.4) blur(14px);border-bottom:1px solid var(--line)}
header.site .row{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:12px 0}
nav.main{display:flex;gap:4px;align-items:center}
nav.main a{padding:10px 12px;border-radius:2px;color:var(--soft)}
nav.main a:hover,nav.main a[aria-current]{color:var(--white);background:var(--ink-3)}
nav.main a.ig{border:1px solid var(--line)}
.ticker{border-bottom:1px solid var(--line);overflow:hidden;white-space:nowrap;background:var(--black)}
.ticker .track{display:inline-flex;gap:48px;padding:9px 0;animation:tick 60s linear infinite}
.ticker a{color:var(--soft)}.ticker a:hover{color:var(--white)}
.ticker b{color:var(--grey);font-weight:500;margin-right:10px}
@keyframes tick{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@media (prefers-reduced-motion:reduce){.ticker .track{animation:none}}

main{flex:1;padding:28px 0 80px}
.kicker{display:inline-flex;align-items:center;gap:8px;color:var(--soft)}
.kicker::before{content:"";width:8px;height:8px;background:var(--white)}
.photo{position:relative;background:var(--ink-2);overflow:hidden}
.photo img{width:100%;height:100%;object-fit:cover;transition:transform .6s ease,filter .6s ease;filter:contrast(1.04) saturate(.92)}
a:hover .photo img{transform:scale(1.025)}
.cat{color:var(--grey)}
.sec-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:14px 0 12px;border-top:2px solid var(--white);margin:44px 0 18px}
.sec-head h2{font-size:clamp(22px,3.4vw,30px)}
.sec-head a{color:var(--grey)}.sec-head a:hover{color:var(--white)}

/* lead */
.lead{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,1fr);gap:clamp(18px,3vw,40px);align-items:center}
.lead .photo{aspect-ratio:4/3}
.lead h2{font-size:clamp(32px,3.7vw,58px);margin:14px 0 16px;overflow-wrap:anywhere}
.lead p{color:var(--soft);font-size:clamp(16px,1.5vw,19px);max-width:52ch}
.lead .meta{margin-top:16px}
.meta{display:flex;justify-content:space-between;gap:10px;color:var(--grey)}

/* cards */
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:34px 24px}
.card .photo{aspect-ratio:3/2;margin-bottom:14px}
.card h3{font-size:clamp(20px,2vw,25px);margin:10px 0 8px}
.card p{font-size:15px;color:#b9babd;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;margin-bottom:10px}
.rail{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px}
.rail .card h3{font-size:19px}
.rail .card p{display:none}
.empty{padding:90px 0;text-align:center}.empty h2{font-size:clamp(44px,8vw,110px)}
.page-intro{max-width:760px;margin-bottom:8px}
.page-intro h1{font-size:clamp(40px,7vw,92px);margin:10px 0 14px}
.page-intro p{color:var(--soft);font-size:18px}

/* article */
.art-head{max-width:980px}
.art-head h1{font-size:clamp(34px,6.4vw,88px);margin:14px 0 20px;overflow-wrap:anywhere}
.standfirst{font-size:clamp(19px,2vw,24px);line-height:1.42;color:#e6e6e4;font-weight:500;max-width:760px}
.hero{margin:28px 0 8px}
.hero .photo{aspect-ratio:16/9;max-height:78vh}
.credit{color:var(--grey);text-align:right;margin-top:8px}
.art-grid{display:grid;grid-template-columns:minmax(0,200px) minmax(0,720px);gap:48px;margin-top:30px}
.aside{position:sticky;top:110px;align-self:start;display:flex;flex-direction:column;gap:14px;color:var(--grey)}
.aside .big{font-size:26px;color:var(--white);font-weight:800;letter-spacing:-.03em}
.share{display:flex;flex-wrap:wrap;gap:6px}
.share a,.share button{font:inherit;color:var(--soft);background:none;border:1px solid var(--line);padding:9px 11px;cursor:pointer}
.share a:hover,.share button:hover{color:var(--white);border-color:var(--white)}
.body p{margin-bottom:1.1em;font-size:clamp(17px,1.6vw,19px);line-height:1.68;color:#e2e2e0}
.body p:first-child{font-size:clamp(19px,1.9vw,22px);color:var(--white);font-weight:500;line-height:1.5}
.points{margin:34px 0 10px;border-top:2px solid var(--white)}
.points .pt{display:grid;grid-template-columns:56px 1fr;gap:10px;padding:20px 0;border-bottom:1px solid var(--line)}
.points .n{color:var(--grey);padding-top:4px}
.points h3{font-size:23px;margin-bottom:6px}
.points p{color:var(--soft)}
.source{margin-top:30px;padding-top:14px;border-top:1px solid var(--line);color:var(--grey)}
.source a{color:var(--white);text-decoration:underline;text-underline-offset:3px}
.tags{margin-top:10px;color:var(--grey);word-break:break-word}
.follow{display:flex;justify-content:space-between;align-items:center;gap:18px;margin-top:40px;padding:22px;background:var(--ink-2);border:1px solid var(--line)}
.follow h3{font-size:24px}
.follow .btn{background:var(--white);color:var(--black);padding:12px 16px;white-space:nowrap}

/* footer */
footer.site{border-top:1px solid var(--line);padding:40px 0 48px;background:var(--black)}
footer.site .cols{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:28px;align-items:start}
footer.site p{color:var(--grey);font-size:15px;max-width:42ch;margin-top:14px}
footer.site h4{color:var(--grey);margin-bottom:10px}
footer.site ul{list-style:none;display:grid;gap:8px}
footer.site a:hover{color:var(--grey)}
footer.site .legal{margin-top:34px;padding-top:16px;border-top:1px solid var(--line);color:var(--grey);display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
.about{max-width:780px}.about h1{font-size:clamp(44px,8vw,96px);margin:14px 0 26px}.about p{font-size:20px;margin-bottom:1em;color:#dcdcda}.about a{text-decoration:underline}

@media (max-width:980px){
  .grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .rail{grid-template-columns:repeat(2,minmax(0,1fr))}
  .art-grid{grid-template-columns:minmax(0,1fr);gap:22px}
  .aside{position:static;flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:space-between;padding:12px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
  .aside .big{display:none}
  footer.site .cols{grid-template-columns:1fr 1fr}
  footer.site .cols>div:first-child{grid-column:1/-1}
}
@media (max-width:700px){
  header.site .row{flex-wrap:wrap;padding:10px 0 0}
  nav.main{width:calc(100% + 2*var(--gut));margin:0 calc(-1*var(--gut));padding:6px var(--gut) 8px;overflow-x:auto;scrollbar-width:none;gap:2px}
  nav.main::-webkit-scrollbar{display:none}
  nav.main a{padding:9px 10px;white-space:nowrap}
  main{padding-top:18px}
  .lead{grid-template-columns:1fr;gap:14px}
  .lead .photo{aspect-ratio:4/5;margin:0 calc(-1*var(--gut))}
  .grid{grid-template-columns:1fr;gap:0}
  .grid .card,.rail .card{display:grid;grid-template-columns:104px 1fr;gap:4px 14px;padding:14px 0;border-bottom:1px solid var(--line)}
  .grid .card .photo,.rail .card .photo{grid-row:1/4;aspect-ratio:1/1;margin:0;width:104px}
  .grid .card h3,.rail .card h3{font-size:18px;margin:4px 0 2px}
  .grid .card p{display:none}
  .grid .card .meta,.rail .card .meta{align-self:end}
  .rail{grid-template-columns:1fr;gap:0}
  .hero .photo{margin:0 calc(-1*var(--gut));aspect-ratio:4/3}
  .follow{flex-direction:column;align-items:flex-start}
  .sec-head{margin-top:32px}
}`;

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:ital,wght@0,300..900;1,300..900&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">`;

function layout(o: { title: string; description: string; url: string; image?: string; body: string; type?: string; jsonld?: string; current?: string; all: Article[] }) {
  const latest = o.all[0]?.issue;
  const nav = [["/", "Latest"], ["/lisbon/", "Lisbon"], ["/tech/", "AI & Tech"], ["/about/", "About"]];
  const tick = o.all.slice(0, 8).map((a) => `<a href="/news/${a.slug}/"><b>${catalog(a.issue)}</b>${esc(a.headline)}</a>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0b0b0c">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<link rel="canonical" href="${o.url}">
<meta property="og:site_name" content="${esc(BRAND.name)}"><meta property="og:type" content="${o.type ?? "website"}">
<meta property="og:title" content="${esc(o.title)}"><meta property="og:description" content="${esc(o.description)}">
<meta property="og:url" content="${o.url}">${o.image ? `<meta property="og:image" content="${o.image}"><meta name="twitter:card" content="summary_large_image">` : ""}
<link rel="alternate" type="application/rss+xml" title="${esc(BRAND.name)}" href="${SITE}/feed.xml">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
${FONTS}<link rel="stylesheet" href="/style.css?v=3">${o.jsonld ? `<script type="application/ld+json">${o.jsonld}</script>` : ""}
</head><body>
<header class="site"><div class="wrap"><div class="row">
  <a href="/" aria-label="${esc(BRAND.name)} home">${stamp(latest, "News")}</a>
  <nav class="main label" aria-label="Sections">${nav.map(([href, name]) => `<a href="${href}"${o.current === href ? ' aria-current="page"' : ""}>${name}</a>`).join("")}<a class="ig" href="${IG}" rel="noopener" aria-label="Instagram">IG ↗</a></nav>
</div></div>
${tick ? `<div class="ticker label" aria-hidden="true"><div class="track">${tick}${tick}</div></div>` : ""}
</header>
<main><div class="wrap">${o.body}</div></main>
<footer class="site"><div class="wrap">
  <div class="cols">
    <div>${stamp(latest, "News")}<p>Techno, house and club culture, every day. Lisbon and Portugal, AI and music technology, and the stories that move the floor.</p></div>
    <div><h4 class="label">Sections</h4><ul class="label"><li><a href="/">Latest</a></li>${SECTIONS.map((s) => `<li><a href="/${s.slug}/">${s.name}</a></li>`).join("")}<li><a href="/about/">About</a></li></ul></div>
    <div><h4 class="label">Follow</h4><ul class="label"><li><a href="${IG}" rel="noopener">Instagram ${esc(BRAND.handle)}</a></li><li><a href="/feed.xml">RSS feed</a></li><li><a href="mailto:hello@${HOST}">hello@${HOST}</a></li></ul></div>
  </div>
  <div class="legal label"><span>© ${new Date().getUTCFullYear()} ${esc(BRAND.name)}</span><span>Every story credits its original reporting</span></div>
</div></footer>
</body></html>`;
}

const img = (a: Article, eager = false) =>
  a.image
    ? `<div class="photo"><img src="${a.image}" alt="" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></div>`
    : `<div class="photo"></div>`;

const meta = (a: Article) =>
  `<div class="meta label"><span>${catalog(a.issue)}</span><time datetime="${a.date}">${fmtDate(new Date(a.date))}</time></div>`;

const card = (a: Article) => `<a class="card" href="/news/${a.slug}/">
  ${img(a)}<span class="kicker label">${esc(a.kicker)}</span>
  <h3 class="head">${paintHeadline(a.headline, a.highlight)}</h3>
  <p>${esc(a.standfirst)}</p>${meta(a)}</a>`;

const lead = (a: Article) => `<a class="lead" href="/news/${a.slug}/">${img(a, true)}<div>
  <span class="kicker label">${esc(a.kicker)}</span>
  <h2 class="head">${paintHeadline(a.headline, a.highlight)}</h2>
  <p>${esc(a.standfirst)}</p>${meta(a)}</div></a>`;

function home(all: Article[]) {
  const [first, ...rest] = all;
  let body: string;
  if (!first) {
    body = `<div class="empty"><span class="kicker label">First edition</span><h2 class="head">News from the floor, <span class="hl">daily.</span></h2>
      <p class="label" style="margin-top:18px">The first stories land today · follow <a href="${IG}">${esc(BRAND.handle)}</a></p></div>`;
  } else {
    body = lead(first);
    body += `<div class="sec-head"><h2 class="head">Latest</h2><span class="label cat">${all.length} stories</span></div><section class="grid">${rest.slice(0, 12).map(card).join("")}</section>`;
    for (const s of SECTIONS) {
      const items = all.filter((a) => beatOf(a) === s.beat).slice(0, 4);
      if (items.length) body += `<div class="sec-head"><h2 class="head">${s.name}</h2><a class="label" href="/${s.slug}/">All →</a></div><section class="rail">${items.map(card).join("")}</section>`;
    }
    if (rest.length > 12) body += `<div class="sec-head"><h2 class="head">Archive</h2></div><section class="rail">${rest.slice(12, 60).map(card).join("")}</section>`;
  }
  return layout({
    title: `${BRAND.name} — Techno, house & club culture news`,
    description: "Daily news on techno, house and club culture, Lisbon and Portugal, and AI in electronic music.",
    url: `${SITE}/`,
    body,
    current: "/",
    all,
  });
}

function sectionPage(s: (typeof SECTIONS)[number], all: Article[]) {
  const items = all.filter((a) => beatOf(a) === s.beat);
  const body = `<div class="page-intro"><span class="kicker label">Section</span><h1 class="head">${esc(s.name)}</h1><p>${esc(s.blurb)}</p></div>
    ${items.length ? `<div class="sec-head"><h2 class="head">Latest</h2><span class="label cat">${items.length} stories</span></div><section class="grid">${items.map(card).join("")}</section>` : `<p class="label cat" style="margin-top:30px">First stories coming soon.</p>`}`;
  return layout({ title: `${s.name} — ${BRAND.name}`, description: s.blurb, url: `${SITE}/${s.slug}/`, body, current: `/${s.slug}/`, all });
}

function articlePage(a: Article, all: Article[]) {
  const url = articleUrl(a.slug);
  const more = all.filter((x) => x.slug !== a.slug).slice(0, 4);
  const jsonld = JSON.stringify({
    "@context": "https://schema.org", "@type": "NewsArticle", headline: a.headline, datePublished: a.date,
    image: a.image ? [a.image] : undefined, publisher: { "@type": "Organization", name: BRAND.name, url: SITE },
    mainEntityOfPage: url, isBasedOn: a.sourceUrl,
  });
  const enc = encodeURIComponent;
  const body = `<article>
    <header class="art-head">
      <span class="kicker label">${esc(a.kicker)}</span>
      <h1 class="head">${paintHeadline(a.headline, a.highlight)}</h1>
      <p class="standfirst">${esc(a.standfirst)}</p>
    </header>
    ${a.image ? `<figure class="hero">${img(a, true)}<figcaption class="credit label">Photo via ${esc(a.source)}</figcaption></figure>` : ""}
    <div class="art-grid">
      <aside class="aside label">
        <span class="big">${catalog(a.issue)}</span>
        <span>${fmtDate(new Date(a.date))}</span>
        <span>Via ${esc(a.source)}</span>
        <div class="share">
          <a href="https://wa.me/?text=${enc(a.headline + " " + url)}" rel="noopener">WhatsApp</a>
          <a href="https://x.com/intent/post?text=${enc(a.headline)}&url=${enc(url)}" rel="noopener">X</a>
          <button type="button" onclick="navigator.clipboard.writeText('${url}');this.textContent='Copied'">Copy link</button>
        </div>
      </aside>
      <div>
        <div class="body">${a.body.map((p) => `<p>${esc(p)}</p>`).join("")}</div>
        ${a.points?.length ? `<section class="points">${a.points.map((pt, i) => `<div class="pt"><span class="n label">${String(i + 1).padStart(2, "0")}</span><div><h3 class="head">${esc(pt.title)}</h3><p>${esc(pt.text)}</p></div></div>`).join("")}</section>` : ""}
        <p class="source label">Original reporting: <a href="${esc(a.sourceUrl)}" rel="noopener">${esc(a.source)}</a></p>
        ${a.hashtags.length ? `<p class="tags label">${a.hashtags.map((t) => `#${esc(t)}`).join(" ")}</p>` : ""}
        <div class="follow"><div><span class="label cat">Daily on Instagram</span><h3 class="head">Get the news first</h3></div><a class="btn label" href="${IG}" rel="noopener">Follow ${esc(BRAND.handle)}</a></div>
      </div>
    </div>
  </article>
  ${more.length ? `<div class="sec-head"><h2 class="head">More news</h2><a class="label" href="/">All →</a></div><section class="rail">${more.map(card).join("")}</section>` : ""}`;
  return layout({ title: `${a.headline} — ${BRAND.name}`, description: a.standfirst, url, image: a.image, body, type: "article", jsonld, all });
}

function about(all: Article[]) {
  return layout({
    title: `About — ${BRAND.name}`,
    description: `${BRAND.name} is a daily news desk for techno, house and club culture.`,
    url: `${SITE}/about/`,
    current: "/about/",
    all,
    body: `<div class="about"><span class="kicker label">About</span><h1 class="head">News from the floor, <span class="hl">daily.</span></h1>
      <p>${BRAND.name} follows techno, house and club culture: releases, lineups, clubs, scenes and the people who make them. We give extra room to Lisbon and Portugal, and to how AI and new technology are changing electronic music.</p>
      <p>Every story credits and links the outlet that first reported it. If you are a photographer or publication and want an image removed, write to <a href="mailto:hello@${HOST}">hello@${HOST}</a> and we take it down the same day.</p>
      <p>Follow us on Instagram: <a href="${IG}">${esc(BRAND.handle)}</a>.</p></div>`,
  });
}

function feed(all: Article[]) {
  const items = all.slice(0, 40).map((a) => `<item><title>${esc(a.headline)}</title><link>${articleUrl(a.slug)}</link><guid>${articleUrl(a.slug)}</guid><pubDate>${new Date(a.date).toUTCString()}</pubDate><description>${esc(a.standfirst)}</description></item>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(BRAND.name)}</title><link>${SITE}/</link><description>Techno, house and club culture news</description>${items}</channel></rss>`;
}

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#0b0b0c"/><rect x="6" y="14" width="52" height="36" fill="#f4f4f2"/><text x="32" y="42" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="27" letter-spacing="-2" fill="#0b0b0c">HM</text></svg>`;

export function buildSite() {
  const all = loadArticles();
  fs.rmSync(OUT, { recursive: true, force: true });
  const write = (rel: string, s: string) => {
    const f = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, s);
  };
  write("style.css", CSS.trim());
  write("favicon.svg", FAVICON);
  write("index.html", home(all));
  for (const s of SECTIONS) write(`${s.slug}/index.html`, sectionPage(s, all));
  write("about/index.html", about(all));
  write("feed.xml", feed(all));
  write("404.html", layout({ title: `Not found — ${BRAND.name}`, description: "", url: `${SITE}/404.html`, all, body: `<div class="empty"><h2 class="head">Off the <span class="hl">floor.</span></h2><p class="label" style="margin-top:16px"><a href="/">Back to the news</a></p></div>` }));
  write("CNAME", HOST + "\n");
  write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
  write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE}/</loc></url>${SECTIONS.map((s) => `<url><loc>${SITE}/${s.slug}/</loc></url>`).join("")}<url><loc>${SITE}/about/</loc></url>${all.map((a) => `<url><loc>${articleUrl(a.slug)}</loc><lastmod>${a.date.slice(0, 10)}</lastmod></url>`).join("")}</urlset>`);
  for (const a of all) write(`news/${a.slug}/index.html`, articlePage(a, all));
  return all.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`site: ${buildSite()} article(s) → ${path.relative(process.cwd(), OUT)}/`);
}

// Builds the static hardmag.pt website from state/articles.json into ./site
// (deployed by GitHub Pages). Run: node src/site.ts
import fs from "node:fs";
import path from "node:path";
import { ROOT, BRAND } from "./config.ts";
import { loadArticles, articleUrl, type Article } from "./articles.ts";
import { paintHeadline, fmtDate } from "./templates.ts";

const OUT = path.join(ROOT, "site");
const SITE = BRAND.site.replace(/\/$/, "");
const HOST = SITE.replace(/^https?:\/\//, "");
const IG = `https://www.instagram.com/${BRAND.handle.replace(/^@/, "")}/`;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CSS = `
:root{--paper:#ece6da;--paper-2:#e2dbcc;--ink:#15130f;--ink-2:#5a5447;--red:#d42a1c;--w:1180px}
*{box-sizing:border-box;margin:0;padding:0}
html{background:var(--paper);color:var(--ink);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
body{font-family:"Newsreader",Georgia,serif;font-size:20px;line-height:1.55;min-height:100vh;display:flex;flex-direction:column}
a{color:inherit;text-decoration:none}
.wrap{width:100%;max-width:var(--w);margin:0 auto;padding:0 20px}
.label{font-family:"IBM Plex Sans Condensed","Arial Narrow",sans-serif;font-weight:600;text-transform:uppercase;letter-spacing:.06em;font-size:14px}
.red,.hl{color:var(--red)} .hl{font-style:italic}
.mast{font-weight:800;letter-spacing:-.045em;line-height:1;font-variation-settings:"opsz" 72}
.mast .dot{color:var(--red)}
header.site{padding-top:22px}
header.site .row{display:flex;justify-content:space-between;align-items:flex-end;gap:16px}
header.site .mast{font-size:clamp(44px,8vw,76px)}
header.site nav{display:flex;gap:18px;padding-bottom:10px}
header.site nav a:hover{color:var(--red)}
.rules{margin-top:12px}.rules i{display:block;background:var(--ink)}.rules i:first-child{height:3px}.rules i:last-child{height:1px;margin-top:4px}
.dateline{display:flex;justify-content:space-between;padding:8px 0 0;color:var(--ink-2)}
main{flex:1;padding:36px 0 64px}
.kicker{display:inline-flex;align-items:center;gap:10px;color:var(--red)}
.kicker::before{content:"";width:11px;height:11px;background:var(--red)}
.display{font-weight:600;letter-spacing:-.022em;line-height:1.02;font-variation-settings:"opsz" 72}
.photo{background:var(--ink);overflow:hidden}
.photo img{display:block;width:100%;height:100%;object-fit:cover;filter:grayscale(1) contrast(1.12);mix-blend-mode:luminosity}
.credit{color:var(--ink-2);text-align:right;margin-top:6px;font-size:12px}
/* home */
.lead{display:grid;grid-template-columns:1.35fr 1fr;gap:36px;padding-bottom:36px;border-bottom:1px solid var(--ink)}
.lead .photo{aspect-ratio:4/3}
.lead h2{font-size:clamp(36px,5vw,62px);margin:12px 0 16px}
.lead p{font-size:21px;color:var(--ink-2)}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:0;margin-top:8px}
.card{padding:24px 22px 26px;border-bottom:1px solid var(--ink)}
.card:not(:nth-child(3n)){border-right:1px solid var(--ink)}
.card:nth-child(3n+1){padding-left:0}.card:nth-child(3n){padding-right:0}
.card .photo{aspect-ratio:3/2;margin-bottom:14px}
.card h3{font-size:27px;margin:8px 0 8px}
.card p{font-size:17px;color:var(--ink-2);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.card time,.lead time{color:var(--ink-2)}
a:hover h2,a:hover h3{text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:5px}
.empty{padding:80px 0;text-align:center}
.empty h2{font-size:clamp(40px,6vw,72px)}
/* article */
article{max-width:760px;margin:0 auto}
article h1{font-size:clamp(40px,6.4vw,74px);margin:14px 0 18px}
article .standfirst{font-size:25px;line-height:1.4;color:var(--ink-2);margin-bottom:22px}
article .byline{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;border-top:1px solid var(--ink);border-bottom:1px solid var(--ink);padding:10px 0;margin-bottom:28px}
article figure{margin:0 -40px 30px}
article figure .photo{aspect-ratio:16/10}
article .body p{margin-bottom:1em;font-size:21px}
article .body p:first-child::first-letter{float:left;font-size:4.1em;line-height:.8;font-weight:700;color:var(--red);padding:.05em .08em 0 0}
.source{margin-top:30px;padding-top:14px;border-top:3px double var(--ink);color:var(--ink-2)}
.source a{color:var(--red);text-decoration:underline}
.tags{margin-top:12px;color:var(--ink-2)}
.more{margin-top:56px}
.more h4{border-bottom:1px solid var(--ink);padding-bottom:6px;margin-bottom:4px}
.more a{display:block;padding:14px 0;border-bottom:1px solid var(--ink-2);font-size:24px;font-weight:600;line-height:1.2}
.more a:hover{color:var(--red)}
footer.site{border-top:3px solid var(--ink);padding:22px 0 34px}
footer.site .row{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:center}
footer.site .mast{font-size:34px}
.about{max-width:760px}
.about h1{font-size:clamp(40px,6vw,70px);margin-bottom:20px}
.about p{font-size:22px;margin-bottom:1em}
@media (max-width:820px){
  .lead{grid-template-columns:1fr;gap:18px}
  .grid{grid-template-columns:1fr}
  .card,.card:nth-child(n){padding:22px 0;border-right:0}
  article figure{margin:0 0 24px}
  header.site nav{gap:12px}
  .dateline span:last-child{display:none}
}`;

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400..800;1,6..72,400..800&family=IBM+Plex+Sans+Condensed:wght@500;600&display=swap" rel="stylesheet">`;

const mast = () => `<span class="mast">${esc(BRAND.name.charAt(0) + BRAND.name.slice(1).toLowerCase())}<span class="dot">.</span></span>`;

function layout(o: { title: string; description: string; url: string; image?: string; body: string; type?: string; jsonld?: string }) {
  const today = fmtDate(new Date());
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<link rel="canonical" href="${o.url}">
<meta property="og:site_name" content="${esc(BRAND.name)}"><meta property="og:type" content="${o.type ?? "website"}">
<meta property="og:title" content="${esc(o.title)}"><meta property="og:description" content="${esc(o.description)}">
<meta property="og:url" content="${o.url}">${o.image ? `<meta property="og:image" content="${o.image}"><meta name="twitter:card" content="summary_large_image">` : ""}
<link rel="alternate" type="application/rss+xml" title="${esc(BRAND.name)}" href="${SITE}/feed.xml">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
${FONTS}<link rel="stylesheet" href="/style.css">${o.jsonld ? `<script type="application/ld+json">${o.jsonld}</script>` : ""}
</head><body>
<header class="site"><div class="wrap">
  <div class="row"><a href="/" aria-label="${esc(BRAND.name)} home">${mast()}</a>
  <nav class="label"><a href="/">News</a><a href="/about/">About</a><a href="${IG}">Instagram</a></nav></div>
  <div class="rules"><i></i><i></i></div>
  <div class="dateline label"><span>${today}</span><span>Techno, house &amp; club culture</span></div>
</div></header>
<main><div class="wrap">${o.body}</div></main>
<footer class="site"><div class="wrap"><div class="row">${mast()}
  <span class="label">News from the floor · <a href="${IG}">${esc(BRAND.handle)}</a> · <a href="/feed.xml">RSS</a></span></div></div></footer>
</body></html>`;
}

const photo = (a: Article) =>
  a.image ? `<div class="photo"><img src="${a.image}" alt="" loading="lazy"></div>` : "";

const card = (a: Article) => `<a class="card" href="/news/${a.slug}/">
  ${photo(a)}<span class="kicker label">${esc(a.kicker)}</span>
  <h3 class="display">${paintHeadline(a.headline, a.highlight)}</h3>
  <p>${esc(a.standfirst)}</p><time class="label" datetime="${a.date}">${fmtDate(new Date(a.date))}</time></a>`;

function home(all: Article[]) {
  const [lead, ...rest] = all;
  const body = lead
    ? `<a class="lead" href="/news/${lead.slug}/">${photo(lead)}<div>
        <span class="kicker label">${esc(lead.kicker)}</span>
        <h2 class="display">${paintHeadline(lead.headline, lead.highlight)}</h2>
        <p>${esc(lead.standfirst)}</p>
        <time class="label" datetime="${lead.date}">${fmtDate(new Date(lead.date))} · ${esc(lead.source)}</time></div></a>
       <section class="grid">${rest.slice(0, 60).map(card).join("")}</section>`
    : `<div class="empty"><span class="kicker label">First edition</span><h2 class="display">News from the floor, <span class="hl">daily.</span></h2>
       <p class="label" style="margin-top:18px">The first stories land today · follow <a class="red" href="${IG}">${esc(BRAND.handle)}</a></p></div>`;
  return layout({
    title: `${BRAND.name} — Techno, house & club culture news`,
    description: "Daily news on techno, house and club culture: releases, lineups, clubs and scenes.",
    url: `${SITE}/`,
    body,
  });
}

function articlePage(a: Article, all: Article[]) {
  const url = articleUrl(a.slug);
  const more = all.filter((x) => x.slug !== a.slug).slice(0, 5);
  const plain = a.headline;
  const jsonld = JSON.stringify({
    "@context": "https://schema.org", "@type": "NewsArticle", headline: plain, datePublished: a.date,
    image: a.image ? [a.image] : undefined, publisher: { "@type": "Organization", name: BRAND.name, url: SITE },
    mainEntityOfPage: url, isBasedOn: a.sourceUrl,
  });
  const body = `<article>
    <span class="kicker label">${esc(a.kicker)}</span>
    <h1 class="display">${paintHeadline(a.headline, a.highlight)}</h1>
    <p class="standfirst">${esc(a.standfirst)}</p>
    <div class="byline label"><span>${BRAND.name} newsdesk</span><time datetime="${a.date}">${fmtDate(new Date(a.date))}</time></div>
    ${a.image ? `<figure>${photo(a)}<figcaption class="credit label">Photo via ${esc(a.source)}</figcaption></figure>` : ""}
    <div class="body">${a.body.map((p) => `<p>${esc(p)}</p>`).join("")}</div>
    <p class="source label">Original reporting: <a href="${esc(a.sourceUrl)}" rel="noopener">${esc(a.source)}</a></p>
    ${a.hashtags.length ? `<p class="tags label">${a.hashtags.map((t) => `#${esc(t)}`).join(" ")}</p>` : ""}
    ${more.length ? `<section class="more"><h4 class="label">More news</h4>${more.map((m) => `<a href="/news/${m.slug}/">${esc(m.headline)}</a>`).join("")}</section>` : ""}
  </article>`;
  return layout({ title: `${plain} — ${BRAND.name}`, description: a.standfirst, url, image: a.image, body, type: "article", jsonld });
}

function about() {
  return layout({
    title: `About — ${BRAND.name}`,
    description: `${BRAND.name} is a daily news desk for techno, house and club culture.`,
    url: `${SITE}/about/`,
    body: `<div class="about"><span class="kicker label">About</span><h1 class="display">News from the floor, <span class="hl">daily.</span></h1>
      <p>${BRAND.name} follows techno, house and club culture: releases, lineups, clubs, scenes and the people who make them.</p>
      <p>Every story credits and links the outlet that first reported it. If you are a photographer or publication and want an image removed, write to <a class="red" href="mailto:hello@${HOST}">hello@${HOST}</a> and we take it down the same day.</p>
      <p>Follow us on Instagram: <a class="red" href="${IG}">${esc(BRAND.handle)}</a>.</p></div>`,
  });
}

function feed(all: Article[]) {
  const items = all.slice(0, 40).map((a) => `<item><title>${esc(a.headline)}</title><link>${articleUrl(a.slug)}</link><guid>${articleUrl(a.slug)}</guid><pubDate>${new Date(a.date).toUTCString()}</pubDate><description>${esc(a.standfirst)}</description></item>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(BRAND.name)}</title><link>${SITE}/</link><description>Techno, house and club culture news</description>${items}</channel></rss>`;
}

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#ece6da"/><text x="8" y="52" font-family="Georgia,serif" font-weight="800" font-size="56" fill="#15130f">H</text><circle cx="53" cy="49" r="6" fill="#d42a1c"/></svg>`;

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
  write("about/index.html", about());
  write("feed.xml", feed(all));
  write("404.html", layout({ title: `Not found — ${BRAND.name}`, description: "", url: `${SITE}/404.html`, body: `<div class="empty"><h2 class="display">Off the <span class="hl">floor.</span></h2><p class="label" style="margin-top:16px"><a class="red" href="/">Back to the news</a></p></div>` }));
  write("CNAME", HOST + "\n");
  write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
  write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE}/</loc></url><url><loc>${SITE}/about/</loc></url>${all.map((a) => `<url><loc>${articleUrl(a.slug)}</loc><lastmod>${a.date.slice(0, 10)}</lastmod></url>`).join("")}</urlset>`);
  for (const a of all) write(`news/${a.slug}/index.html`, articlePage(a, all));
  return all.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`site: ${buildSite()} article(s) → ${path.relative(process.cwd(), OUT)}/`);
}

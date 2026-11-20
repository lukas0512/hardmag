// Builds the static hardmag.pt website from state/articles.json into ./site
// (deployed by GitHub Pages). Run: node src/site.ts
import fs from "node:fs";
import path from "node:path";
import { ROOT, BRAND } from "./config.ts";
import { loadArticles, articleUrl, type Article } from "./articles.ts";
import { paintHeadline, fmtDate, stamp, catalog } from "./templates.ts";

const OUT = path.join(ROOT, "site");
const SITE = BRAND.site.replace(/\/$/, "");
const HOST = SITE.replace(/^https?:\/\//, "");
const IG = `https://www.instagram.com/${BRAND.handle.replace(/^@/, "")}/`;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CSS = `
:root{--black:#0b0b0c;--ink-2:#17171a;--white:#f4f4f2;--grey:#8d8f94;--line:rgba(244,244,242,.18);--w:1240px}
*{box-sizing:border-box;margin:0;padding:0}
html{background:var(--black);color:var(--white);-webkit-font-smoothing:antialiased}
body{font-family:Geist,"Helvetica Neue",Arial,sans-serif;font-size:18px;line-height:1.55;min-height:100vh;display:flex;flex-direction:column}
a{color:inherit;text-decoration:none}
.wrap{width:100%;max-width:var(--w);margin:0 auto;padding:0 20px}
.mono,.label{font-family:"Geist Mono",ui-monospace,monospace;font-weight:500;text-transform:uppercase;letter-spacing:.05em;font-size:13px}
.head,.display{font-weight:900;text-transform:uppercase;letter-spacing:-.045em;line-height:.93}
.hl{font-style:italic;font-weight:300;letter-spacing:-.03em}
.stamp{display:inline-flex;flex-direction:column;gap:5px;background:var(--white);color:var(--black);padding:10px 13px 8px}
.stamp .w{font-weight:900;font-size:34px;letter-spacing:-.06em;line-height:.8}
.stamp .n{display:flex;justify-content:space-between;gap:14px;font-size:10px;border-top:1.5px solid var(--black);padding-top:5px}
header.site{padding:22px 0 0}
header.site .row{display:flex;justify-content:space-between;align-items:center;gap:16px;padding-bottom:18px;border-bottom:1px solid var(--line)}
header.site nav{display:flex;gap:22px}
header.site nav a:hover,footer a:hover{color:var(--grey)}
.dateline{display:flex;justify-content:space-between;padding:10px 0;color:var(--grey);border-bottom:1px solid var(--line)}
main{flex:1;padding:28px 0 72px}
.kicker{display:inline-flex;align-items:center;gap:8px}
.kicker::before{content:"";width:9px;height:9px;background:var(--white)}
.photo{background:var(--ink-2);overflow:hidden;position:relative}
.photo img{display:block;width:100%;height:100%;object-fit:cover;filter:contrast(1.06) saturate(.88);transition:transform .6s ease}
a:hover .photo img{transform:scale(1.03)}
.cat{color:var(--grey)}
.lead{position:relative;display:block;margin-bottom:8px}
.lead .photo{aspect-ratio:16/9}
.lead .photo::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,11,12,0) 35%,rgba(11,11,12,.92) 100%)}
.lead .txt{position:absolute;left:36px;right:36px;bottom:32px}
.lead h2{font-size:clamp(34px,6vw,84px);margin:12px 0 14px;max-width:16ch}
.lead p{max-width:62ch;color:#cfd0d2}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:28px 22px;margin-top:30px}
.card .photo{aspect-ratio:4/5;margin-bottom:14px}
.card h3{font-size:26px;margin:10px 0 8px}
.card p{font-size:15px;color:#b8b9bc;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.meta{display:flex;justify-content:space-between;color:var(--grey);margin-top:10px}
.empty{padding:90px 0;text-align:center}.empty h2{font-size:clamp(44px,8vw,110px)}
article{max-width:820px;margin:0 auto}
article h1{font-size:clamp(40px,7vw,86px);margin:16px 0 20px}
article .standfirst{font-size:23px;line-height:1.42;color:#e3e3e1;font-weight:500;margin-bottom:22px}
article .byline{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:11px 0;margin-bottom:28px;color:var(--grey)}
article figure{margin:0 -60px 30px}
article figure .photo{aspect-ratio:16/10}
.credit{color:var(--grey);text-align:right;margin-top:8px}
article .body p{margin-bottom:1.05em;font-size:20px;color:#dcdcda}
.points{display:grid;gap:0;margin-top:26px;border-top:1px solid var(--line)}
.points div{padding:20px 0;border-bottom:1px solid var(--line)}
.points .label{color:var(--grey)}
.points h3{font-size:26px;margin:6px 0 6px}
.points p{color:#dcdcda;font-size:19px}
.source{margin-top:30px;padding-top:14px;border-top:1px solid var(--line);color:var(--grey)}
.source a{color:var(--white);text-decoration:underline;text-underline-offset:3px}
.tags{margin-top:10px;color:var(--grey)}
.more{margin-top:60px}.more h4{color:var(--grey);border-bottom:1px solid var(--line);padding-bottom:8px}
.more a{display:flex;gap:16px;align-items:baseline;padding:16px 0;border-bottom:1px solid var(--line);font-weight:800;text-transform:uppercase;letter-spacing:-.03em;font-size:22px;line-height:1.1}
.more a span{color:var(--grey);font-weight:500}
.more a:hover{color:var(--grey)}
footer.site{border-top:1px solid var(--line);padding:22px 0 34px}
footer.site .row{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:center;color:var(--grey)}
.about{max-width:820px}.about h1{font-size:clamp(44px,8vw,96px);margin:14px 0 26px}.about p{font-size:21px;margin-bottom:1em;color:#dcdcda}.about a{text-decoration:underline}
@media (max-width:860px){
  .grid{grid-template-columns:1fr 1fr;gap:22px 14px}.card h3{font-size:19px}
  .lead .photo{aspect-ratio:4/5}.lead .txt{left:18px;right:18px;bottom:20px}
  article figure{margin:0 0 24px}.dateline span:last-child{display:none}
}
@media (max-width:520px){.grid{grid-template-columns:1fr}.card h3{font-size:24px}header.site nav{gap:14px}}`;

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:ital,wght@0,300..900;1,300..900&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">`;

const mast = (n?: number, label = "News") => stamp(n, label);

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
  <div class="row"><a href="/" aria-label="${esc(BRAND.name)} home">${mast(undefined, "News")}</a>
  <nav class="label"><a href="/">News</a><a href="/about/">About</a><a href="${IG}">Instagram</a></nav></div>
  <div class="dateline label"><span>${today}</span><span>Techno · House · Club culture</span></div>
</div></header>
<main><div class="wrap">${o.body}</div></main>
<footer class="site"><div class="wrap"><div class="row"><span class="label">© ${new Date().getUTCFullYear()} ${esc(BRAND.name)}</span>
  <span class="label">News from the floor · <a href="${IG}">${esc(BRAND.handle)}</a> · <a href="/feed.xml">RSS</a></span></div></div></footer>
</body></html>`;
}

const photo = (a: Article) =>
  a.image ? `<div class="photo"><img src="${a.image}" alt="" loading="lazy"></div>` : "";

const card = (a: Article) => `<a class="card" href="/news/${a.slug}/">
  ${photo(a)}<span class="kicker label">${esc(a.kicker)}</span>
  <h3 class="head">${paintHeadline(a.headline, a.highlight)}</h3>
  <p>${esc(a.standfirst)}</p><div class="meta label"><span>${catalog(a.issue)}</span><time datetime="${a.date}">${fmtDate(new Date(a.date))}</time></div></a>`;

function home(all: Article[]) {
  const [lead, ...rest] = all;
  const body = lead
    ? `<a class="lead" href="/news/${lead.slug}/">${photo(lead)}<div class="txt">
        <span class="kicker label">${catalog(lead.issue)} · ${esc(lead.kicker)}</span>
        <h2 class="head">${paintHeadline(lead.headline, lead.highlight)}</h2>
        <p>${esc(lead.standfirst)}</p></div></a>
       <section class="grid">${rest.slice(0, 60).map(card).join("")}</section>`
    : `<div class="empty"><span class="kicker label">First edition</span><h2 class="head">News from the floor, <span class="hl">daily.</span></h2>
       <p class="label" style="margin-top:18px">The first stories land today · follow <a href="${IG}">${esc(BRAND.handle)}</a></p></div>`;
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
    <span class="kicker label">${catalog(a.issue)} · ${esc(a.kicker)}</span>
    <h1 class="head">${paintHeadline(a.headline, a.highlight)}</h1>
    <p class="standfirst">${esc(a.standfirst)}</p>
    <div class="byline label"><span>${BRAND.name} newsdesk · via ${esc(a.source)}</span><time datetime="${a.date}">${fmtDate(new Date(a.date))}</time></div>
    ${a.image ? `<figure>${photo(a)}<figcaption class="credit label">Photo via ${esc(a.source)}</figcaption></figure>` : ""}
    <div class="body">${a.body.map((p) => `<p>${esc(p)}</p>`).join("")}</div>
    ${a.points?.length ? `<section class="points">${a.points.map((pt, i) => `<div><span class="label">${String(i + 1).padStart(2, "0")}</span><h3 class="head">${esc(pt.title)}</h3><p>${esc(pt.text)}</p></div>`).join("")}</section>` : ""}
    <p class="source label">Original reporting: <a href="${esc(a.sourceUrl)}" rel="noopener">${esc(a.source)}</a></p>
    ${a.hashtags.length ? `<p class="tags label">${a.hashtags.map((t) => `#${esc(t)}`).join(" ")}</p>` : ""}
    ${more.length ? `<section class="more"><h4 class="label">More news</h4>${more.map((m) => `<a href="/news/${m.slug}/"><span class="label">${catalog(m.issue)}</span>${esc(m.headline)}</a>`).join("")}</section>` : ""}
  </article>`;
  return layout({ title: `${plain} — ${BRAND.name}`, description: a.standfirst, url, image: a.image, body, type: "article", jsonld });
}

function about() {
  return layout({
    title: `About — ${BRAND.name}`,
    description: `${BRAND.name} is a daily news desk for techno, house and club culture.`,
    url: `${SITE}/about/`,
    body: `<div class="about"><span class="kicker label">About</span><h1 class="head">News from the floor, <span class="hl">daily.</span></h1>
      <p>${BRAND.name} follows techno, house and club culture: releases, lineups, clubs, scenes and the people who make them.</p>
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
  write("about/index.html", about());
  write("feed.xml", feed(all));
  write("404.html", layout({ title: `Not found — ${BRAND.name}`, description: "", url: `${SITE}/404.html`, body: `<div class="empty"><h2 class="head">Off the <span class="hl">floor.</span></h2><p class="label" style="margin-top:16px"><a href="/">Back to the news</a></p></div>` }));
  write("CNAME", HOST + "\n");
  write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
  write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE}/</loc></url><url><loc>${SITE}/about/</loc></url>${all.map((a) => `<url><loc>${articleUrl(a.slug)}</loc><lastmod>${a.date.slice(0, 10)}</lastmod></url>`).join("")}</urlset>`);
  for (const a of all) write(`news/${a.slug}/index.html`, articlePage(a, all));
  return all.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`site: ${buildSite()} article(s) → ${path.relative(process.cwd(), OUT)}/`);
}

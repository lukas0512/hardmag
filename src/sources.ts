// News sources, verified 2026-11-16. weight = editorial priority (3 = core underground).
// Notes: Resident Advisor has no news RSS. Mixmag leaves <pubDate> empty (we use first-seen time).
// DJ Mag has no feed images and blocks article pages (Cloudflare) -> typographic cover, summary only.
// beat: editorial lane. "pt" = Lisbon/Portugal scene (Portuguese-language outlets, translated by the editor),
// "tech" = music technology, AI in electronic music, industry.
// ig: the outlet's Instagram handle, credited in captions (good for reposts). Only handles checked on Instagram (2026-11-20).
// match: general news feeds only let through items that match (title + summary).
export type Source = { name: string; feed: string; weight: number; noDate?: boolean; beat?: "club" | "pt" | "tech"; ig?: string; match?: RegExp };
// Portuguese general news: only what touches the scene (clubs, nightlife, festivals, DJs, electronic music).
const SCENE_PT = /techno|\bhouse\b|m[úu]sica eletr[óo]nica|electr[óo]nica|\bdjs?\b|discoteca|clube noturno|vida noturna|noite lisboeta|\brave\b|festival|lux fr[aá]gil|neopop|boom festival|ministerium|musicbox|k[øo]mplex|planeta manas|gare porto|cais do sodr[ée]|bairro alto|cartaz/i;

export const SOURCES: Source[] = [
  { name: "Mixmag", feed: "https://mixmag.net/rss.xml", weight: 3, noDate: true, ig: "mixmag" },
  { name: "Electronic Groove", feed: "https://electronicgroove.com/feed/", weight: 3, ig: "electronicgroove" },
  { name: "The Ransom Note", feed: "https://www.theransomnote.com/feed/", weight: 3 },
  { name: "Inverted Audio", feed: "https://inverted-audio.com/feed/", weight: 3, ig: "invertedaudio" },
  { name: "DJ Mag", feed: "https://djmag.com/feed", weight: 2, ig: "djmagofficial" },
  { name: "Data Transmission", feed: "https://datatransmission.co/feed/", weight: 2, ig: "datatransmission" },
  { name: "Decoded Magazine", feed: "https://www.decodedmagazine.com/feed/", weight: 2 },
  { name: "When We Dip", feed: "https://www.whenwedip.com/feed/", weight: 2, ig: "whenwedip" },
  { name: "5 Mag", feed: "https://5mag.net/feed/", weight: 2 },
  { name: "Crack Magazine", feed: "https://crackmagazine.net/feed/", weight: 2, ig: "crackmagazine" },
  { name: "Rave Jungle", feed: "https://ravejungle.com/feed/", weight: 1 },
  { name: "Attack Magazine", feed: "https://www.attackmagazine.com/feed/", weight: 1, beat: "tech", ig: "attackmag" },
  // Wider electronic music + viral/industry stories (verified 2026-11-20)
  { name: "Dancing Astronaut", feed: "https://dancingastronaut.com/feed/", weight: 1, ig: "dancingastro" },
  { name: "Magnetic Magazine", feed: "https://www.magneticmag.com/feed/", weight: 1 },
  { name: "Festileaks", feed: "https://www.festileaks.com/feed/", weight: 1, ig: "festileaks" }, // Dutch: festivals, hard techno, hard dance
  // Lisbon / Portugal (Portuguese-language; verified 2026-11-20)
  { name: "NiT", feed: "https://www.nit.pt/feed", weight: 1, beat: "pt" },
  { name: "Rimas e Batidas", feed: "https://www.rimasebatidas.pt/feed/", weight: 2, beat: "pt", ig: "rimasebatidas" },
  { name: "Comunidade Cultura e Arte", feed: "https://www.comunidadeculturaearte.com/feed/", weight: 1, beat: "pt", ig: "comunidadeculturaearte" },
  { name: "Gerador", feed: "https://gerador.eu/feed/", weight: 1, beat: "pt", ig: "gerador.eu" },
  { name: "Shifter", feed: "https://shifter.pt/feed/", weight: 1, beat: "pt" },
  // Portuguese general news, filtered to the scene (SIC Notícias and Expresso block automated readers)
  { name: "Notícias ao Minuto", feed: "https://www.noticiasaominuto.com/rss/cultura", weight: 1, beat: "pt", match: SCENE_PT },
  { name: "Público", feed: "https://feeds.feedburner.com/PublicoRSS", weight: 1, beat: "pt", match: SCENE_PT },
  { name: "Observador", feed: "https://observador.pt/feed/", weight: 1, beat: "pt", match: SCENE_PT },
  { name: "RTP Notícias", feed: "https://www.rtp.pt/noticias/rss", weight: 1, beat: "pt", match: SCENE_PT },
  // Music technology, AI in music, industry
  { name: "CDM", feed: "https://cdm.link/feed/", weight: 2, beat: "tech" },
  { name: "Music Business Worldwide", feed: "https://www.musicbusinessworldwide.com/feed/", weight: 2, beat: "tech", ig: "musicbizworldwide" },
  { name: "MusicTech", feed: "https://musictech.com/feed/", weight: 1, beat: "tech" },
];

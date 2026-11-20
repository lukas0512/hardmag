// News sources, verified 2026-11-16. weight = editorial priority (3 = core underground).
// Notes: Resident Advisor has no news RSS. Mixmag leaves <pubDate> empty (we use first-seen time).
// DJ Mag has no feed images and blocks article pages (Cloudflare) -> typographic cover, summary only.
// beat: editorial lane. "pt" = Lisbon/Portugal scene (Portuguese-language outlets, translated by the editor),
// "tech" = music technology, AI in electronic music, industry.
// ig: the outlet's Instagram handle, credited in captions (good for reposts). Only handles checked on Instagram (2026-11-20).
export type Source = { name: string; feed: string; weight: number; noDate?: boolean; beat?: "club" | "pt" | "tech"; ig?: string };

export const SOURCES: Source[] = [
  { name: "Mixmag", feed: "https://mixmag.net/rss.xml", weight: 3, noDate: true, ig: "mixmag" },
  { name: "Electronic Groove", feed: "https://electronicgroove.com/feed/", weight: 3, ig: "electronicgroove" },
  { name: "The Ransom Note", feed: "https://www.theransomnote.com/feed/", weight: 3 },
  { name: "Inverted Audio", feed: "https://inverted-audio.com/feed/", weight: 3 },
  { name: "DJ Mag", feed: "https://djmag.com/feed", weight: 2, ig: "djmagofficial" },
  { name: "Data Transmission", feed: "https://datatransmission.co/feed/", weight: 2 },
  { name: "Decoded Magazine", feed: "https://www.decodedmagazine.com/feed/", weight: 2 },
  { name: "When We Dip", feed: "https://www.whenwedip.com/feed/", weight: 2 },
  { name: "5 Mag", feed: "https://5mag.net/feed/", weight: 2 },
  { name: "Crack Magazine", feed: "https://crackmagazine.net/feed/", weight: 2, ig: "crackmagazine" },
  { name: "Rave Jungle", feed: "https://ravejungle.com/feed/", weight: 1 },
  { name: "Attack Magazine", feed: "https://www.attackmagazine.com/feed/", weight: 1, beat: "tech" },
  // Wider electronic music + viral/industry stories (verified 2026-11-20)
  { name: "Dancing Astronaut", feed: "https://dancingastronaut.com/feed/", weight: 1 },
  { name: "Magnetic Magazine", feed: "https://www.magneticmag.com/feed/", weight: 1 },
  { name: "Festileaks", feed: "https://www.festileaks.com/feed/", weight: 1 }, // Dutch: festivals, hard techno, hard dance
  // Lisbon / Portugal (Portuguese-language; verified 2026-11-20)
  { name: "NiT", feed: "https://www.nit.pt/feed", weight: 1, beat: "pt" },
  { name: "Observador", feed: "https://observador.pt/seccao/cultura/feed/", weight: 1, beat: "pt" },
  { name: "Rimas e Batidas", feed: "https://www.rimasebatidas.pt/feed/", weight: 2, beat: "pt", ig: "rimasebatidas" },
  { name: "Comunidade Cultura e Arte", feed: "https://www.comunidadeculturaearte.com/feed/", weight: 1, beat: "pt" },
  { name: "Gerador", feed: "https://gerador.eu/feed/", weight: 1, beat: "pt" },
  { name: "Shifter", feed: "https://shifter.pt/feed/", weight: 1, beat: "pt" },
  // Music technology, AI in music, industry
  { name: "CDM", feed: "https://cdm.link/feed/", weight: 2, beat: "tech" },
  { name: "Music Business Worldwide", feed: "https://www.musicbusinessworldwide.com/feed/", weight: 2, beat: "tech" },
  { name: "MusicTech", feed: "https://musictech.com/feed/", weight: 1, beat: "tech" },
];

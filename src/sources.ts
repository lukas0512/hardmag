// News sources, verified 2026-11-16. weight = editorial priority (3 = core underground).
// Notes: Resident Advisor has no news RSS. Mixmag leaves <pubDate> empty (we use first-seen time).
// DJ Mag has no feed images and blocks article pages (Cloudflare) -> typographic cover, summary only.
export type Source = { name: string; feed: string; weight: number; noDate?: boolean };

export const SOURCES: Source[] = [
  { name: "Mixmag", feed: "https://mixmag.net/rss.xml", weight: 3, noDate: true },
  { name: "Electronic Groove", feed: "https://electronicgroove.com/feed/", weight: 3 },
  { name: "The Ransom Note", feed: "https://www.theransomnote.com/feed/", weight: 3 },
  { name: "Inverted Audio", feed: "https://inverted-audio.com/feed/", weight: 3 },
  { name: "DJ Mag", feed: "https://djmag.com/feed", weight: 2 },
  { name: "Data Transmission", feed: "https://datatransmission.co/feed/", weight: 2 },
  { name: "Decoded Magazine", feed: "https://www.decodedmagazine.com/feed/", weight: 2 },
  { name: "When We Dip", feed: "https://www.whenwedip.com/feed/", weight: 2 },
  { name: "5 Mag", feed: "https://5mag.net/feed/", weight: 2 },
  { name: "Crack Magazine", feed: "https://crackmagazine.net/feed/", weight: 2 },
  { name: "Rave Jungle", feed: "https://ravejungle.com/feed/", weight: 1 },
  { name: "Attack Magazine", feed: "https://www.attackmagazine.com/feed/", weight: 1 },
];

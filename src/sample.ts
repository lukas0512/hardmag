// Renders hand-written sample posts so the look can be judged with real editorial copy.
import path from "node:path";
import fs from "node:fs";
import { ROOT } from "./config.ts";
import { postSlides } from "./templates.ts";
import { renderSlides, closeRenderer } from "./render.ts";

const img = (q: string) => fs.readdirSync(path.join(ROOT, "out/tmp/img")).map((f) => path.join(ROOT, "out/tmp/img", f)).find((f) => f.includes(q));

const samples = [
  {
    slug: "sample-alltrax",
    kicker: "SCENE",
    headline: "Wigan radio station now pays its DJs",
    highlight: ["PAYS"],
    body: [
      "Alltrax, a community station in Wigan, has opened applications for paid DJ residencies aimed at emerging local talent.",
      "The station says it wants to break the \"often unpaid model of grassroots radio\" and build opportunities outside Manchester's city centre.",
      "The project is funded with Wigan Council and Arts Council England, with Reform Radio and Wigan Libraries hosting DJ workshops.",
    ],
    source: "Mixmag",
    date: new Date(),
    imagePath: img("wigan"),
  },
  {
    slug: "sample-selector",
    kicker: "NEWS",
    headline: "70,000 DJ sets, one endless scroll",
    highlight: ["70,000"],
    body: [
      "A new site called The Selector lets you flick through more than 70,000 DJ sets from 58 channels.",
      "It pulls in radio archives including The Lot Radio, Rinse FM, Balamii, Kiosk Radio and Worldwide FM, plus almost 2,000 Mixmag sets from the past 15 years.",
      "It was built by DJ and producer The Cat Rave.",
    ],
    source: "Mixmag",
    date: new Date(),
    imagePath: img("new-music"),
  },
];

const files = [];
for (const s of samples) files.push(...(await renderSlides(postSlides(s), path.join(ROOT, "brand/samples"))));
await closeRenderer();
console.log(files.join("\n"));
process.exit(0);

/**
 * MTGO official decklists — used for tournament links ONLY.
 *
 * The old version imported MTGO deck lists into the Arena format grid and
 * mapped Modern/Legacy/Vintage events onto "timeless" — which is how a Legacy
 * Showcase list (Volcanic Island, Force of Will…) ended up displayed as an
 * Arena Timeless deck. MTGO formats keep their real names now, and lists are
 * never sourced from here.
 */
import { getText } from "./common.mjs";

function mapMtgoFormat(slug = "") {
  const s = String(slug).toLowerCase();
  if (/pioneer/.test(s)) return "pioneer";
  if (/modern/.test(s)) return "modern";
  if (/legacy/.test(s)) return "legacy";
  if (/vintage/.test(s)) return "vintage";
  if (/pauper/.test(s)) return "pauper";
  if (/standard/.test(s)) return "standard";
  return "other";
}

function eventPriority(slug = "") {
  const s = slug.toLowerCase();
  if (/limited|sealed|draft|cube/.test(s)) return 0;
  if (/showcase|championship/.test(s)) return 100;
  if (/challenge/.test(s)) return 95;
  if (/super-qualifier|qualifier/.test(s)) return 85;
  if (/preliminary|prelim/.test(s)) return 60;
  if (/league/.test(s)) return 20;
  return 40;
}

export async function fetchMtgoIndex() {
  const urls = [
    "https://www.mtgo.com/decklists",
    "https://www.mtgo.com/en/mtgo/decklists",
  ];
  for (const url of urls) {
    try {
      const html = await getText(url);
      const links = [];
      const re = /href="(\/decklist\/[a-z0-9-]+)"/gi;
      const seen = new Set();
      let m;
      while ((m = re.exec(html)) !== null) {
        if (seen.has(m[1])) continue;
        seen.add(m[1]);
        const slug = m[1].replace("/decklist/", "");
        if (/limited|sealed|draft|cube|momir|commander|edh/i.test(slug)) continue;
        links.push({
          url: `https://www.mtgo.com${m[1]}`,
          slug,
          format: mapMtgoFormat(slug),
          name: slug.replace(/-/g, " "),
          priority: eventPriority(slug),
        });
      }
      if (links.length) {
        links.sort((a, b) => b.priority - a.priority);
        return links;
      }
    } catch (e) {
      console.warn("[mtgo] index", url, e.message);
    }
  }
  return [];
}

export async function collectMtgoTournaments() {
  const index = await fetchMtgoIndex();
  console.log(`  mtgo: ${index.length} event links`);

  const tournaments = index.slice(0, 15).map((e, i) => ({
    id: `mtgo-${e.slug || i}`,
    name: e.name || e.slug,
    format: e.format || "other",
    platform: "mtgo",
    date:
      (e.slug || "").match(/(\d{4}-\d{2}-\d{2})/)?.[1] ||
      new Date().toISOString().slice(0, 10),
    url: e.url,
    topDecks: [],
    notes: "Official MTGO published decklists",
    source: "mtgo",
  }));

  return { tournaments };
}

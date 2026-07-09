/**
 * Untapped.gg — Arena ladder meta.
 * Full deck JSON is often behind login; we capture meta links + public archetype pages.
 * https://mtga.untapped.gg/constructed/standard/meta
 */
import { getText } from "./common.mjs";

const FORMATS = [
  { id: "standard", path: "standard" },
  { id: "historic", path: "historic" },
  { id: "alchemy", path: "alchemy" },
  { id: "timeless", path: "timeless" },
  { id: "explorer", path: "explorer", mapTo: "pioneer" },
];

export async function collectUntapped() {
  const today = new Date().toISOString().slice(0, 10);
  const tournaments = FORMATS.map((f) => ({
    id: `untapped-${f.id}-meta`,
    name: `Untapped.gg — ${f.id} constructed meta`,
    format: f.mapTo || f.id,
    platform: "mtga",
    date: today,
    url: `https://mtga.untapped.gg/constructed/${f.path}/meta`,
    topDecks: [],
    notes: "Arena ladder / Mythic meta tracker.",
    source: "untapped",
  }));

  const archetypeHints = [];
  const lists = [];

  for (const f of FORMATS.slice(0, 2)) {
    try {
      const html = await getText(
        `https://mtga.untapped.gg/constructed/${f.path}/meta`,
      );

      // Prefer __NEXT_DATA__ if present
      const nextMatch = html.match(
        /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
      );
      if (nextMatch) {
        try {
          const data = JSON.parse(nextMatch[1]);
          const blob = JSON.stringify(data);
          // Pull archetype-like names from nested payloads when present
          const nameHits = [
            ...blob.matchAll(/"name"\s*:\s*"([A-Z][^"]{3,40})"/g),
          ]
            .map((m) => m[1])
            .filter(
              (n) =>
                !/untapped|marvel|hobbit|star trek|promo|banner|feedback/i.test(
                  n,
                ),
            );
          for (const name of [...new Set(nameHits)].slice(0, 12)) {
            archetypeHints.push({
              name,
              format: f.mapTo || f.id,
              source: "untapped",
              url: `https://mtga.untapped.gg/constructed/${f.path}/meta`,
            });
          }
        } catch {
          /* ignore bad next data */
        }
      }

      // href archetype links
      const re = new RegExp(
        `href="(/constructed/${f.path}/archetypes/\\d+/[a-z0-9-]+)"`,
        "gi",
      );
      let m;
      const seen = new Set();
      while ((m = re.exec(html)) !== null && archetypeHints.length < 40) {
        if (seen.has(m[1])) continue;
        seen.add(m[1]);
        const slug = m[1].split("/").pop();
        archetypeHints.push({
          name: slug
            .split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" "),
          url: `https://mtga.untapped.gg${m[1]}`,
          format: f.mapTo || f.id,
          source: "untapped",
        });
      }
    } catch (e) {
      console.warn(`[untapped] ${f.id}`, e.message);
    }
  }

  console.log(`  untapped: ${archetypeHints.length} archetype links/hints`);
  return {
    tournaments,
    lists, // full deck JSON usually auth-walled
    archetypeHints,
  };
}

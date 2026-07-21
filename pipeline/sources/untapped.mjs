/**
 * Untapped.gg — Arena ladder meta.
 *
 * Two roles:
 *  1. collectUntapped(): meta links + archetype hints for the tournaments rail
 *     (full deck JSON is auth-walled; we never scrape lists from Untapped).
 *  2. fetchStandardBo1Ladder(): REAL Bo1 board ordering. The free public API
 *     that powers https://mtga.untapped.gg/constructed/standard/meta exposes
 *     archetype popularity + winrate for the Standard Bo1 ladder (EventName
 *     "Ladder", current meta period) without auth. Bo3 (Traditional_Ladder)
 *     and Explorer are premium-walled — only Standard Bo1 is available, which
 *     is exactly the board where tournament data (Goldfish) is wrong.
 */
import { getText } from "./common.mjs";

const API = "https://api.mtga.untapped.gg/api/v1";

/** Untapped's 4-color nicknames (WUBRG minus one) → community "4c". */
const FOUR_COLOR_NICKS = /\b(glint[- ]?eye|yore|witch[- ]?maw|dune[- ]?brood|ink[- ]?treader)\b/g;

/**
 * Normalize an archetype name for cross-site matching
 * (Untapped "Glint-Eye Reanimator" ⇄ Goldfish "4c Reanimator").
 */
export function normalizeArchetypeName(name) {
  return String(name)
    .toLowerCase()
    .replace(FOUR_COLOR_NICKS, "4c")
    .replace(/\b(four|4)[- ]?colou?r\b/g, "4c")
    .replace(/\b(five|5)[- ]?colou?r\b/g, "5c")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const COLOR_BITS = [
  ["W", 1],
  ["U", 2],
  ["B", 4],
  ["R", 8],
  ["G", 16],
];

/**
 * Pure: decode the archetype trend payload into a ranked Bo1 board.
 * @returns [{ name, norm, colors, sharePct, winratePct, matches }] by share desc
 */
export function buildBo1BoardFromPayloads(tags, trend) {
  const tagName = new Map((tags || []).map((t) => [t.id, t.name]));
  const tile = trend?.meta_data?.tile_data || {};
  const groups = trend?.primary_tag_group_ids || {};
  const board = [];
  for (const [gid, scopes] of Object.entries(groups)) {
    const s = scopes.All || Object.values(scopes)[0];
    if (!s) continue;
    const pop = Array.isArray(s.popularity) ? s.popularity : [];
    const wr = Array.isArray(s.win_rate) ? s.win_rate : [];
    const matches = Array.isArray(s.matches_per_meta_period)
      ? s.matches_per_meta_period[0] || 0
      : 0;
    const names = (tile[gid]?.primary_tag_ids || [])
      .map((id) => tagName.get(id))
      .filter(Boolean);
    if (!names.length) continue;
    const name = names.join(" ");
    if (/\bother\b/i.test(name)) continue;
    const sharePct = pop.length ? pop[pop.length - 1] : 0;
    // Thin/zero rows are noise, not a board presence.
    if (!(sharePct > 0.2) || matches < 1000) continue;
    const colorByte = tile[gid]?.color_byte || 0;
    board.push({
      name,
      norm: normalizeArchetypeName(name),
      colors: COLOR_BITS.filter(([, b]) => colorByte & b).map(([c]) => c),
      sharePct: Math.round(sharePct * 10) / 10,
      winratePct: wr.length ? Math.round(wr[wr.length - 1] * 10) / 10 : undefined,
      matches,
    });
  }
  board.sort((a, b) => b.sharePct - a.sharePct || b.matches - a.matches);
  return board;
}

/**
 * Live Standard Bo1 ladder board from Untapped's free public analytics.
 * Throws on any failure — the caller treats that as "no Bo1 data today"
 * and falls back to mirroring the Bo3 board (never aborts the pipeline).
 */
export async function fetchStandardBo1Ladder() {
  const periods = JSON.parse(
    await getText(`${API}/meta-periods/active`, "application/json"),
  );
  const current = (Array.isArray(periods) ? periods : []).find(
    (p) => p.event_name === "Ladder" && !p.end_ts,
  );
  if (!current) throw new Error("no open Standard Ladder meta period");
  const tags = JSON.parse(await getText(`${API}/tags`, "application/json"));
  const trend = JSON.parse(
    await getText(
      `${API}/analytics/query/archetype_trend_by_event_scope_and_rank_v2?EventNameFilter=LADDER&RankingClassScopeFilter=ALL&ClassificationTypeFilter=ARCHETYPES&MetaPeriodScopeFilter=CURRENT`,
      "application/json",
    ),
  );
  const board = buildBo1BoardFromPayloads(tags, trend);
  if (board.length < 4) throw new Error(`Bo1 board too thin (${board.length})`);
  return {
    periodId: current.id,
    totalMatches: current?.NORMAL?.matches_count_all?.total,
    board,
    url: "https://mtga.untapped.gg/constructed/standard/meta",
  };
}

const FORMATS = [
  { id: "standard", path: "standard" },
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

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
import { getText, UA } from "./common.mjs";

const API = "https://api.mtga.untapped.gg/api/v1";
/** Untapped rate-limits / stubs free analytics without a real browser Origin. */
const UNTAPPED_ORIGIN = "https://mtga.untapped.gg";

/**
 * Fetch Untapped API JSON with browser-like headers. Bare getText() (bot From
 * header, no Origin) returns a 6-row stub payload with ~100 matches per row —
 * enough to look like success but too thin for a real Bo1 board (2026-07-23).
 */
async function getUntappedJson(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      Origin: UNTAPPED_ORIGIN,
      Referer: `${UNTAPPED_ORIGIN}/constructed/standard/meta`,
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

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
 * Pure: decode the *legacy* archetype_trend payload into a ranked Bo1 board.
 * Kept for fixture tests — Untapped's live trend endpoint (2026-07-23+) no
 * longer ships `All` / `popularity` scopes, so production uses
 * {@link buildBo1BoardFromArchetypes} instead.
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
 * Pure: ranked Bo1 board from the free `archetypes_by_event_scope_and_rank_v2`
 * payload (same data Untapped's public meta page uses). Share is each
 * archetype's match volume over the sum of returned non-"Other" archetypes.
 * @returns [{ name, norm, colors, sharePct, winratePct, matches }] by share desc
 */
export function buildBo1BoardFromArchetypes(tags, archetypes) {
  const tagName = new Map((tags || []).map((t) => [t.id, t.name]));
  const rows = [];
  for (const a of Array.isArray(archetypes) ? archetypes : []) {
    const names = (a.primary_tags || [])
      .map((id) => tagName.get(id))
      .filter(Boolean);
    if (!names.length) continue;
    const name = names.join(" ");
    if (/\bother\b/i.test(name)) continue;

    const stats = a.stats || {};
    let matches = 0;
    let winWeighted = 0;
    if (stats.all?.total_matches != null) {
      matches = stats.all.total_matches || 0;
      winWeighted = (stats.all.winrate || 0) * matches;
    } else {
      for (const s of Object.values(stats)) {
        const m = s?.total_matches || 0;
        matches += m;
        winWeighted += (s?.winrate || 0) * m;
      }
    }
    if (matches <= 0) continue;

    const colorByte = a.color_byte || 0;
    rows.push({
      name,
      norm: normalizeArchetypeName(name),
      colors: COLOR_BITS.filter(([, b]) => colorByte & b).map(([c]) => c),
      matches,
      winratePct: matches
        ? Math.round((winWeighted / matches) * 10) / 10
        : undefined,
    });
  }

  const denom = rows.reduce((n, r) => n + r.matches, 0);
  if (!denom) return [];

  const board = rows
    .filter((r) => r.matches >= 1000)
    .map((r) => ({
      name: r.name,
      norm: r.norm,
      colors: r.colors,
      sharePct: Math.round((r.matches / denom) * 1000) / 10,
      winratePct: r.winratePct,
      matches: r.matches,
    }));
  board.sort((a, b) => b.sharePct - a.sharePct || b.matches - a.matches);
  return board;
}

/**
 * Live Standard Bo1 ladder board from Untapped's free public analytics.
 * Throws on any failure — the caller treats that as "no Bo1 data today"
 * and falls back to mirroring the Bo3 board (never aborts the pipeline).
 *
 * Primary source (2026-07-23+): free archetypes endpoint — the trend
 * endpoint no longer returns `All`/`popularity` and was producing a 0-row
 * board (which silently mirrored Bo3). Decklists still come from
 * {@link fetchBo1DeckPool} / tournament sources by name match.
 */
export async function fetchStandardBo1Ladder() {
  const periods = await getUntappedJson(`${API}/meta-periods/active`);
  const current = (Array.isArray(periods) ? periods : []).find(
    (p) => p.event_name === "Ladder" && !p.end_ts,
  );
  if (!current) throw new Error("no open Standard Ladder meta period");
  const tags = await getUntappedJson(`${API}/tags`);
  const archetypes = await getUntappedJson(
    `${API}/analytics/query/archetypes_by_event_scope_and_rank_v2/free?MetaPeriodId=${current.id}&RankingClassScopeFilter=ALL`,
  );
  const board = buildBo1BoardFromArchetypes(tags, archetypes);
  if (board.length < 4) throw new Error(`Bo1 board too thin (${board.length})`);
  return {
    periodId: current.id,
    totalMatches: current?.NORMAL?.matches_count_all?.total,
    board,
    url: "https://mtga.untapped.gg/constructed/standard/meta",
    tags,
  };
}

/* ------------------------------------------------------------------ */
/* Bo1 decklists — the free decks endpoint behind /constructed/…/decks */
/* ------------------------------------------------------------------ */

function varints(buf) {
  const out = [];
  let cur = 0n;
  let shift = 0n;
  for (const b of buf) {
    cur |= BigInt(b & 0x7f) << shift;
    if (b & 0x80) {
      shift += 7n;
    } else {
      out.push(Number(cur));
      cur = 0n;
      shift = 0n;
    }
  }
  return out;
}

/**
 * Pure: decode one Untapped deck string ("ds") into titleId counts.
 *
 * Verified layout (2026-07-21, version 4): varint stream of
 *   [0, version, format, header,
 *    n₁, Δ×n₁,  n₂, Δ×n₂,  n₃, Δ×n₃,  n₄, Δ×n₄,   ← qty 1..4 groups,
 *                                                    delta-coded titleIds
 *    nExtra, (count, titleId)×nExtra,               ← qty ≥5 (basics etc.)
 *    sideboard…]                                    ← 0 on the Bo1 endpoint
 *
 * @returns [{ titleId, count }] mainboard, or null when the shape is off.
 */
export function decodeUntappedDeckString(ds) {
  let v;
  try {
    v = varints(Buffer.from(String(ds), "base64url"));
  } catch {
    return null;
  }
  let i = 0;
  if (v[i++] !== 0) return null;
  const version = v[i++];
  if (version !== 4) return null;
  i += 2; // format byte + header byte
  const out = [];
  for (const qty of [1, 2, 3, 4]) {
    const n = v[i++];
    if (!Number.isInteger(n) || n < 0 || n > 250) return null;
    let acc = 0;
    for (let k = 0; k < n; k++) {
      const d = v[i++];
      if (d === undefined) return null;
      acc += d;
      out.push({ titleId: acc, count: qty });
    }
  }
  const extras = v[i++];
  if (!Number.isInteger(extras) || extras < 0 || extras > 60) return null;
  for (let k = 0; k < extras; k++) {
    const count = v[i++];
    const titleId = v[i++];
    if (titleId === undefined || count <= 0 || count > 250) return null;
    out.push({ titleId, count });
  }
  const total = out.reduce((n, c) => n + c.count, 0);
  if (total < 40 || total > 250) return null;
  return out;
}

/**
 * Bo1 ladder decklist pool for archetypes tournament sources never see
 * (e.g. Mono-White Auras). Uses the same free endpoints as Untapped's public
 * decks page: deck rows (encoded), archetype tag-groups, and the public
 * card/loc DB to turn titleIds into card names. Names are validated against
 * Scryfall downstream exactly like every other source.
 *
 * @returns Map norm(archetypeName) → [{ archetypeName, matches, mainboard }]
 *          sorted by matches desc.
 */
export async function fetchBo1DeckPool(periodId, tags) {
  const [archetypes, deckRows, locList] = await Promise.all([
    getUntappedJson(
      `${API}/analytics/query/archetypes_by_event_scope_and_rank_v2/free?MetaPeriodId=${periodId}&RankingClassScopeFilter=BRONZE_TO_PLATINUM`,
    ),
    getUntappedJson(
      `${API}/analytics/query/decks_by_event_scope_and_rank_v2/free?MetaPeriodId=${periodId}&RankingClassScopeFilter=BRONZE_TO_PLATINUM`,
    ),
    getUntappedJson("https://mtgajson.untapped.gg/v1/latest/loc_en.json"),
  ]);

  const tagName = new Map((tags || []).map((t) => [t.id, t.name]));
  const nameByPtg = new Map();
  for (const a of Array.isArray(archetypes) ? archetypes : []) {
    const name = (a.primary_tags || [])
      .map((t) => tagName.get(t))
      .filter(Boolean)
      .join(" ");
    if (name) nameByPtg.set(a.primary_tag_group_id, name);
  }

  const locName = new Map(
    (Array.isArray(locList) ? locList : []).map((e) => [e.id, e.text]),
  );

  const pool = new Map();
  for (const row of Array.isArray(deckRows) ? deckRows : []) {
    const archetypeName = nameByPtg.get(row.ptg);
    if (!archetypeName) continue;
    const decoded = decodeUntappedDeckString(row.ds);
    if (!decoded) continue;
    const mainboard = [];
    let unnamed = 0;
    for (const { titleId, count } of decoded) {
      const name = locName.get(titleId);
      if (!name) {
        unnamed++;
        continue;
      }
      mainboard.push({ name, count });
    }
    if (unnamed > 1) continue; // stale card DB — don't ship a hole
    // Sample size: wins+losses across the per-rank results buckets.
    let matches = 0;
    for (const r of Object.values(row.rs || {})) {
      if (Array.isArray(r)) matches += (r[0] || 0) + (r[1] || 0);
    }
    const norm = normalizeArchetypeName(archetypeName);
    if (!pool.has(norm)) pool.set(norm, []);
    pool.get(norm).push({ archetypeName, matches, mainboard });
  }
  for (const lists of pool.values()) {
    lists.sort((a, b) => b.matches - a.matches);
  }
  return pool;
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

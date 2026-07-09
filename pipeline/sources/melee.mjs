/**
 * Melee.gg — major paper / RCQ / Arena Championship tournament platform.
 * Public DataTables endpoint: POST /Tournament/SearchResults
 * Deck card JSON is often login-gated; we surface recent real events for intel.
 */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function mapMeleeFormat(formatString = "") {
  const f = formatString.toLowerCase();
  if (f.includes("alchemy")) return "alchemy";
  if (f.includes("historic brawl")) return "historic_brawl";
  if (f.includes("standard brawl") || (f.includes("brawl") && f.includes("standard")))
    return "standard_brawl";
  if (f.includes("historic")) return "historic";
  if (f.includes("pioneer") || f.includes("explorer")) return "pioneer";
  if (
    f.includes("timeless") ||
    f.includes("legacy") ||
    f.includes("vintage") ||
    f.includes("modern")
  )
    return "timeless";
  if (f.includes("brawl")) return "brawl";
  return "standard";
}

function mapMeleePlatform(gameDescription = "", name = "") {
  const s = `${gameDescription} ${name}`.toLowerCase();
  if (s.includes("arena") || s.includes("mtga")) return "mtga";
  if (s.includes("mtgo") || s.includes("magic online")) return "mtgo";
  return "paper";
}

/**
 * Fetch recent competitive Melee tournaments.
 * Filters out ancient alpha-test rows that dominate default sort.
 */
export async function collectMelee() {
  const url = "https://melee.gg/Tournament/SearchResults";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Referer: "https://melee.gg/Tournament/Search",
      },
      // Pull a wide window then sort client-side by date
      body: "draw=1&start=0&length=250",
    });
    if (!res.ok) throw new Error(`SearchResults → ${res.status}`);
    const text = await res.text();
    let rows;
    try {
      rows = JSON.parse(text);
    } catch {
      throw new Error("SearchResults not JSON");
    }
    if (!Array.isArray(rows)) {
      rows = rows.data || rows.results || [];
    }

    const today = new Date().toISOString().slice(0, 10);
    // Prefer last ~18 months; drop alpha tests
    const cutoff = "2025-01-01";
    const cleaned = rows
      .filter((row) => {
        if (!row?.id || !row?.name) return false;
        if (/alpha test|test tournament/i.test(row.name) && (row.enrolledPlayerCount || 0) < 50)
          return false;
        const d = String(row.startDate || "").slice(0, 10);
        if (d && d < cutoff) return false;
        return (row.enrolledPlayerCount || 0) >= 8 || /rcq|regional|championship|showcase|pro tour|arena championship/i.test(row.name);
      })
      .sort((a, b) =>
        String(b.startDate || "").localeCompare(String(a.startDate || "")),
      );

    // If filter too strict (empty), fall back to highest player counts overall
    const pool =
      cleaned.length >= 5
        ? cleaned
        : [...rows]
            .filter((r) => r?.id && r?.name && !/alpha test/i.test(r.name || ""))
            .sort(
              (a, b) =>
                (b.enrolledPlayerCount || 0) - (a.enrolledPlayerCount || 0),
            );

    const tournaments = [];
    for (const row of pool) {
      const date = row.startDate
        ? String(row.startDate).slice(0, 10)
        : today;
      tournaments.push({
        id: `melee-${row.id}`,
        name: row.name,
        format: mapMeleeFormat(row.formatString || row.name),
        platform: mapMeleePlatform(row.gameDescription || "", row.name),
        date,
        url: `https://melee.gg/Tournament/View/${row.id}`,
        players: row.enrolledPlayerCount || undefined,
        topDecks: [],
        notes: [
          row.organizationName ? `Org: ${row.organizationName}` : null,
          row.formatString ? `Format: ${row.formatString}` : null,
          row.status ? `Status: ${row.status}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        source: "melee",
      });
      if (tournaments.length >= 20) break;
    }

    console.log(`  melee: ${tournaments.length} tournament links`);
    return {
      url: "https://melee.gg/Tournament/Search",
      tournaments,
      lists: [], // full public deck JSON still gated for most events
    };
  } catch (e) {
    console.warn("[melee]", e.message);
    return {
      url: "https://melee.gg/Tournament/Search",
      tournaments: [],
      lists: [],
      error: String(e.message),
    };
  }
}

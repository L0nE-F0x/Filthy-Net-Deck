/**
 * Fetch authoritative Standard decklists from MTGGoldfish.
 * Used by build-meta.mjs --live so we never invent 60 cards when a list exists.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function getText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,text/plain,*/*" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
}

/** Parse Arena/MTGO style deck text into mainboard + sideboard entries */
export function parseDeckText(text) {
  const lines = String(text)
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const mainboard = [];
  const sideboard = [];
  let section = "main";

  for (const line of lines) {
    if (/^sideboard$/i.test(line) || /^sb$/i.test(line)) {
      section = "side";
      continue;
    }
    if (/^deck$/i.test(line) || /^companion$/i.test(line) || /^commander$/i.test(line)) {
      section = "main";
      continue;
    }
    const m = line.match(/^(\d+)\s+(.+)$/);
    if (!m) continue;
    const entry = { count: parseInt(m[1], 10), name: m[2].trim() };
    if (!entry.name || entry.count < 1) continue;
    if (section === "side") sideboard.push(entry);
    else mainboard.push(entry);
  }

  const mainCount = mainboard.reduce((s, c) => s + c.count, 0);
  return { mainboard, sideboard, mainCount };
}

/**
 * From an archetype page HTML, find a recent deck id and fetch Arena export text.
 * @returns {{ deckId, name, mainboard, sideboard, url, listQuality } | null}
 */
export async function fetchGoldfishArchetypeList(archetypePath, displayName) {
  // archetypePath e.g. standard-izzet-prowess-woe
  const pageUrl = `https://www.mtggoldfish.com/archetype/${archetypePath}#paper`;
  try {
    const html = await getText(pageUrl);
    // Prefer links like /deck/7859084
    const ids = [...html.matchAll(/\/deck\/(\d+)/g)].map((m) => m[1]);
    const uniq = [...new Set(ids)];
    if (!uniq.length) return null;

    // Try newest-looking ids first (higher numbers)
    uniq.sort((a, b) => Number(b) - Number(a));

    for (const deckId of uniq.slice(0, 5)) {
      // Arena export is plain text when it works
      const tryUrls = [
        `https://www.mtggoldfish.com/deck/arena_download/${deckId}`,
        `https://www.mtggoldfish.com/deck/download/${deckId}`,
      ];
      for (const u of tryUrls) {
        try {
          const text = await getText(u);
          // Cloudflare challenge pages are HTML
          if (text.includes("<!DOCTYPE") || text.includes("Just a moment")) continue;
          const parsed = parseDeckText(text);
          if (parsed.mainCount >= 50 && parsed.mainCount <= 100) {
            return {
              deckId,
              name: displayName,
              mainboard: parsed.mainboard,
              sideboard: parsed.sideboard,
              url: `https://www.mtggoldfish.com/deck/${deckId}`,
              listQuality: "authoritative",
              source: "mtggoldfish",
            };
          }
        } catch {
          /* next */
        }
      }
      await sleep(200);
    }
  } catch (e) {
    console.warn("[goldfish-list]", displayName, e.message);
  }
  return null;
}

/** Map our format id + archetype name → goldfish slug when known */
export const GOLDFISH_ARCHETYPE_SLUGS = {
  standard: {
    "Izzet Prowess": "standard-izzet-prowess-woe",
    "Izzet Spellementals": "standard-izzet-spellementals-woe",
    "Selesnya Ouroboroid": "standard-selesnya-ouroboroid-woe",
    "Jeskai Lessons": "standard-jeskai-lessons-woe",
    "4c Control": "standard-4c-control-woe",
    "Dimir Excruciator": "standard-dimir-excruciator-woe",
    "Mono-Green Landfall": "standard-mono-green-landfall-woe",
    "Selesnya Gearhulk": "standard-selesnya-gearhulk-woe",
    "Izzet Lessons": "standard-izzet-lessons-woe",
    "Azorius Momo": "standard-azorius-momo-woe",
    "Mardu Discard": "standard-mardu-discard-woe",
    "Dimir Reanimator": "standard-dimir-reanimator-woe",
    "Mono-Red Aggro": "standard-mono-red-aggro-woe",
  },
  pioneer: {
    "Rakdos Midrange": "pioneer-rakdos-midrange",
    "Azorius Control": "pioneer-azorius-control",
    "Izzet Phoenix": "pioneer-izzet-phoenix",
  },
  historic: {
    "Jeskai Control": "historic-jeskai-control",
    "Jund Midrange": "historic-jund",
  },
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * For each format deck in the bundle, try to replace mainboard/sideboard with
 * an authoritative Goldfish export. Tags listQuality on every deck.
 */
export async function applyAuthoritativeLists(bundle) {
  let upgraded = 0;
  let failed = 0;

  for (const fmt of bundle.formats) {
    const slugMap = GOLDFISH_ARCHETYPE_SLUGS[fmt.id] || {};
    for (const mode of ["bo1DeckIds", "bo3DeckIds"]) {
      const ids = fmt[mode] || [];
      for (const id of ids) {
        const deck = bundle.decks[id];
        if (!deck) continue;

        // Default tag
        if (!deck.listQuality) deck.listQuality = "fallback";

        const slug = slugMap[deck.name] || slugMap[deck.archetype];
        if (!slug) {
          deck.listQuality = deck.listQuality || "fallback";
          deck.listNote =
            deck.listNote ||
            "No Goldfish archetype slug mapped — list not auto-verified.";
          continue;
        }

        const live = await fetchGoldfishArchetypeList(slug, deck.name);
        await sleep(350);

        if (live && live.mainboard?.length) {
          deck.mainboard = live.mainboard;
          // Keep full export for both modes (accuracy > BO1 aesthetics)
          deck.sideboard = live.sideboard || [];
          deck.listQuality = "authoritative";
          deck.listNote = `Mainboard from MTGGoldfish deck #${live.deckId}`;
          deck.sources = [
            { name: "MTGGoldfish deck", url: live.url },
            {
              name: "MTGGoldfish archetype",
              url: `https://www.mtggoldfish.com/archetype/${slug}`,
            },
            ...(deck.sources || []).filter((s) => !/MTGGoldfish/i.test(s.name)),
          ];
          // Rebuild arena import string
          deck.arenaImport = buildArenaImport(deck);
          upgraded++;
          console.log(`  ✓ ${fmt.id} ${deck.mode} ${deck.name} ← deck ${live.deckId} (${live.mainboard.reduce((s, c) => s + c.count, 0)} cards)`);
        } else {
          failed++;
          deck.listQuality = "fallback";
          deck.listNote =
            "Could not download Goldfish export (CF/block/missing). Falling back to last known list — verify legality.";
          console.log(`  ✗ ${fmt.id} ${deck.name} — export unavailable`);
        }
      }
    }
  }

  bundle.pipeline = {
    ...(bundle.pipeline || {}),
    authoritativeLists: upgraded,
    failedLists: failed,
    listPolicy: "prefer-goldfish-export-never-invent-when-available",
  };

  return bundle;
}

function buildArenaImport(deck) {
  const lines = [];
  if (deck.commander) {
    lines.push("Commander", `1 ${deck.commander}`, "");
  }
  lines.push("Deck");
  for (const c of deck.mainboard) lines.push(`${c.count} ${c.name}`);
  if (deck.sideboard?.length) {
    lines.push("", "Sideboard");
    for (const c of deck.sideboard) lines.push(`${c.count} ${c.name}`);
  }
  return lines.join("\n");
}

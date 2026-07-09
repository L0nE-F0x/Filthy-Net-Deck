/**
 * Official magic.gg decklists — Arena ranked + championship posts.
 * https://magic.gg/decklists
 */
import { getText, sleep } from "./common.mjs";
import { guessArchetype, inferColorsFromCards } from "./archetypeGuess.mjs";

function mapFormatFromSlug(slug = "") {
  if (/historic/i.test(slug)) return "historic";
  if (/pioneer|explorer/i.test(slug)) return "pioneer";
  if (/alchemy/i.test(slug)) return "alchemy";
  if (/timeless|modern|legacy|vintage/i.test(slug)) return "timeless";
  if (/brawl/i.test(slug) && /standard/i.test(slug)) return "standard_brawl";
  if (/brawl/i.test(slug)) return "brawl";
  return "standard";
}

export async function fetchMagicGgIndex() {
  const html = await getText("https://magic.gg/decklists");
  const links = [];
  const re2 = /href="(\/decklists\/[a-z0-9-]+)"/gi;
  const seen = new Set();
  let m;
  while ((m = re2.exec(html)) !== null) {
    const path = m[1];
    if (seen.has(path)) continue;
    seen.add(path);
    const slug = path.replace("/decklists/", "");
    // skip pure cube for deck assignment
    if (/cube/i.test(slug)) continue;
    const title = slug.replace(/-/g, " ");
    links.push({
      path,
      url: `https://magic.gg${path}`,
      slug,
      title,
      format: mapFormatFromSlug(slug),
    });
  }
  return links.slice(0, 24);
}

/**
 * Parse a magic.gg article body for "N Card Name" runs and split into decks.
 * Official pages dump continuous deck blocks with real Standard lists.
 */
export async function fetchMagicGgArticleDecks(articleUrl, format = "standard") {
  try {
    const html = await getText(articleUrl);
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/h[1-6]>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/[ \t]+/g, " ");

    // Card lines: "4 Card Name". Do NOT allow digits inside the name capture —
    // otherwise "4 Thornspire Verge 4 Stomping" becomes one token.
    const tokens = [];
    const re =
      /\b(\d{1,2})\s+([A-Z][A-Za-z][A-Za-z',./\-]*(?:\s+[A-Za-z][A-Za-z0-9',./\-]*){0,5})(?=\s+\d{1,2}\s+[A-Z]|\s*$)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const count = parseInt(m[1], 10);
      let name = m[2].trim().replace(/\s+/g, " ");
      if (count < 1 || count > 20) continue;
      if (name.length < 3 || name.length > 42) continue;
      // Safety: if a qty still leaked in, cut it
      if (/\s\d{1,2}\s+[A-Z]/.test(name)) {
        name = name.replace(/\s\d{1,2}\s+[A-Z].*$/, "").trim();
      }
      if (
        /^(Layout|Latest|These|Learn|Back|July|June|May|Posted|Traditional|Ranked|Decklists|Magic|Copy)/i.test(
          name,
        )
      )
        continue;
      tokens.push({ count, name });
    }

    const decks = [];
    let cur = [];
    let curN = 0;
    for (const t of tokens) {
      if (curN + t.count > 75 && curN >= 55) {
        finalizeDeck(cur, decks);
        cur = [];
        curN = 0;
      }
      cur.push(t);
      curN += t.count;
      if (curN >= 70 && curN <= 90) {
        // peel sideboard of ~15 if total looks like 75
        let sb = [];
        let sbN = 0;
        const main = [...cur];
        while (main.length && sbN < 15) {
          const last = main[main.length - 1];
          if (sbN + last.count > 15) break;
          sb.unshift(main.pop());
          sbN += last.count;
        }
        const mainN = main.reduce((s, c) => s + c.count, 0);
        if (mainN >= 55 && mainN <= 64 && sbN >= 10 && sbN <= 15) {
          decks.push({
            mainboard: main,
            sideboard: sb,
            mainCount: mainN,
          });
          cur = [];
          curN = 0;
        }
      }
    }
    if (curN >= 55 && curN <= 70) {
      finalizeDeck(cur, decks);
    }

    return decks.slice(0, 32).map((d, i) => {
      const colors = inferColorsFromCards(d.mainboard);
      const name = guessArchetype(d.mainboard) || undefined;
      return {
        ...d,
        name,
        colors,
        source: "magic.gg",
        sourceLabel: "magic.gg official",
        url: articleUrl,
        note: `magic.gg ranked/official post · list #${i + 1}${name ? ` · ${name}` : ""}`,
        format,
        listQuality: "authoritative",
      };
    });
  } catch (e) {
    console.warn("[magic.gg]", e.message);
    return [];
  }
}

function finalizeDeck(cur, decks) {
  const mainN = cur.reduce((s, c) => s + c.count, 0);
  if (mainN >= 55 && mainN <= 70) {
    decks.push({ mainboard: [...cur], sideboard: [], mainCount: mainN });
  }
}

export async function collectMagicGgLists() {
  console.log("  magic.gg: index…");
  let index = [];
  try {
    index = await fetchMagicGgIndex();
  } catch (e) {
    console.warn("  magic.gg index failed", e.message);
    index = [
      {
        url: "https://magic.gg/decklists/traditional-standard-ranked-decklists-july-6-2026",
        format: "standard",
        title: "Traditional Standard Ranked July 6 2026",
        slug: "traditional-standard-ranked-decklists-july-6-2026",
      },
    ];
  }
  console.log(`  magic.gg: ${index.length} article links`);

  const tournaments = index.slice(0, 12).map((a, i) => ({
    id: `magicgg-${a.slug || i}`,
    name: a.title || a.slug || "magic.gg decklists",
    format: a.format || "standard",
    platform: /arena|ranked|traditional/i.test(a.title || a.slug || "")
      ? "mtga"
      : "paper",
    date: new Date().toISOString().slice(0, 10),
    url: a.url,
    topDecks: [],
    notes: "Official magic.gg decklist publication",
    source: "magic.gg",
  }));

  // Pull decks from newest Standard + one other format post
  const stdPosts = index.filter((a) => a.format === "standard").slice(0, 2);
  const other = index.find((a) => a.format !== "standard");
  const toFetch = [...stdPosts];
  if (other) toFetch.push(other);

  const lists = [];
  for (const post of toFetch) {
    await sleep(400);
    const decks = await fetchMagicGgArticleDecks(
      post.url,
      post.format || "standard",
    );
    lists.push(...decks);
    console.log(
      `  magic.gg: parsed ${decks.length} deck blocks from ${post.slug || post.url}`,
    );
  }

  return { tournaments, lists };
}

/**
 * A4 - Public meta site: static HTML from website/meta/latest.json + history.json.
 * Funnels search traffic to the free Windows/macOS download.
 *
 * Usage:
 *   node pipeline/build-meta-site.mjs
 * Called automatically at the end of `npm run meta` after latest.json is written.
 *
 * Output under website/meta-web/ (Netlify publish root = website/).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const SITE = "https://filthy-net-deck.com";
const OUT = join(root, "website", "meta-web");
const META_DIR = join(root, "website", "meta");

function resolveDownloads() {
  let ver = "1.5.1";
  try {
    const v = JSON.parse(readFileSync(join(root, "website", "version.json"), "utf8"));
    if (v?.version) ver = String(v.version);
  } catch {
    /* keep default */
  }
  // Meta-web pages are static and nothing regenerates them on release, so a
  // version-pinned binary link rots (and 404s once old installers are pruned).
  // Send visitors to the homepage download section — that is always current.
  return {
    ver,
    win: `../index.html#download`,
    mac: `../index.html#download`,
    winDeep: `../../index.html#download`,
    macDeep: `../../index.html#download`,
  };
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function modeLabel(mode) {
  return mode === "bo3" ? "Bo3" : "Bo1";
}

function colorsText(colors) {
  if (!Array.isArray(colors) || !colors.length) return "-";
  return colors.join("");
}

const COLOR_NAMES = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };

/** "Blue / Red" — spelled out, because that is how people search. */
function colorsLong(colors) {
  if (!Array.isArray(colors) || !colors.length) return "Colorless";
  return colors.map((c) => COLOR_NAMES[c] || c).join(" / ");
}

/**
 * The pipeline omits `type` for lands (verified 2026-07-30: all 259 untyped
 * rows across the feed are lands, every one at cmc 0). So a missing type means
 * land, and that is the only safe way to split them out.
 */
function isLand(card) {
  return card?.type == null;
}

/** Copies, not distinct rows — a playset of 4 should count as 4. */
function copies(cards, pred) {
  return (cards || []).reduce((n, c) => (pred(c) ? n + (c.count || 0) : n), 0);
}

function manaCurve(mainboard) {
  const spells = (mainboard || []).filter((c) => !isLand(c));
  if (!spells.length) return "";
  const buckets = [
    { label: "1", test: (c) => c.cmc <= 1 },
    { label: "2", test: (c) => c.cmc === 2 },
    { label: "3", test: (c) => c.cmc === 3 },
    { label: "4", test: (c) => c.cmc === 4 },
    { label: "5", test: (c) => c.cmc === 5 },
    { label: "6+", test: (c) => c.cmc >= 6 },
  ].map((b) => ({ ...b, n: copies(spells, b.test) }));

  const max = Math.max(...buckets.map((b) => b.n), 1);
  const totalSpells = copies(spells, () => true);
  const avg = totalSpells
    ? (spells.reduce((s, c) => s + (c.cmc || 0) * (c.count || 0), 0) / totalSpells).toFixed(2)
    : "0";

  const bars = buckets
    .map(
      (b) => `
        <div class="curve-col">
          <span class="curve-n">${b.n || ""}</span>
          <span class="curve-bar" style="height:${Math.round((b.n / max) * 72)}px"></span>
          <span class="curve-x">${esc(b.label)}</span>
        </div>`,
    )
    .join("");

  return `
    <section class="curve-block">
      <h2>Mana curve</h2>
      <div class="curve">${bars}</div>
      <p class="hint">${esc(totalSpells)} spells · average mana value <strong>${esc(avg)}</strong> (lands excluded)</p>
    </section>`;
}

function composition(mainboard) {
  const rows = [
    ["Creatures", copies(mainboard, (c) => c.type === "creature")],
    ["Instants", copies(mainboard, (c) => c.type === "instant")],
    ["Sorceries", copies(mainboard, (c) => c.type === "sorcery")],
    ["Artifacts", copies(mainboard, (c) => c.type === "artifact")],
    ["Enchantments", copies(mainboard, (c) => c.type === "enchantment")],
    ["Planeswalkers", copies(mainboard, (c) => c.type === "planeswalker")],
    ["Lands", copies(mainboard, isLand)],
  ].filter(([, n]) => n > 0);
  if (!rows.length) return "";
  return `
    <section class="comp-block">
      <h2>Composition</h2>
      <ul class="comp">
        ${rows.map(([k, n]) => `<li><span class="comp-n">${n}</span><span class="comp-k">${esc(k)}</span></li>`).join("")}
      </ul>
    </section>`;
}

/**
 * The key cards with art — gives the page a visual identity above the fold.
 *
 * `keyCards` comes from the MTGGoldfish meta tile while the list comes from the
 * archetype page, so the two occasionally disagree: 3 of 87 key cards across
 * the current feed appear in neither the mainboard nor the sideboard. Those are
 * dropped rather than rendered as a bare caption with no art and no count — the
 * grid auto-fits, so 1, 2 or 3 all lay out correctly.
 */
function keyCardStrip(deck) {
  const found = artCards(deck, 4);
  if (!found.length) return "";

  const items = found
    .map(
      (c) => `<figure class="key-card">
        <img src="${esc(scryfallImg(c))}" alt="${esc(c.name)}" loading="lazy" width="200" height="146" />
        <figcaption>${esc(c.name)}${c.count ? ` <span class="qty">${esc(c.count)}×</span>` : ""}</figcaption>
      </figure>`,
    )
    .join("");
  return `
    <section class="key-strip">
      <h2>Key cards</h2>
      <div class="key-row">${items}</div>
    </section>`;
}

/**
 * Internal links to sibling decks. Deck pages were previously dead ends —
 * nothing linked out to another deck, which is bad for crawling and worse for
 * a reader who wants to compare.
 */
function relatedDecks(bundle, deck) {
  // Board decks only: off-meta recognition decks get no pages (see below),
  // so linking them would 404.
  const siblings = Object.values(bundle.decks || {})
    .filter((d) => !d.offMeta)
    .filter((d) => d.format === deck.format && d.mode === deck.mode && d.id !== deck.id)
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
    .slice(0, 6);
  if (!siblings.length) return "";
  const fmtName = deck.format === "pioneer" ? "Pioneer" : "Standard";
  return `
    <section class="related">
      <h2>Other ${esc(fmtName)} ${esc(modeLabel(deck.mode))} decks</h2>
      <ul class="related-list">
        ${siblings
          .map(
            (d) => `<li><a href="${esc(d.id)}.html">
              <span class="r-rank">#${esc(d.rank)}</span>
              <span class="r-name">${esc(d.name)}</span>
              <span class="r-pct">${d.metaShare != null ? esc(Number(d.metaShare).toFixed(1)) + "%" : ""}</span>
            </a></li>`,
          )
          .join("")}
      </ul>
      <p class="hint"><a href="${esc(deck.format)}.html">Full ${esc(fmtName)} metagame →</a></p>
    </section>`;
}

function scryfallImg(card) {
  const id = card?.scryfallId;
  if (!id) return null;
  // small art crop - public CDN, no API key
  return `https://cards.scryfall.io/art_crop/front/${id[0]}/${id[1]}/${id}.jpg`;
}

function isLandCard(c) {
  const t = String(c?.type || "").toLowerCase();
  return !t || t.includes("land");
}

/** Prefer Goldfish key cards that are actually in the list; else top non-lands. */
function artCards(deck, n = 4) {
  const pool = [...(deck.mainboard || [])];
  const byName = new Map(pool.map((c) => [c.name, c]));
  const fromKeys = (deck.keyCards || [])
    .map((name) => byName.get(name))
    .filter((c) => c && scryfallImg(c) && !isLandCard(c));
  const rest = pool
    .filter((c) => scryfallImg(c) && !isLandCard(c))
    .sort((a, b) => (b.count || 0) - (a.count || 0));
  const seen = new Set();
  const out = [];
  for (const c of [...fromKeys, ...rest]) {
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    out.push(c);
    if (out.length >= n) break;
  }
  return out;
}

function typeBucket(c) {
  if (isLandCard(c)) return "land";
  const t = String(c.type || "").toLowerCase();
  if (t.includes("creature")) return "creature";
  if (t.includes("planeswalker")) return "planeswalker";
  if (t.includes("battle")) return "battle";
  if (t.includes("instant")) return "instant";
  if (t.includes("sorcery")) return "sorcery";
  if (t.includes("enchantment")) return "enchantment";
  if (t.includes("artifact")) return "artifact";
  return "other";
}

const TYPE_LABELS = {
  creature: "Creatures",
  planeswalker: "Planeswalkers",
  instant: "Instants",
  sorcery: "Sorceries",
  enchantment: "Enchantments",
  artifact: "Artifacts",
  battle: "Battles",
  other: "Other",
  land: "Lands",
};

function layout({ title, description, canonicalPath, body, active, jsonLd, extraScripts = "" }) {
  const canon = `${SITE}${canonicalPath}`;
  // Was pinned at ?v=1.5.1 and never updated, so social caches kept a stale card.
  const ogv = resolveDownloads().ver;
  const ld = jsonLd
    ? `
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${esc(canon)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${esc(canon)}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:image" content="${SITE}/assets/og-image.png?v=${ogv}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${SITE}/assets/og-image.png?v=${ogv}" />
  <link rel="icon" href="../assets/app-icon.png" />
  <link rel="stylesheet" href="site.css" />${ld}
</head>
<body>
  <header class="top">
    <a class="brand" href="../">
      <img src="../assets/app-icon.png" alt="" width="36" height="36" />
      <span>
        <strong>Filthy Net Deck</strong>
        <small>Public meta</small>
      </span>
    </a>
    <nav>
      <a href="index.html" class="${active === "hub" ? "on" : ""}">Today</a>
      <a href="standard.html" class="${active === "standard" ? "on" : ""}">Standard</a>
      <a href="pioneer.html" class="${active === "pioneer" ? "on" : ""}">Pioneer</a>
      <a href="cards.html" class="${active === "cards" ? "on" : ""}">Cards</a>
      <a class="cta" href="../#download">Download free</a>
    </nav>
  </header>
  <main>
${body}
  </main>
  <footer class="foot">
    <p>
      Real ranked lists only - every card name verified on Scryfall. Not affiliated with Wizards of the Coast.
      Built by <a href="https://ame-apexforge.org/" rel="noopener">ApexForge</a>.
    </p>
    <p class="foot-links">
      <a href="../">Home</a> ·
      <a href="../#download">Windows &amp; macOS app</a> &middot;
      <a href="../feedback.html">Suggest / Report</a> &middot;
      <a href="https://github.com/L0nE-F0x/Filthy-Net-Deck">GitHub</a>
    </p>
  </footer>
  ${extraScripts}
</body>
</html>
`;
}

function downloadBanner(date, nest = 0) {
  const dl = resolveDownloads();
  const win = nest ? dl.winDeep : dl.win;
  const mac = nest ? dl.macDeep : dl.mac;
  return `
    <aside class="download-banner">
      <div>
        <strong>Track these decks in the free desktop app</strong>
        <p>Daily meta, overlay, and a local winrate tracker for Arena. Updated ${esc(date)}.</p>
      </div>
      <div class="dl-row">
        <a class="btn" href="${win}">Windows</a>
        <a class="btn ghost" href="${mac}">macOS</a>
      </div>
    </aside>`;
}

function deckCard(d) {
  const href = `deck/${esc(d.id)}.html`;
  const keys = artCards(d, 3).map((c) => c.name);
  const share = d.metaShare != null ? `${Number(d.metaShare).toFixed(1)}%` : "-";
  const arts = artCards(d, 4)
    .map((c) => `<img src="${esc(scryfallImg(c))}" alt="" loading="lazy" />`)
    .join("");
  return `
    <a class="deck-card" href="${href}">
      <div class="deck-rank">#${esc(d.rank)}</div>
      <div class="deck-body">
        <h3>${esc(d.name)}</h3>
        <p class="meta-line">
          <span class="pill">${esc(modeLabel(d.mode))}</span>
          <span class="pill soft">T${esc(d.tier ?? "-")}</span>
          <span class="pct">${esc(share)}</span>
          <span class="colors">${esc(colorsText(d.colors))}</span>
        </p>
        ${arts ? `<div class="deck-arts">${arts}</div>` : ""}
        ${keys.length ? `<p class="keys">${keys.map(esc).join(" · ")}</p>` : ""}
      </div>
    </a>`;
}

function cardThumb(c) {
  const img = scryfallImg(c);
  return img
    ? `<img class="thumb" src="${esc(img)}" alt="" loading="lazy" width="40" height="56" />`
    : `<span class="thumb empty"></span>`;
}

function listCards(cards, title) {
  if (!cards?.length) return "";
  const rows = cards
    .map((c) => {
      const thumb = cardThumb(c);
      // Every card name is a link to its own page. This is the other half of
      // the corpus expansion: the deck pages that already rank now feed ~320
      // card pages, and each card page links back.
      const slug = cardSlug(c.name);
      const label = esc(cardDisplayName(c.name));
      const name = slug
        ? `<a class="cname" href="../card/${esc(slug)}.html">${label}</a>`
        : `<span class="cname">${label}</span>`;
      return `<li>${thumb}<span class="qty">${esc(c.count)}×</span>${name}</li>`;
    })
    .join("\n");
  return `
    <section class="list-block">
      <h2>${esc(title)} <span class="count">(${cards.reduce((n, c) => n + (c.count || 0), 0)})</span></h2>
      <ul class="card-list">${rows}</ul>
    </section>`;
}

function stackedView(main, side) {
  const cols = new Map();
  const lands = [];
  for (const c of main || []) {
    if (typeBucket(c) === "land") {
      lands.push(c);
      continue;
    }
    const mv = Math.min(7, Math.max(0, Math.floor(c.cmc ?? 0)));
    const list = cols.get(mv) ?? [];
    list.push(c);
    cols.set(mv, list);
  }
  const blocks = [];
  for (const mv of [...cols.keys()].sort((a, b) => a - b)) {
    const rows = cols.get(mv);
    const count = rows.reduce((n, c) => n + (c.count || 0), 0);
    blocks.push({ key: `mv${mv}`, label: mv >= 7 ? "7+" : String(mv), rows, count });
  }
  if (lands.length) {
    blocks.push({
      key: "lands",
      label: "Lands",
      rows: lands,
      count: lands.reduce((n, c) => n + (c.count || 0), 0),
    });
  }
  if (side?.length) {
    blocks.push({
      key: "side",
      label: "SB",
      rows: side,
      count: side.reduce((n, c) => n + (c.count || 0), 0),
    });
  }
  if (!blocks.length) return "";
  return `<div class="view-stacked">
    ${blocks
      .map(
        (b) => `<div class="stack-col${b.key === "side" ? " is-side" : ""}">
        <p class="stack-head">${esc(b.label)} <span>${esc(b.count)}</span></p>
        ${b.rows
          .map((c) => {
            const img = scryfallImg(c);
            return `<div class="stack-card-row" title="${esc(c.name)}">
              ${img ? `<img src="${esc(img)}" alt="" loading="lazy" />` : `<span class="stack-empty"></span>`}
              <span class="stack-name">${esc(cardDisplayName(c.name))}</span>
              <span class="stack-qty">${esc(c.count)}</span>
            </div>`;
          })
          .join("")}
      </div>`,
      )
      .join("")}
  </div>`;
}

function compactView(main, side) {
  const byKey = new Map();
  for (const c of main || []) {
    const k = typeBucket(c);
    const list = byKey.get(k) ?? [];
    list.push(c);
    byKey.set(k, list);
  }
  const order = ["creature", "planeswalker", "instant", "sorcery", "enchantment", "artifact", "battle", "other", "land"];
  const groups = order
    .filter((k) => byKey.has(k))
    .map((k) => {
      const rows = byKey.get(k);
      return { label: TYPE_LABELS[k], rows, count: rows.reduce((n, c) => n + (c.count || 0), 0) };
    });
  if (side?.length) {
    groups.push({
      label: "Sideboard",
      rows: side,
      count: side.reduce((n, c) => n + (c.count || 0), 0),
    });
  }
  return `<div class="view-compact">
    ${groups
      .map(
        (g) => `<div class="compact-group">
        <p class="compact-head">${esc(g.label)} <span>(${esc(g.count)})</span></p>
        ${g.rows.map((c) => `<p class="compact-row"><span>${esc(c.count)}</span>${esc(cardDisplayName(c.name))}</p>`).join("")}
      </div>`,
      )
      .join("")}
  </div>`;
}

function deckLists(deck) {
  return `<div class="lists" data-deck-views data-view="stacked">
    <div class="view-toolbar">
      <strong>Decklist</strong>
      <div class="view-toggle" role="group" aria-label="Decklist view">
        <button type="button" data-view="stacked" class="on" title="Arena-style mana columns">Stacked</button>
        <button type="button" data-view="list" title="Type groups with art rows">List</button>
        <button type="button" data-view="compact" title="Plain text">Text</button>
      </div>
    </div>
    ${stackedView(deck.mainboard, deck.sideboard)}
    <div class="view-list">
      ${listCards(deck.mainboard, "Mainboard")}
      ${listCards(deck.sideboard, "Sideboard")}
    </div>
    ${compactView(deck.mainboard, deck.sideboard)}
  </div>`;
}

function historySpark(points, archetype, format, mode) {
  const series = (points || [])
    .filter(
      (p) =>
        p.format === format &&
        p.mode === mode &&
        String(p.archetype).toLowerCase() === String(archetype).toLowerCase(),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  if (series.length < 2) return "";
  const last = series.slice(-14);
  const max = Math.max(...last.map((p) => p.pct), 1);
  const bars = last
    .map((p) => {
      const h = Math.max(4, Math.round((p.pct / max) * 48));
      return `<span class="bar" title="${esc(p.date)}: ${esc(p.pct)}%" style="height:${h}px"></span>`;
    })
    .join("");
  const firstPct = last[0].pct;
  const lastPct = last[last.length - 1].pct;
  const delta = (lastPct - firstPct).toFixed(1);
  const deltaClass = lastPct >= firstPct ? "up" : "down";
  return `
    <section class="trend">
      <h2>Meta share (recent)</h2>
      <div class="spark">${bars}</div>
      <p class="trend-note">
        ${esc(last[0].date)} → ${esc(last[last.length - 1].date)}:
        <strong class="${deltaClass}">${lastPct >= firstPct ? "+" : ""}${esc(delta)} pts</strong>
        (now ${esc(lastPct)}%)
      </p>
    </section>`;
}

function buildHub(bundle) {
  const date = bundle.date;
  const sections = (bundle.formats || [])
    .map((fmt) => {
      const bo1 = (fmt.bo1DeckIds || []).map((id) => bundle.decks[id]).filter(Boolean);
      const bo3 = (fmt.bo3DeckIds || []).map((id) => bundle.decks[id]).filter(Boolean);
      const top = bo1.slice(0, 5);

      // Every deck gets a link from the hub. Previously only the top 5 Bo1 were
      // linked, leaving 22 of 32 deck pages reachable only via a format page.
      const rest = [...bo1.slice(5), ...bo3];
      const restLinks = rest.length
        ? `
        <div class="all-decks">
          <h3>All ${esc(fmt.name)} decks</h3>
          <ul class="deck-links">
            ${rest
              .map(
                (d) =>
                  `<li><a href="deck/${esc(d.id)}.html">${esc(d.name)} <span class="dim">${esc(modeLabel(d.mode))} · #${esc(d.rank)}</span></a></li>`,
              )
              .join("")}
          </ul>
        </div>`
        : "";

      return `
      <section class="format-block">
        <div class="format-head">
          <h2>${esc(fmt.name)}</h2>
          <a class="more" href="${esc(fmt.id)}.html">Full ${esc(fmt.name)} meta →</a>
        </div>
        <div class="deck-grid">
          ${top.map(deckCard).join("\n")}
        </div>
        ${restLinks}
      </section>`;
    })
    .join("\n");

  const body = `
    <section class="hero">
      <p class="eyebrow"><span class="live"></span> Live metagame &middot; ${esc(date)}</p>
      <h1>Standard &amp; Pioneer meta - real lists only</h1>
      <p class="lede">
        Daily ranked archetypes with Scryfall-verified card names. Same feed that powers the
        Filthy Net Deck desktop app.
      </p>
    </section>
    ${downloadBanner(date)}
    ${sections}
    <section class="why">
      <h2>Why this page exists</h2>
      <p>
        Search engines can index today&rsquo;s meta. The free app adds Arena import, a list clinic,
        overlay, and a private winrate tracker that never leaves your PC.
      </p>
    </section>`;

  return layout({
    title: `MTG Standard & Pioneer Meta ${date} - Filthy Net Deck`,
    description: `Daily Standard and Pioneer metagame for ${date}. Real ranked lists, Scryfall-verified. Free Windows & macOS companion.`,
    canonicalPath: "/meta-web/",
    body,
    active: "hub",
  });
}

function buildFormat(bundle, history, fmtId) {
  const fmt = (bundle.formats || []).find((f) => f.id === fmtId);
  if (!fmt) return null;
  const date = bundle.date;
  const name = fmt.name;

  function modeSection(mode) {
    const ids = mode === "bo1" ? fmt.bo1DeckIds || [] : fmt.bo3DeckIds || [];
    const decks = ids.map((id) => bundle.decks[id]).filter(Boolean);
    if (!decks.length) return "";
    return `
      <section class="format-block">
        <h2>${esc(modeLabel(mode))} ladder</h2>
        <div class="deck-grid">
          ${decks.map(deckCard).join("\n")}
        </div>
      </section>`;
  }

  const shareTop = (fmt.metaShareTop || [])
    .map((s) => `<li><strong>${esc(s.name)}</strong> <span>${esc(s.pct)}%</span></li>`)
    .join("");

  const heroCards = [];
  const seenArt = new Set();
  for (const id of [...(fmt.bo1DeckIds || []), ...(fmt.bo3DeckIds || [])]) {
    const card = artCards(bundle.decks?.[id], 1)[0];
    if (!card || seenArt.has(card.name)) continue;
    seenArt.add(card.name);
    heroCards.push(card);
    if (heroCards.length >= 5) break;
  }
  const formatArt = heroCards.length
    ? `<div class="deck-hero-art format-hero-art" aria-hidden="true">${heroCards
        .map((c, i) => `<img class="dha dha-${i + 1}" src="${esc(scryfallImg(c))}" alt="" />`)
        .join("")}</div>`
    : "";

  const body = `
    <section class="hero slim deck-hero">
      <div class="deck-hero-copy">
        <p class="eyebrow"><a href="index.html">Meta</a> / ${esc(name)} · ${esc(date)}</p>
        <h1>${esc(name)} metagame</h1>
        <p class="lede">${esc(fmt.metaNotes || `Ranked ${name} archetypes for ${date}.`)}</p>
      </div>
      ${formatArt}
    </section>
    ${downloadBanner(date)}
    ${shareTop ? `<section class="share-top"><h2>Meta share leaders</h2><ol>${shareTop}</ol></section>` : ""}
    ${modeSection("bo1")}
    ${modeSection("bo3")}
  `;

  return layout({
    title: `${name} Meta ${date} - Filthy Net Deck`,
    description: `${name} MTG Arena metagame for ${date}. Top archetypes, real lists, free desktop app.`,
    canonicalPath: `/meta-web/${fmtId}.html`,
    body,
    active: fmtId,
  });
}

// ---------------------------------------------------------------------------
// Card pages (Phase 1 item A)
// ---------------------------------------------------------------------------
//
// One page per distinct card in the ranked field — the largest corpus
// expansion available to this site: 32 deck pages become ~320 card pages, each
// answering a query people actually type ("what decks play <card>"), and each
// linking back into the deck pages that already rank.
//
// Every number here is counted from the same feed the app uses. There is no
// oracle text in that feed, so these pages never describe what a card *does* —
// inventing that would break the no-fabrication rule the rest of the pipeline
// keeps.

/** URL-safe, stable slug. DFC front face only, matching the app's convention. */
function cardSlug(name) {
  return String(name ?? "")
    .split("//")[0]
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Front-face display name, so an "A // B" card reads as "A". */
function cardDisplayName(name) {
  return String(name ?? "").split("//")[0].trim();
}

/**
 * Every distinct card across the ranked boards, with the decks that play it.
 * Off-meta recognition decks are excluded for the same reason deck pages skip
 * them: they have no page to link to.
 */
function collectCards(bundle) {
  const out = new Map();
  const decks = Object.values(bundle.decks || {}).filter((d) => !d.offMeta);
  for (const deck of decks) {
    const add = (entry, board) => {
      const slug = cardSlug(entry.name);
      if (!slug) return;
      let card = out.get(slug);
      if (!card) {
        card = {
          slug,
          name: cardDisplayName(entry.name),
          scryfallId: entry.scryfallId,
          cmc: entry.cmc,
          type: entry.type,
          land: Boolean(entry.land),
          plays: [],
        };
        out.set(slug, card);
      }
      // First sighting wins for art; later ones only fill gaps.
      if (!card.scryfallId && entry.scryfallId) card.scryfallId = entry.scryfallId;
      if (card.cmc == null && entry.cmc != null) card.cmc = entry.cmc;
      if (!card.type && entry.type) card.type = entry.type;
      const existing = card.plays.find((p) => p.deck.id === deck.id);
      if (existing) {
        existing[board] += entry.count || 0;
      } else {
        card.plays.push({
          deck,
          main: board === "main" ? entry.count || 0 : 0,
          side: board === "side" ? entry.count || 0 : 0,
        });
      }
    };
    for (const c of deck.mainboard || []) add(c, "main");
    for (const c of deck.sideboard || []) add(c, "side");
  }
  for (const card of out.values()) {
    card.plays.sort(
      (a, b) =>
        b.main + b.side - (a.main + a.side) || (a.deck.rank ?? 99) - (b.deck.rank ?? 99),
    );
  }
  return out;
}

/** Cards sharing the most decks with this one — internal links that earn it. */
function alsoPlayed(card, cardsBySlug, limit = 8) {
  const mine = new Set(card.plays.map((p) => p.deck.id));
  const scored = [];
  for (const other of cardsBySlug.values()) {
    if (other.slug === card.slug) continue;
    const shared = other.plays.filter((p) => mine.has(p.deck.id)).length;
    if (shared > 0) scored.push({ card: other, shared });
  }
  return scored
    .sort(
      (a, b) =>
        b.shared - a.shared ||
        a.card.plays.length - b.card.plays.length ||
        a.card.name.localeCompare(b.card.name),
    )
    .slice(0, limit);
}

function typeLabel(card) {
  if (card.land) return "Land";
  if (!card.type) return "Spell";
  return String(card.type).charAt(0).toUpperCase() + String(card.type).slice(1);
}

function buildCard(bundle, card, cardsBySlug) {
  const date = bundle.date;
  const boards = Object.values(bundle.decks || {}).filter((d) => !d.offMeta);
  const formats = [...new Set(card.plays.map((p) => p.deck.format))];
  const fmtNames = formats.map((f) => (f === "pioneer" ? "Pioneer" : "Standard"));
  // The denominator has to be the same population the sentence names. Counting
  // "2 of the 32 ranked Pioneer decks" when only 16 are Pioneer is exactly the
  // kind of true-ish number the rest of this pipeline refuses to print.
  const peers = boards.filter((d) => formats.includes(d.format));
  const totalCopies = card.plays.reduce((n, p) => n + p.main + p.side, 0);
  const avg = card.plays.length ? (totalCopies / card.plays.length).toFixed(1) : "0";
  const img = scryfallImg(card);

  // "7 of 16 Standard Bo1 decks" — counted per format+mode, so the denominator
  // is a real comparison group rather than the whole field.
  const groups = [];
  for (const fmt of ["standard", "pioneer"]) {
    for (const mode of ["bo1", "bo3"]) {
      const pool = boards.filter((d) => d.format === fmt && d.mode === mode);
      if (!pool.length) continue;
      const playing = card.plays.filter(
        (p) => p.deck.format === fmt && p.deck.mode === mode,
      ).length;
      if (!playing) continue;
      groups.push({
        label: `${fmt === "pioneer" ? "Pioneer" : "Standard"} ${modeLabel(mode)}`,
        playing,
        total: pool.length,
      });
    }
  }

  const rows = card.plays
    .map((p) => {
      const fmtName = p.deck.format === "pioneer" ? "Pioneer" : "Standard";
      const copies = [p.main ? `${p.main}× main` : "", p.side ? `${p.side}× side` : ""]
        .filter(Boolean)
        .join(" · ");
      const share =
        p.deck.metaShare != null
          ? ` · ${esc(Number(p.deck.metaShare).toFixed(1))}% meta`
          : "";
      return `<li>
        <a href="../deck/${esc(p.deck.id)}.html">
          <span class="r-rank">#${esc(p.deck.rank)}</span>
          <span class="r-name">${esc(p.deck.name)}</span>
          <span class="r-pct">${esc(copies)}</span>
        </a>
        <span class="hint">${esc(fmtName)} ${esc(modeLabel(p.deck.mode))}${share}</span>
      </li>`;
    })
    .join("\n");

  const also = alsoPlayed(card, cardsBySlug);
  const alsoBlock = also.length
    ? `<section class="related">
        <h2>Often played alongside</h2>
        <ul class="related-list">
          ${also
            .map(
              (a) => `<li><a href="${esc(a.card.slug)}.html">
                <span class="r-name">${esc(a.card.name)}</span>
                <span class="r-pct">${esc(a.shared)} shared deck${a.shared === 1 ? "" : "s"}</span>
              </a></li>`,
            )
            .join("")}
        </ul>
      </section>`
    : "";

  const body = `
    <section class="hero slim">
      <p class="eyebrow">
        <a href="index.html">Meta</a> /
        <a href="cards.html">Cards</a> /
        ${esc(date)}
      </p>
      <div class="card-head">
        ${
          img
            ? `<img class="card-art" src="${esc(img)}" alt="${esc(card.name)}" width="240" height="176" loading="lazy" />`
            : ""
        }
        <div>
          <h1>${esc(card.name)}</h1>
          <p class="meta-line big">
            <span class="pill">${esc(typeLabel(card))}</span>
            ${card.land ? "" : `<span class="pill soft">Mana value ${esc(card.cmc ?? "-")}</span>`}
            <span class="pct">${esc(card.plays.length)} ranked deck${card.plays.length === 1 ? "" : "s"}</span>
          </p>
          <p class="lede">
            ${esc(card.name)} appears in ${esc(card.plays.length)} of the ${esc(peers.length)}
            ranked ${esc(fmtNames.join(" and ") || "Standard")} decks tracked on ${esc(date)},
            at an average of ${esc(avg)} copies per deck that plays it.
          </p>
        </div>
      </div>
    </section>
    ${downloadBanner(date, 1)}
    ${
      groups.length
        ? `<section class="list-block">
            <h2>Field presence</h2>
            <ul class="presence">
              ${groups
                .map(
                  (g) => `<li><strong>${esc(g.playing)} of ${esc(g.total)}</strong>
                    <span>${esc(g.label)} decks</span></li>`,
                )
                .join("")}
            </ul>
            <p class="hint">Counted from today's ranked boards — not an estimate.</p>
          </section>`
        : ""
    }
    <section class="related">
      <h2>Decks playing ${esc(card.name)}</h2>
      <ul class="related-list wide">${rows}</ul>
    </section>
    ${alsoBlock}
    <p class="hint"><a href="cards.html">← Every card in the ranked field</a></p>
  `;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Meta", item: `${SITE}/meta-web/` },
      { "@type": "ListItem", position: 2, name: "Cards", item: `${SITE}/meta-web/cards.html` },
      {
        "@type": "ListItem",
        position: 3,
        name: card.name,
        item: `${SITE}/meta-web/card/${card.slug}.html`,
      },
    ],
  };

  let html = layout({
    title: `${card.name} — which decks play it (${date}) · Filthy Net Deck`,
    description: `Which ranked ${fmtNames.join(" and ") || "Standard"} decks play ${card.name} on ${date}: ${card.plays.length} of ${peers.length} tracked lists, ${avg} copies on average. Real decklists, Scryfall-verified.`,
    canonicalPath: `/meta-web/card/${card.slug}.html`,
    body,
    active: "cards",
    jsonLd,
  });

  // Nested one level under meta-web/, same rewrite the deck pages need.
  html = html
    .replaceAll('href="../"', 'href="../../"')
    .replaceAll('href="../#download"', 'href="../../#download"')
    .replaceAll('href="../feedback.html"', 'href="../../feedback.html"')
    .replaceAll('href="../assets/', 'href="../../assets/')
    .replaceAll('src="../assets/', 'src="../../assets/')
    .replaceAll('href="site.css"', 'href="../site.css"')
    .replaceAll('href="index.html"', 'href="../index.html"')
    .replaceAll('href="standard.html"', 'href="../standard.html"')
    .replaceAll('href="pioneer.html"', 'href="../pioneer.html"')
    .replaceAll('href="cards.html"', 'href="../cards.html"')
    .replaceAll(`href="${resolveDownloads().win}"`, `href="${resolveDownloads().winDeep}"`)
    .replaceAll(`href="${resolveDownloads().mac}"`, `href="${resolveDownloads().macDeep}"`);

  return html;
}

/** The index that keeps 300+ card pages from being orphans. */
function buildCardIndex(bundle, cardsBySlug) {
  const date = bundle.date;
  const cards = [...cardsBySlug.values()].sort((a, b) => a.name.localeCompare(b.name));
  const byLetter = new Map();
  for (const c of cards) {
    const ch = /^[a-z]/i.test(c.name) ? c.name[0].toUpperCase() : "#";
    if (!byLetter.has(ch)) byLetter.set(ch, []);
    byLetter.get(ch).push(c);
  }
  const anchorFor = (l) => (l === "#" ? "num" : l.toLowerCase());
  const sections = [...byLetter.entries()]
    .map(
      ([letter, list]) => `
      <section class="list-block">
        <h2 id="${esc(anchorFor(letter))}">${esc(letter)}</h2>
        <ul class="card-index">
          ${list
            .map(
              (c) => `<li><a href="card/${esc(c.slug)}.html">${esc(c.name)}</a>
                <span class="qty">${esc(c.plays.length)}</span></li>`,
            )
            .join("")}
        </ul>
      </section>`,
    )
    .join("\n");

  const jumps = [...byLetter.keys()]
    .map((l) => `<a href="#${esc(anchorFor(l))}">${esc(l)}</a>`)
    .join(" ");

  const body = `
    <section class="hero slim">
      <p class="eyebrow"><a href="index.html">Meta</a> / Cards / ${esc(date)}</p>
      <h1>Every card in the ranked field</h1>
      <p class="lede">
        ${esc(cards.length)} distinct cards across today's ranked Standard and Pioneer
        decks. Each page lists exactly which decks play it and how many copies —
        counted from the same lists the app tracks, updated ${esc(date)}.
      </p>
      <p class="jump">${jumps}</p>
    </section>
    ${downloadBanner(date)}
    ${sections}
  `;

  return layout({
    title: `Every card in the ranked Standard & Pioneer field (${date}) · Filthy Net Deck`,
    description: `All ${cards.length} cards played across today's ranked Standard and Pioneer decks, each with the decks that play it and how many copies. Updated ${date}.`,
    canonicalPath: `/meta-web/cards.html`,
    body,
    active: "cards",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Cards in the ranked field",
      url: `${SITE}/meta-web/cards.html`,
      numberOfItems: cards.length,
    },
  });
}

function buildDeck(bundle, history, deck) {
  const date = bundle.date;
  const fmtName = deck.format === "pioneer" ? "Pioneer" : "Standard";
  const share = deck.metaShare != null ? `${Number(deck.metaShare).toFixed(1)}%` : "-";
  const sources = (deck.sources || [])
    .map((s) => `<li><a href="${esc(s.url)}" rel="noopener nofollow">${esc(s.name)}</a></li>`)
    .join("");
  const arena = deck.arenaImport
    ? `<section class="import">
        <h2>Arena import</h2>
        <pre class="arena">${esc(deck.arenaImport)}</pre>
        <p class="hint">Copy into MTG Arena, or use one-click import in the free Filthy Net Deck app.</p>
      </section>`
    : "";

  const heroArts = artCards(deck, 4)
    .map((c, i) => `<img class="dha dha-${i + 1}" src="${esc(scryfallImg(c))}" alt="${esc(c.name)}" />`)
    .join("");

  const body = `
    <section class="hero slim deck-hero">
      <div class="deck-hero-copy">
        <p class="eyebrow">
          <a href="index.html">Meta</a> /
          <a href="${esc(deck.format)}.html">${esc(fmtName)}</a> /
          ${esc(modeLabel(deck.mode))} &middot; ${esc(date)}
        </p>
        <h1>${esc(deck.name)}</h1>
        <p class="meta-line big">
          <span class="pill">#${esc(deck.rank)}</span>
          <span class="pill soft">Tier ${esc(deck.tier ?? "-")}</span>
          <span class="pct">${esc(share)} meta</span>
          <span class="colors">${esc(colorsText(deck.colors))}</span>
          <span class="pill soft">${esc(modeLabel(deck.mode))}</span>
        </p>
        <p class="lede">${esc(deck.description || deck.listNote || "")}</p>
        <p class="hint">
          ${esc(colorsLong(deck.colors))} · ${esc(fmtName)} ${esc(modeLabel(deck.mode))} ·
          ranked #${esc(deck.rank)} of the ${esc(fmtName)} ladder on ${esc(date)}
        </p>
      </div>
      ${heroArts ? `<div class="deck-hero-art" aria-hidden="true">${heroArts}</div>` : ""}
    </section>
    ${downloadBanner(date, 1)}
    ${keyCardStrip(deck)}
    ${historySpark(history.points, deck.archetype || deck.name, deck.format, deck.mode)}
    <div class="stat-row">
      ${manaCurve(deck.mainboard)}
      ${composition(deck.mainboard)}
    </div>
    ${deckLists(deck)}
    ${arena}
    ${relatedDecks(bundle, deck)}
    ${sources ? `<section class="sources"><h2>Sources</h2><ul>${sources}</ul><p class="hint">listQuality: ${esc(deck.listQuality || "unknown")}</p></section>` : ""}
  `;

  // Fix relative nav for deck/* pages: CSS and assets need ../
  // layout() uses site.css and ../assets - deck pages need an extra ../
  // Breadcrumbs help search engines render the hierarchy rather than a bare
  // URL, and reinforce the hub → format → deck structure the links now mirror.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Meta", item: `${SITE}/meta-web/` },
      { "@type": "ListItem", position: 2, name: fmtName, item: `${SITE}/meta-web/${deck.format}.html` },
      {
        "@type": "ListItem",
        position: 3,
        name: `${deck.name} (${modeLabel(deck.mode)})`,
        item: `${SITE}/meta-web/deck/${deck.id}.html`,
      },
    ],
  };

  let html = layout({
    title: `${deck.name} ${fmtName} ${modeLabel(deck.mode)} Decklist (${date}) - Filthy Net Deck`,
    description: `${deck.name} ${fmtName} ${modeLabel(deck.mode)} decklist for ${date} — ${colorsLong(deck.colors)}, ${share} of the metagame, ranked #${deck.rank}. Full mainboard, sideboard, mana curve and Arena import. Scryfall-verified.`,
    canonicalPath: `/meta-web/deck/${deck.id}.html`,
    body,
    active: deck.format,
    jsonLd,
    extraScripts: `<script src="view.js" defer></script>`,
  });

  // Rewrite relative roots for nested deck pages
  html = html
    .replaceAll('href="../"', 'href="../../"')
    .replaceAll('href="../#download"', 'href="../../#download"')
    .replaceAll('href="../feedback.html"', 'href="../../feedback.html"')
    .replaceAll('href="../assets/', 'href="../../assets/')
    .replaceAll('src="../assets/', 'src="../../assets/')
    .replaceAll('href="site.css"', 'href="../site.css"')
    .replaceAll('src="view.js"', 'src="../view.js"')
    .replaceAll('href="index.html"', 'href="../index.html"')
    .replaceAll('href="standard.html"', 'href="../standard.html"')
    .replaceAll('href="pioneer.html"', 'href="../pioneer.html"')
    .replaceAll('href="cards.html"', 'href="../cards.html"')
    .replaceAll(`href="${resolveDownloads().win}"`, `href="${resolveDownloads().winDeep}"`)
    .replaceAll(`href="${resolveDownloads().mac}"`, `href="${resolveDownloads().macDeep}"`);

  return html;
}

const CSS = `/* Public meta site - shares brand tokens with marketing site */
:root {
  --ink-950: #050604;
  --ink-900: #0a0b08;
  --ink-800: #171a12;
  --ink-700: #22271a;
  --acid: #b8f000;
  --acid-bright: #d4ff3a;
  --gold: #d4a84b;
  --foam: #f2f4ea;
  --muted: #9aa38a;
  --good: #34d399;
  --bad: #f87171;
  --font: "Segoe UI", system-ui, -apple-system, sans-serif;
  --radius: 14px;
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: var(--font);
  background: var(--ink-950);
  color: var(--foam);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
a { color: var(--acid); text-decoration: none; }
a:hover { color: var(--acid-bright); }
.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.85rem 1.25rem;
  border-bottom: 1px solid rgba(184, 240, 0, 0.12);
  background: rgba(5, 6, 4, 0.92);
  position: sticky;
  top: 0;
  z-index: 10;
  backdrop-filter: blur(10px);
}
.brand { display: flex; align-items: center; gap: 0.65rem; color: var(--foam); }
.brand img { border-radius: 8px; }
.brand strong { display: block; font-size: 0.95rem; }
.brand small { color: var(--muted); font-size: 0.75rem; }
.top nav { display: flex; flex-wrap: wrap; gap: 0.65rem; align-items: center; }
.top nav a { color: var(--muted); font-size: 0.9rem; padding: 0.25rem 0.4rem; }
.top nav a.on, .top nav a:hover { color: var(--foam); }
.top nav .cta {
  background: var(--acid);
  color: #10120c !important;
  font-weight: 700;
  padding: 0.4rem 0.75rem;
  border-radius: 999px;
}
main { max-width: 1040px; margin: 0 auto; padding: 1.5rem 1.15rem 3rem; }
.hero h1 { font-size: clamp(1.6rem, 4vw, 2.35rem); line-height: 1.15; margin: 0.35rem 0 0.75rem; }
.hero.slim h1 { font-size: clamp(1.4rem, 3.2vw, 2rem); }
.eyebrow { color: var(--muted); font-size: 0.85rem; margin: 0; display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap; }
.eyebrow .live, .eyebrow .live + * { }
.live {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--good);
  box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.25);
  display: inline-block;
}
.lede { color: var(--muted); max-width: 52ch; margin: 0 0 1rem; }
.download-banner {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.15rem;
  margin: 1.25rem 0 1.75rem;
  border-radius: var(--radius);
  border: 1px solid rgba(184, 240, 0, 0.28);
  background: linear-gradient(135deg, rgba(184, 240, 0, 0.1), rgba(212, 168, 75, 0.08));
}
.download-banner p { margin: 0.25rem 0 0; color: var(--muted); font-size: 0.9rem; }
.dl-row { display: flex; gap: 0.5rem; }
.btn {
  display: inline-block;
  background: var(--acid);
  color: #10120c !important;
  font-weight: 700;
  padding: 0.55rem 0.95rem;
  border-radius: 999px;
  font-size: 0.9rem;
}
.btn.ghost {
  background: transparent;
  color: var(--foam) !important;
  border: 1px solid rgba(242, 244, 234, 0.25);
}
.format-block { margin: 2rem 0; }
.format-head { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; margin-bottom: 0.75rem; }
.format-head h2, .format-block > h2, .share-top h2, .trend h2, .list-block h2, .import h2, .sources h2, .why h2 {
  margin: 0 0 0.75rem;
  font-size: 1.15rem;
}
.more { font-size: 0.9rem; white-space: nowrap; }
.deck-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 0.75rem;
}
.deck-card {
  display: flex;
  gap: 0.75rem;
  padding: 0.85rem;
  border-radius: var(--radius);
  border: 1px solid rgba(184, 240, 0, 0.12);
  background: var(--ink-900);
  color: inherit;
  transition: border-color 0.2s var(--ease), transform 0.2s var(--ease);
}
.deck-card:hover {
  border-color: rgba(184, 240, 0, 0.45);
  transform: translateY(-2px);
  color: inherit;
}
.deck-rank {
  font-weight: 800;
  color: var(--acid);
  font-size: 1.1rem;
  min-width: 2rem;
}
.deck-body h3 { margin: 0 0 0.35rem; font-size: 1rem; }
.meta-line { display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; margin: 0; font-size: 0.8rem; color: var(--muted); }
.meta-line.big { margin: 0.75rem 0; font-size: 0.9rem; }
.pill {
  background: rgba(184, 240, 0, 0.12);
  color: var(--acid);
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  font-weight: 600;
}
.pill.soft { background: var(--ink-700); color: var(--muted); }
.pct { color: var(--gold); font-weight: 700; }
.colors { letter-spacing: 0.04em; font-weight: 600; color: var(--foam); }
.keys { margin: 0.4rem 0 0; font-size: 0.78rem; color: var(--muted); }
.share-top ol { margin: 0; padding-left: 1.2rem; color: var(--muted); }
.share-top li { margin: 0.25rem 0; }
.share-top span { color: var(--gold); font-weight: 700; margin-left: 0.35rem; }
.lists { display: flex; flex-direction: column; gap: 1rem; }
.view-list { display: none; }
.list-block h2 .count { color: var(--muted); font-weight: 500; font-size: 0.9rem; }
.card-list { list-style: none; margin: 0; padding: 0; }
.card-list li {
  display: grid;
  grid-template-columns: 40px 2.2rem 1fr;
  gap: 0.55rem;
  align-items: center;
  padding: 0.3rem 0;
  border-bottom: 1px solid rgba(242, 244, 234, 0.06);
  font-size: 0.9rem;
}
.thumb { width: 40px; height: 56px; object-fit: cover; border-radius: 4px; background: var(--ink-800); }
.thumb.empty { display: inline-block; width: 40px; height: 56px; border-radius: 4px; background: var(--ink-800); }
.qty { color: var(--muted); font-variant-numeric: tabular-nums; }
.cname { color: var(--foam); }
.import pre.arena {
  background: var(--ink-900);
  border: 1px solid rgba(184, 240, 0, 0.12);
  border-radius: var(--radius);
  padding: 0.85rem 1rem;
  overflow: auto;
  font-size: 0.8rem;
  line-height: 1.4;
  max-height: 320px;
  white-space: pre-wrap;
}
.hint { color: var(--muted); font-size: 0.85rem; }
.trend .spark {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 56px;
  padding: 0.5rem 0;
}
.trend .bar {
  flex: 1;
  max-width: 18px;
  background: linear-gradient(to top, var(--acid-dim, #8ab800), var(--acid));
  border-radius: 2px 2px 0 0;
  min-width: 4px;
}
.trend-note { color: var(--muted); font-size: 0.9rem; }
.trend-note .up { color: var(--good); }
.trend-note .down { color: var(--bad); }
.why { margin-top: 2.5rem; padding-top: 1.5rem; border-top: 1px solid rgba(184, 240, 0, 0.1); color: var(--muted); }
.foot {
  border-top: 1px solid rgba(184, 240, 0, 0.1);
  padding: 1.5rem 1.15rem 2rem;
  text-align: center;
  color: var(--muted);
  font-size: 0.85rem;
}
.foot-links { margin-top: 0.5rem; }
.sources ul { margin: 0; padding-left: 1.2rem; }
@media (max-width: 640px) {
  .top { flex-direction: column; align-items: flex-start; }
  .download-banner { flex-direction: column; align-items: flex-start; }
}

/* ---- Deck page depth (mana curve, composition, key cards, related) ---- */
.stat-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin: 20px 0;
}
.curve-block, .comp-block, .key-strip, .related {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  padding: 16px;
}
.curve-block h2, .comp-block h2, .key-strip h2, .related h2 {
  margin: 0 0 12px;
  font-size: 0.95rem;
  letter-spacing: 0.02em;
}
.curve {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  height: 96px;
}
.curve-col { display: flex; flex-direction: column; align-items: center; flex: 1; gap: 4px; }
.curve-n { font-size: 0.72rem; color: var(--muted, #9aa38a); min-height: 1em; }
.curve-bar {
  width: 100%;
  min-height: 3px;
  background: linear-gradient(180deg, #b8f000, #6d8f00);
  border-radius: 4px 4px 0 0;
}
.curve-x { font-size: 0.72rem; color: var(--muted, #9aa38a); }

.comp { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.comp li { display: flex; align-items: baseline; gap: 10px; font-size: 0.86rem; }
.comp-n { min-width: 2.2em; text-align: right; font-weight: 700; color: #b8f000; }
.comp-k { color: var(--muted, #9aa38a); }

.key-strip { margin: 20px 0; }
.key-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.key-card { margin: 0; }
.key-card img { width: 100%; height: auto; border-radius: 8px; display: block; }
.key-card figcaption { margin-top: 6px; font-size: 0.8rem; }
.key-empty { display: block; aspect-ratio: 200/146; border-radius: 8px; background: rgba(255,255,255,0.05); }

.related { margin: 20px 0; }
.related-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.related-list a {
  display: flex; align-items: baseline; gap: 10px;
  padding: 7px 9px; border-radius: 8px;
  text-decoration: none; color: inherit; font-size: 0.86rem;
}
.related-list a:hover { background: rgba(184,240,0,0.08); }
.r-rank { color: var(--muted, #9aa38a); min-width: 2.2em; }
.r-name { flex: 1; }
.r-pct { color: #b8f000; font-weight: 600; }

/* Card pages */
.card-head { display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap; }
.card-art { border-radius: 10px; display: block; max-width: 240px; height: auto; }
.card-head > div { flex: 1; min-width: 260px; }
.presence { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
.presence li { padding: 8px 10px; border-radius: 8px; background: rgba(255,255,255,0.04); }
.presence strong { display: block; color: #b8f000; font-size: 1.05rem; }
.presence span { color: var(--muted, #9aa38a); font-size: 0.8rem; }
.related-list.wide li { display: grid; gap: 0; }
.related-list.wide .hint { padding: 0 9px 6px; margin: 0; }
.card-index { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 2px; }
.card-index li { display: flex; align-items: baseline; gap: 8px; padding: 4px 8px; border-radius: 6px; font-size: 0.86rem; }
.card-index li:hover { background: rgba(184,240,0,0.08); }
.card-index a { flex: 1; color: inherit; text-decoration: none; }
.card-index a:hover { color: #b8f000; }
.jump { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.jump a {
  padding: 2px 9px; border-radius: 6px; font-size: 0.82rem; font-weight: 600;
  background: rgba(255,255,255,0.05); color: inherit; text-decoration: none;
}
.jump a:hover { background: rgba(184,240,0,0.14); color: #b8f000; }
a.cname { color: var(--foam); text-decoration: none; }
a.cname:hover { color: #b8f000; text-decoration: underline; }

/* Hub: link every deck, not just the featured five */
.all-decks { margin-top: 18px; }
.all-decks h3 { font-size: 0.85rem; color: var(--muted, #9aa38a); margin: 0 0 8px; font-weight: 600; }
.deck-links { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 4px; }
.deck-links a {
  display: block; padding: 6px 9px; border-radius: 8px;
  text-decoration: none; color: inherit; font-size: 0.84rem;
}
.deck-links a:hover { background: rgba(184,240,0,0.08); }
.deck-links .dim { color: var(--muted, #9aa38a); font-size: 0.78rem; }

@media (max-width: 720px) {
  .stat-row { grid-template-columns: 1fr; }
  .key-row { grid-template-columns: 1fr; }
  .deck-hero { grid-template-columns: 1fr; }
}

/* Deck hero art + hub tiles */
.deck-hero {
  display: grid;
  grid-template-columns: 1fr minmax(220px, 280px);
  gap: 1.5rem;
  align-items: center;
}
.deck-hero-art {
  position: relative;
  height: 220px;
}
.dha {
  position: absolute;
  width: 92px;
  height: 128px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid rgba(184, 240, 0, 0.28);
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.45);
  background: #151822;
}
.dha-1 { left: 0; top: 28px; transform: rotate(-10deg); z-index: 4; }
.dha-2 { left: 48px; top: 8px; transform: rotate(-2deg); z-index: 3; }
.dha-3 { left: 100px; top: 18px; transform: rotate(8deg); z-index: 2; }
.dha-4 { left: 154px; top: 36px; transform: rotate(16deg); z-index: 1; }
.dha-5 { left: 200px; top: 14px; transform: rotate(22deg); z-index: 0; }
.format-hero-art { height: 240px; }
.deck-arts {
  display: flex;
  gap: 0.28rem;
  margin: 0.45rem 0 0.2rem;
}
.deck-arts img {
  width: 36px;
  height: 50px;
  object-fit: cover;
  border-radius: 4px;
  background: var(--ink-800);
}
.deck-card { flex-wrap: wrap; }

/* View toggles — same three modes as the app */
.view-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 0 0 0.85rem;
  margin: 0 0 1rem;
  border-bottom: 1px solid rgba(184, 240, 0, 0.14);
}
.view-toolbar strong {
  font-size: 1.15rem;
}
.view-toggle {
  display: flex;
  padding: 3px;
  border-radius: 10px;
  background: var(--ink-800);
  border: 1px solid rgba(184, 240, 0, 0.18);
}
.view-toggle button {
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  border: 0;
  background: transparent;
  color: var(--muted);
  padding: 0.35rem 0.7rem;
  border-radius: 8px;
  cursor: pointer;
}
.view-toggle button.on {
  background: rgba(184, 240, 0, 0.18);
  color: var(--acid);
}
.lists[data-view="stacked"] .view-list,
.lists[data-view="stacked"] .view-compact,
.lists[data-view="list"] .view-stacked,
.lists[data-view="list"] .view-compact,
.lists[data-view="compact"] .view-stacked,
.lists[data-view="compact"] .view-list { display: none; }
.lists[data-view="stacked"] .view-stacked {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem 0.65rem;
  align-items: flex-start;
}
.lists[data-view="list"] .view-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.25rem;
}
.lists[data-view="compact"] .view-compact {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 0.85rem;
}

.view-stacked {
  display: none;
}
.stack-col {
  flex: 0 0 128px;
  min-width: 0;
}
.stack-col.is-side {
  padding-left: 0.7rem;
  border-left: 1px dashed rgba(212, 168, 75, 0.3);
  opacity: 0.92;
}
.stack-head {
  margin: 0 0 0.3rem;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}
.stack-head span {
  font-weight: 500;
  opacity: 0.75;
  margin-left: 0.25rem;
}
.stack-card-row {
  position: relative;
  height: 64px;
  margin-bottom: -38px;
  border-radius: 7px;
  overflow: visible;
  border: 1px solid rgba(53, 61, 40, 0.85);
  background: var(--ink-800);
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.35);
  transition: transform 0.12s var(--ease), z-index 0s;
}
.stack-col .stack-card-row:last-child { margin-bottom: 0; }
.stack-card-row:hover {
  z-index: 30;
  transform: translateY(-3px);
  border-color: rgba(184, 240, 0, 0.45);
}
.stack-card-row img, .stack-empty {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 6px;
}
.stack-empty { background: var(--ink-700); }
.stack-name {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 0.18rem 1.5rem 0.55rem 0.4rem;
  border-radius: 6px 6px 0 0;
  font-size: 0.68rem;
  font-weight: 600;
  line-height: 1.15;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: linear-gradient(to bottom, rgba(5, 6, 4, 0.88), rgba(5, 6, 4, 0.55) 70%, transparent);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}
.stack-qty {
  position: absolute;
  top: 0.14rem;
  right: 0.22rem;
  z-index: 2;
  min-width: 1.05rem;
  text-align: center;
  font-size: 0.66rem;
  font-weight: 700;
  background: rgba(5, 6, 4, 0.78);
  color: var(--gold);
  padding: 0 0.22rem;
  border-radius: 5px;
  border: 1px solid rgba(212, 168, 75, 0.35);
}
.view-compact { display: none; }
.compact-head {
  margin: 0 0 0.3rem;
  font-size: 0.78rem;
  color: var(--muted);
  font-weight: 700;
}
.compact-row {
  margin: 0.12rem 0;
  font-size: 0.86rem;
}
.compact-row span {
  display: inline-block;
  min-width: 1.4rem;
  color: var(--gold);
  font-weight: 700;
}
`;

/**
 * `lastmod` is the feed date, so crawlers can see the corpus genuinely changes
 * daily rather than having to re-fetch to find out. Priorities are tiered —
 * previously every meta-web URL sat at 0.7, which tells a crawler nothing
 * about what matters.
 */
function sitemapPriority(p) {
  if (p === "/meta-web/" || p === "/meta-web/index.html") return "0.9";
  if (/^\/meta-web\/(standard|pioneer)\.html$/.test(p)) return "0.8";
  if (p === "/meta-web/cards.html") return "0.7";
  if (p.startsWith("/meta-web/deck/")) return "0.6";
  // Card pages are the long tail: many of them, each narrow. Below the deck
  // pages they support, above nothing.
  if (p.startsWith("/meta-web/card/")) return "0.5";
  return "0.4";
}

/** Bump when `website/privacy.html` is substantively edited. */
const PRIVACY_LASTMOD = "2026-08-27";
const FEEDBACK_LASTMOD = "2026-08-17";

function writeSitemap(paths, lastmod) {
  const mod = /^\d{4}-\d{2}-\d{2}$/.test(String(lastmod || "")) ? String(lastmod) : null;
  const modTag = mod ? `\n    <lastmod>${mod}</lastmod>` : "";
  const urls = paths
    .map(
      (p) => `  <url>
    <loc>${SITE}${p}</loc>${modTag}
    <changefreq>daily</changefreq>
    <priority>${sitemapPriority(p)}</priority>
  </url>`,
    )
    .join("\n");
  // Hand-written static pages live outside `paths`, which only ever holds the
  // generated /meta-web/ corpus. They also must not inherit the feed's
  // `lastmod` + daily `changefreq` — claiming a page changed daily when it did
  // not is the kind of thing that gets a sitemap discounted.
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE}/</loc>${modTag}
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${SITE}/privacy.html</loc>
    <lastmod>${PRIVACY_LASTMOD}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>${SITE}/status.html</loc>
    <changefreq>daily</changefreq>
    <priority>0.4</priority>
  </url>
  <url>
    <loc>${SITE}/feedback.html</loc>
    <lastmod>${FEEDBACK_LASTMOD}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>
${urls}
</urlset>
`;
  writeFileSync(join(root, "website", "sitemap.xml"), xml);
}

function writeRobots() {
  const robots = `User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`;
  writeFileSync(join(root, "website", "robots.txt"), robots);
}

export function buildMetaSite(latestPath = join(META_DIR, "latest.json")) {
  if (!existsSync(latestPath)) {
    console.error(`build-meta-site: missing ${latestPath}`);
    process.exit(1);
  }
  const bundle = loadJson(latestPath);
  let history = { points: [] };
  const histPath = join(META_DIR, "history.json");
  if (existsSync(histPath)) {
    try {
      history = loadJson(histPath);
    } catch {
      history = { points: [] };
    }
  }

  // Clean output so removed archetypes don't leave stale HTML
  if (existsSync(OUT)) {
    rmSync(OUT, { recursive: true, force: true });
  }
  mkdirSync(join(OUT, "deck"), { recursive: true });
  mkdirSync(join(OUT, "card"), { recursive: true });
  writeFileSync(join(OUT, "site.css"), CSS);
  writeFileSync(
    join(OUT, "view.js"),
    `document.addEventListener("DOMContentLoaded", () => {
  const root = document.querySelector("[data-deck-views]");
  if (!root) return;
  const buttons = [...root.querySelectorAll(".view-toggle [data-view]")];
  const apply = (v) => {
    if (!["stacked", "list", "compact"].includes(v)) v = "stacked";
    root.dataset.view = v;
    try { localStorage.setItem("fnd-decklist-view", v); } catch {}
    buttons.forEach((b) => b.classList.toggle("on", b.dataset.view === v));
  };
  let start = "stacked";
  try { start = localStorage.getItem("fnd-decklist-view") || "stacked"; } catch {}
  apply(start);
  buttons.forEach((b) => b.addEventListener("click", () => apply(b.dataset.view)));
});
`,
  );
  writeFileSync(join(OUT, "index.html"), buildHub(bundle));

  const paths = ["/meta-web/", "/meta-web/index.html"];
  for (const fmtId of ["standard", "pioneer"]) {
    const html = buildFormat(bundle, history, fmtId);
    if (html) {
      writeFileSync(join(OUT, `${fmtId}.html`), html);
      paths.push(`/meta-web/${fmtId}.html`);
    }
  }

  // Board decks only — off-meta recognition decks ship in the bundle for the
  // app's inference/search, but the public site markets the ranked boards.
  const decks = Object.values(bundle.decks || {}).filter((d) => !d.offMeta);
  for (const d of decks) {
    writeFileSync(join(OUT, "deck", `${d.id}.html`), buildDeck(bundle, history, d));
    paths.push(`/meta-web/deck/${d.id}.html`);
  }

  // Card pages last: they need every deck to have been collected first.
  const cardsBySlug = collectCards(bundle);
  writeFileSync(join(OUT, "cards.html"), buildCardIndex(bundle, cardsBySlug));
  paths.push("/meta-web/cards.html");
  for (const card of cardsBySlug.values()) {
    writeFileSync(join(OUT, "card", `${card.slug}.html`), buildCard(bundle, card, cardsBySlug));
    paths.push(`/meta-web/card/${card.slug}.html`);
  }

  writeSitemap([...new Set(paths)], bundle.date);
  writeRobots();

  console.log(
    `  meta-web: ${decks.length} deck pages + ${cardsBySlug.size} card pages + hub + index + 2 formats (date=${bundle.date}) → website/meta-web/`,
  );
  return { deckPages: decks.length, cardPages: cardsBySlug.size, date: bundle.date };
}

// CLI
const isCli =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  buildMetaSite();
}

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

function scryfallImg(card) {
  const id = card?.scryfallId;
  if (!id) return null;
  // small art crop - public CDN, no API key
  return `https://cards.scryfall.io/art_crop/front/${id[0]}/${id[1]}/${id}.jpg`;
}

function layout({ title, description, canonicalPath, body, active }) {
  const canon = `${SITE}${canonicalPath}`;
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
  <meta property="og:image" content="${SITE}/assets/og-image.png?v=1.5.1" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${SITE}/assets/og-image.png?v=1.5.1" />
  <link rel="icon" href="../assets/app-icon.png" />
  <link rel="stylesheet" href="site.css" />
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
      <a href="https://github.com/L0nE-F0x/Filthy-Net-Deck">GitHub</a>
    </p>
  </footer>
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
        <p>Daily meta, Brew Lab, overlay, and a local-only winrate tracker for Arena. Updated ${esc(date)}.</p>
      </div>
      <div class="dl-row">
        <a class="btn" href="${win}">Windows</a>
        <a class="btn ghost" href="${mac}">macOS</a>
      </div>
    </aside>`;
}

function deckCard(d) {
  const href = `deck/${esc(d.id)}.html`;
  const keys = (d.keyCards || []).slice(0, 3).map(esc).join(" · ");
  const share = d.metaShare != null ? `${Number(d.metaShare).toFixed(1)}%` : "-";
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
        ${keys ? `<p class="keys">${keys}</p>` : ""}
      </div>
    </a>`;
}

function listCards(cards, title) {
  if (!cards?.length) return "";
  const rows = cards
    .map((c) => {
      const img = scryfallImg(c);
      const thumb = img
        ? `<img class="thumb" src="${esc(img)}" alt="" loading="lazy" width="40" height="56" />`
        : `<span class="thumb empty"></span>`;
      return `<li>${thumb}<span class="qty">${esc(c.count)}×</span><span class="cname">${esc(c.name)}</span></li>`;
    })
    .join("\n");
  return `
    <section class="list-block">
      <h2>${esc(title)} <span class="count">(${cards.reduce((n, c) => n + (c.count || 0), 0)})</span></h2>
      <ul class="card-list">${rows}</ul>
    </section>`;
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
      const top = bo1.slice(0, 5);
      return `
      <section class="format-block">
        <div class="format-head">
          <h2>${esc(fmt.name)}</h2>
          <a class="more" href="${esc(fmt.id)}.html">Full ${esc(fmt.name)} meta →</a>
        </div>
        <div class="deck-grid">
          ${top.map(deckCard).join("\n")}
        </div>
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
        Search engines can index today&rsquo;s meta. The free app adds Arena import, Brew Lab,
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

  const body = `
    <section class="hero slim">
      <p class="eyebrow"><a href="index.html">Meta</a> / ${esc(name)} · ${esc(date)}</p>
      <h1>${esc(name)} metagame</h1>
      <p class="lede">${esc(fmt.metaNotes || `Ranked ${name} archetypes for ${date}.`)}</p>
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

  const body = `
    <section class="hero slim">
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
    </section>
    ${downloadBanner(date, 1)}
    ${historySpark(history.points, deck.archetype || deck.name, deck.format, deck.mode)}
    <div class="lists">
      ${listCards(deck.mainboard, "Mainboard")}
      ${listCards(deck.sideboard, "Sideboard")}
    </div>
    ${arena}
    ${sources ? `<section class="sources"><h2>Sources</h2><ul>${sources}</ul><p class="hint">listQuality: ${esc(deck.listQuality || "unknown")}</p></section>` : ""}
  `;

  // Fix relative nav for deck/* pages: CSS and assets need ../
  // layout() uses site.css and ../assets - deck pages need an extra ../
  let html = layout({
    title: `${deck.name} ${fmtName} ${modeLabel(deck.mode)} (${date}) - Filthy Net Deck`,
    description: `${deck.name} ${fmtName} ${modeLabel(deck.mode)} list for ${date}. ${share} of the metagame. Scryfall-verified. Free Arena companion.`,
    canonicalPath: `/meta-web/deck/${deck.id}.html`,
    body,
    active: deck.format,
  });

  // Rewrite relative roots for nested deck pages
  html = html
    .replaceAll('href="../"', 'href="../../"')
    .replaceAll('href="../#download"', 'href="../../#download"')
    .replaceAll('href="../assets/', 'href="../../assets/')
    .replaceAll('src="../assets/', 'src="../../assets/')
    .replaceAll('href="site.css"', 'href="../site.css"')
    .replaceAll('href="index.html"', 'href="../index.html"')
    .replaceAll('href="standard.html"', 'href="../standard.html"')
    .replaceAll('href="pioneer.html"', 'href="../pioneer.html"')
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
.lists { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.25rem; }
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
`;

function writeSitemap(paths) {
  const urls = paths
    .map(
      (p) => `  <url>
    <loc>${SITE}${p}</loc>
    <changefreq>daily</changefreq>
    <priority>${p === "/meta-web/" || p === "/meta-web/index.html" ? "0.9" : "0.7"}</priority>
  </url>`,
    )
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
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
  writeFileSync(join(OUT, "site.css"), CSS);
  writeFileSync(join(OUT, "index.html"), buildHub(bundle));

  const paths = ["/meta-web/", "/meta-web/index.html"];
  for (const fmtId of ["standard", "pioneer"]) {
    const html = buildFormat(bundle, history, fmtId);
    if (html) {
      writeFileSync(join(OUT, `${fmtId}.html`), html);
      paths.push(`/meta-web/${fmtId}.html`);
    }
  }

  const decks = Object.values(bundle.decks || {});
  for (const d of decks) {
    writeFileSync(join(OUT, "deck", `${d.id}.html`), buildDeck(bundle, history, d));
    paths.push(`/meta-web/deck/${d.id}.html`);
  }

  writeSitemap([...new Set(paths)]);
  writeRobots();

  console.log(
    `  meta-web: ${decks.length} deck pages + hub + 2 formats (date=${bundle.date}) → website/meta-web/`,
  );
  return { deckPages: decks.length, date: bundle.date };
}

// CLI
const isCli =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  buildMetaSite();
}

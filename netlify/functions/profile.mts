/**
 * /u/<handle> — public player profile, server-rendered.
 *
 * WHY SERVER-RENDERED
 * This page's job is acquisition, not UI (PLATFORM-STRATEGY.md §2.3): a player
 * shares it, which makes it an indexable page, which drives installs, which
 * feed the crowd data. A client-rendered page would be invisible to crawlers
 * and the whole loop would not close. So: HTML out of the function, on
 * filthy-net-deck.com, with real OG tags.
 *
 * DATA
 * Reads three read-only views (public_profiles, public_profile_stats,
 * public_profile_archetypes) with the PUBLISHABLE key. Those views are the
 * access control — RLS is row-level, so the underlying `profiles` table stays
 * locked and the views expose a curated column set for opted-in users only.
 * Nothing here can reach a private profile or an unshared match.
 *
 * FAILURE POLICY
 * A backend problem must render as "profile unavailable", never a stack trace
 * and never a 500 that a crawler will remember. Unknown handles are a real 404
 * so they do not get indexed.
 *
 * ROUTING
 * `config.path` below. Verified live 2026-08-11: /api/fnd-stats returns 401
 * (its own auth check) rather than 404, which proves Netlify honours
 * config.path routing on this site — the repo-root netlify.toml comment
 * claiming functions are "inert" is stale.
 */
import type { Config, Context } from "@netlify/functions";

const SUPABASE_URL = "https://bzcryoocsapqtyhiwzbe.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_tHajCDbl4J4AIvaoWnEpWg_XiQPkESE";
const SITE = "https://filthy-net-deck.com";

/**
 * Cache-buster for the shared OG card. Bump with each release alongside
 * `website/index.html`.
 *
 * Kept as ONE constant on purpose: the homepage's og:image sat pinned at
 * `?v=1.5.1` for eight releases because the value was inline in several places,
 * and social caches served a stale card the whole time. One name, one edit.
 */
const OG_VERSION = "3.1.8";

interface ProfileRow {
  handle: string;
  display_name: string | null;
  created_at: string;
}
interface StatsRow {
  matches: number;
  wins: number;
  losses: number;
  archetypes: number;
  first_match: string | null;
  last_match: string | null;
}
interface ArchetypeRow {
  archetype: string;
  format: string;
  matches: number;
  wins: number;
  losses: number;
}
/**
 * A deck the player chose to publish.
 *
 * The view still returns **counts, not the id arrays** (migration
 * 20260812060000): the arena card ids of a published deck are nobody's
 * business, and this page only ever used the lengths.
 *
 * `has_list` is new in v3.1.8. The list itself — Arena import text the owner's
 * app rendered and uploaded at publish time — is deliberately NOT selected
 * here: this page only needs to know *whether* there is one, and pulling twelve
 * decklists across the wire to evaluate twelve booleans is the exact waste
 * 20260812060000 found. The view computes the flag; deck.mts fetches the text.
 *
 * False for every deck published before v3.1.8, and for anyone who publishes
 * without a list — in which case the row renders as it always did: name,
 * format, size, last played.
 *
 * The full list lives on `/u/<handle>/<slug>` (deck.mts); this page links to it
 * rather than inlining 75 lines per deck.
 */
interface DeckRow {
  deck_id: string;
  public_id: string | null;
  slug: string | null;
  name: string;
  format: string;
  main_count: number | null;
  side_count: number | null;
  has_list: boolean | null;
  played_at: string | null;
}

/** Escape everything user-controlled. Handles and display names come from
 *  third-party identity providers and are not trustworthy input. */
function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Kept in sync with `labelFromSlug` in src/services/cloud/archetypeSlug.ts.
 * Duplicated rather than imported because this function is bundled by Netlify
 * under its own tsconfig and cannot reach into the app's `src/`. If you edit
 * one, edit the other — a mismatch means the same deck is titled differently
 * in the app and on the shared page.
 */
const UPPERCASE_TOKENS = new Set([
  "uw", "ub", "ur", "ug", "wb", "wr", "wg", "br", "bg", "rg",
  "wub", "wur", "wug", "wbr", "wbg", "wrg", "ubr", "ubg", "urg", "brg",
  "wubr", "wubg", "wurg", "wbrg", "ubrg", "wubrg",
  "bo1", "bo3", "mtg", "gy", "etb", "cmc",
]);

function label(slug: string): string {
  const parts = slug.split("-");
  if (parts[0] === "standard" || parts[0] === "pioneer") parts.shift();
  return parts
    .filter(Boolean)
    .map((w) => {
      if (UPPERCASE_TOKENS.has(w)) return w.toUpperCase();
      if (/^\d[a-z]$/.test(w)) return w[0] + w[1].toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

function pct(wins: number, decided: number): string {
  if (!decided) return "—";
  return `${Math.round((wins / decided) * 100)}%`;
}

/**
 * Kept in sync with `public.deck_slugify()` (migration 20260820120000) and
 * `deckSlug()` in src/services/arenaExport.ts.
 *
 * Used here only to *match* an archetype row against a published deck, never to
 * build a URL — the slug the site serves is the one the database assigned, and
 * that is the one carried on the row. Guessing a URL from a name would 404 the
 * moment two decks collided and the second took a `-2` suffix.
 */
export function slugify(raw: string): string {
  const s = String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/^-+|-+$/g, "");
  return s || "deck";
}

async function sb<T>(path: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: PUBLISHABLE_KEY, authorization: `Bearer ${PUBLISHABLE_KEY}` },
  });
  if (!res.ok) return [];
  return (await res.json()) as T[];
}

function page(body: string, opts: { title: string; desc: string; url: string; noindex?: boolean }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.desc)}" />
${opts.noindex ? '<meta name="robots" content="noindex" />' : ""}
<link rel="canonical" href="${esc(opts.url)}" />
<meta property="og:type" content="profile" />
<meta property="og:title" content="${esc(opts.title)}" />
<meta property="og:description" content="${esc(opts.desc)}" />
<meta property="og:url" content="${esc(opts.url)}" />
<meta property="og:image" content="${SITE}/assets/og-image.png?v=${OG_VERSION}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(opts.title)}" />
<meta name="twitter:description" content="${esc(opts.desc)}" />
<meta name="twitter:image" content="${SITE}/assets/og-image.png?v=${OG_VERSION}" />
<link rel="icon" type="image/png" href="${SITE}/assets/favicon.png" />
<link rel="apple-touch-icon" href="${SITE}/assets/app-icon.png" />
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; background:#050604; color:#f2f4ea; padding:2rem 1rem;
    font:16px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
  .wrap { max-width: 46rem; margin: 0 auto; }
  a { color:#b8f000; }
  header { display:flex; align-items:center; gap:.9rem; margin-bottom:1.5rem; }
  header img { width:52px; height:52px; border-radius:12px; }
  h1 { font-size:1.6rem; margin:0; letter-spacing:-0.02em; }
  .sub { color:#9aa38a; font-size:.85rem; margin:.15rem 0 0; }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(8rem,1fr)); gap:.7rem; margin:1.4rem 0; }
  .card { background:#0e100b; border:1px solid #23261c; border-radius:.6rem; padding:.85rem; }
  .card b { display:block; font-size:1.5rem; letter-spacing:-0.02em; }
  .card span { color:#9aa38a; font-size:.72rem; text-transform:uppercase; letter-spacing:.06em; }
  table { width:100%; border-collapse:collapse; margin-top:.5rem; font-size:.9rem; }
  th,td { text-align:left; padding:.5rem .4rem; border-bottom:1px solid #1b1e15; }
  th { color:#9aa38a; font-size:.72rem; text-transform:uppercase; letter-spacing:.06em; font-weight:600; }
  td.num, th.num { text-align:right; font-variant-numeric:tabular-nums; }
  .tag { display:inline-block; background:#1b2410; border:1px solid #35461f; color:#b8f000;
    border-radius:999px; padding:.05rem .5rem; font-size:.68rem; letter-spacing:.02em; }
  .cta { margin-top:2rem; padding:1rem; background:#0e100b; border:1px solid #23261c; border-radius:.6rem; }
  .btn { display:inline-block; margin-top:.6rem; padding:.55rem 1rem; border-radius:.5rem;
    background:#b8f000; color:#050604; font-weight:650; text-decoration:none; font-size:.9rem; }
  footer { margin-top:2.5rem; color:#6c7460; font-size:.75rem; }
  .empty { color:#9aa38a; }
</style>
</head>
<body><div class="wrap">${body}
<footer>
  <p>Not affiliated with Wizards of the Coast. MTG and MTG Arena are trademarks of Wizards of the Coast LLC.</p>
</footer>
</div></body></html>`;
}

const CTA = `<div class="cta">
  <strong>Filthy Net Deck</strong> — a free MTG Arena companion for Standard &amp; Pioneer.
  Daily ranked decks, a local winrate tracker, and an in-game overlay.
  <br /><a class="btn" href="${SITE}/">Download free</a>
</div>`;

export default async (_req: Request, ctx: Context) => {
  const raw = String(ctx.params?.handle ?? "").toLowerCase();
  const handle = raw.replace(/[^a-z0-9_-]/g, "").slice(0, 24);

  if (!handle) {
    return new Response(
      page(`<h1>No such profile</h1><p class="sub">That link is missing a player name.</p>${CTA}`, {
        title: "Profile not found — Filthy Net Deck",
        desc: "That profile does not exist.",
        url: `${SITE}/u/`,
        noindex: true,
      }),
      { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  const url = `${SITE}/u/${handle}`;

  try {
    const [profiles, stats, archetypes, decks] = await Promise.all([
      sb<ProfileRow>(`public_profiles?handle=eq.${encodeURIComponent(handle)}&select=*`),
      sb<StatsRow>(`public_profile_stats?handle=eq.${encodeURIComponent(handle)}&select=*`),
      sb<ArchetypeRow>(
        `public_profile_archetypes?handle=eq.${encodeURIComponent(handle)}&select=*&order=matches.desc&limit=25`,
      ),
      sb<DeckRow>(
        `public_profile_decks?handle=eq.${encodeURIComponent(handle)}` +
          `&select=deck_id,public_id,slug,name,format,main_count,side_count,has_list,played_at` +
          `&order=played_at.desc&limit=12`,
      ),
    ]);

    const profile = profiles[0];
    if (!profile) {
      // A real 404 so a wrong or private handle never gets indexed.
      return new Response(
        page(
          `<h1>No such profile</h1>
           <p class="sub">Nobody is using <strong>${esc(handle)}</strong>, or that profile is private.</p>${CTA}`,
          {
            title: "Profile not found — Filthy Net Deck",
            desc: "That profile does not exist or is private.",
            url,
            noindex: true,
          },
        ),
        { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }

    const name = profile.display_name?.trim() || profile.handle;
    const s = stats[0];
    const decided = s ? s.wins + s.losses : 0;
    const rate = s ? pct(s.wins, decided) : "—";

    const head = `<header>
        <img src="${SITE}/assets/app-icon-128.png" alt="" width="52" height="52" />
        <div>
          <h1>${esc(name)}</h1>
          <p class="sub">/u/${esc(profile.handle)} · Filthy Net Deck</p>
        </div>
      </header>`;

    if (!s || s.matches === 0) {
      return new Response(
        page(
          `${head}<p class="empty">This player hasn't shared any match results yet.</p>${CTA}`,
          {
            title: `${name} — Filthy Net Deck`,
            desc: `${name}'s MTG Arena profile on Filthy Net Deck.`,
            url,
          },
        ),
        {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "public, max-age=300",
          },
        },
      );
    }

    // A published deck, keyed by the slug its *name* would produce. An
    // archetype row and a deck row are different records — one is an aggregate
    // over matches, the other a list the player published — and the only thing
    // tying them together is that both are named after the same archetype. So
    // the link appears when the names agree and is silently absent when they do
    // not, which is the honest outcome: a wrong link here would send a viewer
    // to somebody's other deck.
    const published = new Map<string, DeckRow>();
    for (const d of decks) {
      if (!d.slug) continue;
      const key = slugify(d.name);
      if (!published.has(key)) published.set(key, d);
    }

    const rows = archetypes
      .map((a) => {
        const d = a.wins + a.losses;
        const name = label(a.archetype);
        const deck = published.get(slugify(name));
        const cell =
          deck && deck.slug
            ? `<a href="${SITE}/u/${esc(profile.handle)}/${esc(deck.slug)}">${esc(name)}</a>` +
              (deck.has_list ? ` <span class="tag">list</span>` : "")
            : esc(name);
        return `<tr>
          <td>${cell}</td>
          <td>${esc(a.format)}</td>
          <td class="num">${a.matches}</td>
          <td class="num">${a.wins}–${a.losses}</td>
          <td class="num">${pct(a.wins, d)}</td>
        </tr>`;
      })
      .join("");

    // Decks the player explicitly published. Empty for everyone who has not,
    // which is the default — the section simply does not appear.
    const deckRows = decks
      .map((d) => {
        const size = typeof d.main_count === "number" ? d.main_count : 0;
        const side = typeof d.side_count === "number" ? d.side_count : 0;
        const when = d.played_at ? new Date(d.played_at) : null;
        const played =
          when && !Number.isNaN(when.valueOf())
            ? when.toISOString().slice(0, 10)
            : "—";
        // Linked on the slug the database assigned, never on one guessed from
        // the name. A row published before slugs existed has none and stays
        // plain text rather than pointing at a 404.
        const name = d.slug
          ? `<a href="${SITE}/u/${esc(profile.handle)}/${esc(d.slug)}">${esc(d.name)}</a>`
          : esc(d.name);
        return `<tr>
          <td>${name}</td>
          <td>${esc(d.format)}</td>
          <td class="num">${size}${side ? ` <span class="sub">+${side}</span>` : ""}</td>
          <td>${d.has_list ? '<span class="tag">Copy list</span>' : '<span class="sub">—</span>'}</td>
          <td class="num">${esc(played)}</td>
        </tr>`;
      })
      .join("");

    const anyList = decks.some((d) => d.has_list);

    const deckSection = deckRows
      ? `<h2 style="font-size:1rem;margin:1.5rem 0 0">Published decks</h2>
         ${
           anyList
             ? '<p class="sub">Open one to copy the decklist straight into MTG Arena.</p>'
             : ""
         }
         <table>
           <thead><tr>
             <th>Deck</th><th>Format</th>
             <th class="num">Cards</th><th>Decklist</th><th class="num">Last played</th>
           </tr></thead>
           <tbody>${deckRows}</tbody>
         </table>`
      : "";

    const body = `${head}
      <div class="cards">
        <div class="card"><b>${s.matches}</b><span>Matches</span></div>
        <div class="card"><b>${rate}</b><span>Win rate</span></div>
        <div class="card"><b>${s.wins}–${s.losses}</b><span>Record</span></div>
        <div class="card"><b>${s.archetypes}</b><span>Decks played</span></div>
      </div>
      <h2 style="font-size:1rem;margin:1.5rem 0 0">Decks played</h2>
      <table>
        <thead><tr>
          <th>Deck</th><th>Format</th>
          <th class="num">Matches</th><th class="num">W–L</th><th class="num">Win rate</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${deckSection}
      ${CTA}`;

    return new Response(
      page(body, {
        title: `${name} — ${s.matches} MTG Arena matches, ${rate} win rate | Filthy Net Deck`,
        desc: `${name} has played ${s.matches} tracked MTG Arena matches across ${s.archetypes} decks, with a ${rate} win rate. Tracked with Filthy Net Deck.`,
        url,
      }),
      {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          // Short cache: profiles change as people play, but a crawler or a
          // burst of shares must not hit the database per request.
          "cache-control": "public, max-age=300",
        },
      },
    );
  } catch {
    // Never a 500 — a crawler remembers those, and there is nothing the visitor
    // can do about it either.
    return new Response(
      page(
        `<h1>Profile unavailable</h1><p class="sub">Something went wrong loading this profile. Try again shortly.</p>${CTA}`,
        {
          title: "Profile unavailable — Filthy Net Deck",
          desc: "This profile could not be loaded.",
          url,
          noindex: true,
        },
      ),
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }
};

export const config: Config = {
  path: "/u/:handle",
};

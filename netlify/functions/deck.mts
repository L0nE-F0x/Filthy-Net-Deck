/**
 * /u/<handle>/<slug> — one published deck, with a copyable list.
 *
 * WHY THIS PAGE EXISTS
 * A player links a deck from a video description so viewers can copy it into
 * Arena. Before this, that meant sending them to a third-party deck host. The
 * profile page (`profile.mts`) is the acquisition surface; this is the page
 * that actually does the job someone clicked for, so the copy button is the
 * first thing on it and everything else is below the fold.
 *
 * WHERE THE CARD NAMES COME FROM
 * Not from here. `public_profile_decks.list` is Arena import text the owner's
 * app rendered and uploaded at publish time — the server stores arena card ids
 * and has no id→name map, and resolving 75 ids per request through Scryfall
 * would be slow and rude to a public API. See migration 20260820120000.
 *
 * A deck published before v3.1.8 has `list = null`. That is not an error: the
 * page renders name/format/size and says the list was not published, exactly
 * as the profile page did. Never invent a list.
 *
 * ROUTING
 * Two paths, one handler. `/d/<id>` is the short form the app hands out for
 * pasting; it 301s to the readable form so the canonical URL is the one that
 * gets indexed and the one a viewer sees in the address bar.
 */
import type { Config, Context } from "@netlify/functions";

const SUPABASE_URL = "https://bzcryoocsapqtyhiwzbe.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_tHajCDbl4J4AIvaoWnEpWg_XiQPkESE";
const SITE = "https://filthy-net-deck.com";

/** Bump with each release alongside `website/index.html`. See profile.mts. */
const OG_VERSION = "3.1.8";

interface DeckRow {
  handle: string;
  deck_id: string;
  public_id: string | null;
  slug: string | null;
  name: string;
  format: string;
  main_count: number | null;
  side_count: number | null;
  list: string | null;
  played_at: string | null;
  updated_at: string | null;
}

/** Escape everything user-controlled — deck names and handles are not trustworthy input. */
function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sb<T>(path: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: PUBLISHABLE_KEY, authorization: `Bearer ${PUBLISHABLE_KEY}` },
  });
  if (!res.ok) return [];
  return (await res.json()) as T[];
}

const STYLE = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; background:#050604; color:#f2f4ea; padding:2rem 1rem;
    font:16px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
  .wrap { max-width: 46rem; margin: 0 auto; }
  a { color:#b8f000; }
  header { display:flex; align-items:center; gap:.9rem; margin-bottom:1.25rem; }
  header img { width:52px; height:52px; border-radius:12px; }
  h1 { font-size:1.6rem; margin:0; letter-spacing:-0.02em; }
  .sub { color:#9aa38a; font-size:.85rem; margin:.15rem 0 0; }
  .chips { display:flex; flex-wrap:wrap; gap:.4rem; margin:1rem 0 1.3rem; }
  .chip { background:#0e100b; border:1px solid #23261c; border-radius:999px;
    padding:.22rem .7rem; font-size:.75rem; color:#9aa38a; }
  .bar { display:flex; flex-wrap:wrap; align-items:center; gap:.6rem; margin-bottom:1rem; }
  .btn { display:inline-block; padding:.55rem 1rem; border-radius:.5rem;
    background:#b8f000; color:#050604; font-weight:650; text-decoration:none;
    font-size:.9rem; border:0; cursor:pointer; font-family:inherit; }
  .btn.ghost { background:transparent; color:#b8f000; border:1px solid #23261c; }
  .list { background:#0e100b; border:1px solid #23261c; border-radius:.6rem;
    padding:1rem 1.1rem; margin:0; white-space:pre-wrap; overflow-x:auto;
    font:14px/1.7 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
  .list b { color:#b8f000; font-weight:650; display:block; margin:.6rem 0 .2rem; }
  .list b:first-child { margin-top:0; }
  .note { color:#9aa38a; font-size:.8rem; margin:.7rem 0 0; }
  .empty { color:#9aa38a; }
  .cta { margin-top:2rem; padding:1rem; background:#0e100b; border:1px solid #23261c; border-radius:.6rem; }
  .cta .btn { margin-top:.6rem; }
  footer { margin-top:2.5rem; color:#6c7460; font-size:.75rem; }
`;

function page(
  body: string,
  opts: { title: string; desc: string; url: string; noindex?: boolean },
) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.desc)}" />
${opts.noindex ? '<meta name="robots" content="noindex" />' : ""}
<link rel="canonical" href="${esc(opts.url)}" />
<meta property="og:type" content="article" />
<meta property="og:title" content="${esc(opts.title)}" />
<meta property="og:description" content="${esc(opts.desc)}" />
<meta property="og:url" content="${esc(opts.url)}" />
<meta property="og:image" content="${SITE}/assets/og-image.png?v=${OG_VERSION}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(opts.title)}" />
<meta name="twitter:description" content="${esc(opts.desc)}" />
<meta name="twitter:image" content="${SITE}/assets/og-image.png?v=${OG_VERSION}" />
<!-- Absolute, not "/assets/…": these pages live at a nested path
     (/u/<handle>/<slug>), where a relative href would resolve wrong. -->
<link rel="icon" type="image/png" href="${SITE}/assets/favicon.png" />
<link rel="apple-touch-icon" href="${SITE}/assets/app-icon.png" />
<style>${STYLE}</style>
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

function notFound(url: string) {
  return new Response(
    page(
      `<h1>No such deck</h1>
       <p class="sub">That deck is not published, or the link is wrong.</p>${CTA}`,
      {
        title: "Deck not found — Filthy Net Deck",
        desc: "That deck does not exist or is not published.",
        url,
        noindex: true,
      },
    ),
    { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

/**
 * Render the stored Arena text as HTML.
 *
 * The text is echoed line by line rather than parsed: it is what the viewer is
 * about to copy, so showing anything else — reordered, regrouped, prettified —
 * would mean the page and the clipboard disagreed. `Deck` / `Sideboard` headers
 * get emphasis, every other line is escaped and passed through untouched.
 *
 * Capped at 400 lines. The database caps the column at 8 000 characters, so
 * this is only a second floor under a row that somehow got past it.
 */
export function renderList(list: string): string {
  return list
    .split("\n")
    .slice(0, 400)
    .map((raw) => {
      const line = raw.replace(/\r$/, "");
      if (!line.trim()) return "";
      if (/^(deck|sideboard|commander|companion)\s*$/i.test(line.trim())) {
        return `<b>${esc(line.trim())}</b>`;
      }
      return esc(line);
    })
    .join("\n");
}

/**
 * The copy button.
 *
 * Reads the list out of the DOM rather than carrying a second copy in a JS
 * string: one source of text on the page means the button cannot drift from
 * what is rendered above it, and there is no second escaping context to get
 * wrong. `execCommand` is the fallback for a browser that refuses the async
 * clipboard on a click it does not consider trusted enough.
 *
 * `textContent`, NOT `innerText` — the section headers are `<b display:block>`,
 * and innerText renders that layout back as an extra newline after every
 * header. That put a blank line between `Deck` and the first card in the copied
 * text, which is not what the owner uploaded and not something to hand Arena's
 * importer on a guess. textContent returns the stored text byte for byte.
 */
const COPY_JS = `
<script>
(function () {
  var btn = document.getElementById('copy');
  var pre = document.getElementById('list');
  if (!btn || !pre) return;
  var idle = btn.textContent;
  btn.addEventListener('click', function () {
    var text = pre.textContent.trim();
    var done = function (ok) {
      btn.textContent = ok ? 'Copied — paste into Arena' : 'Press Ctrl+C to copy';
      if (!ok) {
        var r = document.createRange();
        r.selectNodeContents(pre);
        var s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
      }
      setTimeout(function () { btn.textContent = idle; }, 2600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      return;
    }
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      done(ok);
    } catch (e) {
      done(false);
    }
  });
})();
</script>`;

export default async (_req: Request, ctx: Context) => {
  const rawHandle = String(ctx.params?.handle ?? "").toLowerCase();
  const rawSlug = String(ctx.params?.slug ?? "").toLowerCase();
  const rawId = String(ctx.params?.id ?? "").toLowerCase();

  const handle = rawHandle.replace(/[^a-z0-9_-]/g, "").slice(0, 24);
  const slug = rawSlug.replace(/[^a-z0-9-]/g, "").slice(0, 64);
  const id = rawId.replace(/[^a-z0-9]/g, "").slice(0, 32);

  const url = handle && slug ? `${SITE}/u/${handle}/${slug}` : `${SITE}/d/${id}`;

  if (!id && !(handle && slug)) return notFound(url);

  try {
    const query = id
      ? `public_profile_decks?public_id=eq.${encodeURIComponent(id)}&select=*&limit=1`
      : `public_profile_decks?handle=eq.${encodeURIComponent(handle)}` +
        `&slug=eq.${encodeURIComponent(slug)}&select=*&limit=1`;

    const deck = (await sb<DeckRow>(query))[0];
    if (!deck) return notFound(url);

    // The short form is for pasting, not for reading. Send it to the canonical
    // page so that is what gets indexed and what the viewer sees.
    if (id && deck.handle && deck.slug) {
      return new Response(null, {
        status: 301,
        headers: {
          location: `${SITE}/u/${deck.handle}/${deck.slug}`,
          "cache-control": "public, max-age=300",
        },
      });
    }

    const size = typeof deck.main_count === "number" ? deck.main_count : 0;
    const side = typeof deck.side_count === "number" ? deck.side_count : 0;
    const when = deck.played_at ? new Date(deck.played_at) : null;
    const played =
      when && !Number.isNaN(when.valueOf()) ? when.toISOString().slice(0, 10) : null;

    const chips = [
      deck.format ? `<span class="chip">${esc(deck.format)}</span>` : "",
      `<span class="chip">${size} cards${side ? ` +${side} sideboard` : ""}</span>`,
      played ? `<span class="chip">Last played ${esc(played)}</span>` : "",
    ].join("");

    const listBlock = deck.list
      ? `<div class="bar">
           <button type="button" class="btn" id="copy">Copy decklist</button>
           <a class="btn ghost" href="${SITE}/u/${esc(deck.handle)}">More of ${esc(deck.handle)}'s decks</a>
         </div>
         <pre class="list" id="list">${renderList(deck.list)}</pre>
         <p class="note">Copy, then in MTG Arena: <strong>Decks → Import</strong>. Cards you
            do not own show as wildcards to craft.</p>`
      : `<p class="empty">This deck was published without its list — only the name,
           format and size are shared.</p>
         <p><a href="${SITE}/u/${esc(deck.handle)}">See ${esc(deck.handle)}'s profile</a></p>`;

    const body = `<header>
        <img src="${SITE}/assets/app-icon.png" alt="" />
        <div>
          <h1>${esc(deck.name)}</h1>
          <p class="sub">
            <a href="${SITE}/u/${esc(deck.handle)}">/u/${esc(deck.handle)}</a> · Filthy Net Deck
          </p>
        </div>
      </header>
      <div class="chips">${chips}</div>
      ${listBlock}
      ${CTA}`;

    const desc = deck.list
      ? `${deck.name} — a ${size}-card ${deck.format} decklist by ${deck.handle}, ` +
        "ready to copy straight into MTG Arena."
      : `${deck.name} — a ${size}-card ${deck.format} deck played by ${deck.handle}.`;

    return new Response(
      page(body + (deck.list ? COPY_JS : ""), {
        title: `${deck.name} — ${deck.format} decklist by ${deck.handle} | Filthy Net Deck`,
        desc,
        url: `${SITE}/u/${deck.handle}/${deck.slug ?? slug}`,
      }),
      {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          // Same reasoning as the profile page: a published list changes when
          // the owner re-publishes, and a burst of shares must not hit the
          // database per request.
          "cache-control": "public, max-age=300",
        },
      },
    );
  } catch {
    // Never a 500 — a crawler remembers those.
    return new Response(
      page(
        `<h1>Deck unavailable</h1>
         <p class="sub">Something went wrong loading this deck. Try again shortly.</p>${CTA}`,
        {
          title: "Deck unavailable — Filthy Net Deck",
          desc: "This deck could not be loaded.",
          url,
          noindex: true,
        },
      ),
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }
};

export const config: Config = {
  path: ["/u/:handle/:slug", "/d/:id"],
};

# Aetherfield — the embedded galaxy

Aetherfield renders all 117,621 printed Magic cards as one explorable WebGL
galaxy. It is a **separate product** — repo `L0nE-F0x/MTG-Multiverse`, live at
<https://mtg-multiverse.netlify.app> — embedded here as a sidebar destination.

| | |
|---|---|
| Reached by | The launcher in the sidebar footer, above the themes picker. **Not** one of the numbered 1–8 nav pages. |
| Page id | `"aether"` (in `LOCAL_PAGES` — it ships its own catalogue and never touches the meta feed) |
| Host component | `src/pages/Aetherfield.tsx` |
| Payload | `public/aetherfield/` — Aetherfield's built site, ~7.4 MB |
| Refreshed by | `npm run aetherfield` (see `scripts/sync-aetherfield.mjs`) |

## Why a vendored build, and not source or a submodule

Nothing is shared to deduplicate. Aetherfield is vanilla TypeScript on three.js
with custom GLSL; this app is React 19 + Tailwind + zustand. Merging the sources
would add a second Vite plugin chain and a second set of build assumptions here
and save zero bytes.

It also assumes it owns the document — a fixed full-viewport canvas,
`overflow: hidden` on body, its own global key handlers. Inside `.content` that
fights Tailwind, the nav's number keys and Ctrl+K. An iframe hands it a document
to own, and keyboard events do not cross the boundary, so neither app steals the
other's shortcuts.

A submodule was rejected on CI cost: this app is built from a plain `checkout` +
`npm ci` + `npm run build` in four separate jobs, and a submodule would fetch and
build three.js in every one of them on every push — to produce a folder that
changes a few times a year, when a new set ships and the star catalogue is
regenerated.

## The contract

`src/core/embed.ts` in the Aetherfield repo is the other half of this. Messages
are tagged `source: "aetherfield"`, and the host only listens to its own frame.

| Message | Direction | Why it exists |
|---|---|---|
| `ready` | frame → host | An iframe fires `load` for a 404 page exactly as it does for a real one. Without an explicit ping there is no way to tell a missing `public/aetherfield/` from a slow boot, so the host waits for this and falls back on a timeout. |
| `error` | frame → host | Boot failed — no WebGL2, missing catalogue. Carries the message the galaxy would have shown. |
| `open-external` | frame → host | `target="_blank"` does nothing inside a Tauri webview: no error, no navigation, the Scryfall link is simply dead. The frame forwards outbound links here and the host runs them through `openExternal()`. |

Two query parameters matter: `?shell=play` skips Aetherfield's own title screen
(the sidebar button was already the "do you want this?" click), and `?layout=`
/ `?card=` are how a future deep link from Sets or DeckView would land somewhere
specific.

The frame is mounted **only** while the page is open. Navigating away unmounts
it, and the WebGL context and render loop die with the document — nothing keeps
drawing a galaxy behind the rest of the app, or behind a game of Arena.

The public browser URL `https://filthy-net-deck.com/aetherfield/` is a Netlify
proxy in `website/netlify.toml` onto Aetherfield's own site. It is not this
iframe, and it must not become a second committed `dist/`.

## Git size — read before refreshing

`public/aetherfield/` is committed, and 6.5 MB of its 7.4 MB is the generated
star catalogue (`data/universe.bin` + `universe-meta.json`). Every refresh adds
another copy to the pack. See `GIT-HISTORY-BLOAT.md`: this repo's history is
already heavy with old installers.

This is a deliberate trade — it keeps CI untouched and the galaxy works offline
from the installer — but it is not free. **Refresh only when the catalogue
actually changed**, not on every Aetherfield tweak.

If the pack becomes a problem, the alternative is to commit only the ~900 KB of
JS/CSS/HTML and serve `data/` from `filthy-net-deck.com` (already allowed by
both the CSP `connect-src` and the `http:default` capability). That costs a
one-time 6.5 MB download and offline support until it is cached.

## When it breaks

The host shows its own panel with the galaxy's own error text, and a Retry that
remounts the frame. In order of likelihood:

1. **"The galaxy was not included in this build."** — the boot timeout expired.
   `public/aetherfield/` is missing or empty. Run `npm run aetherfield`.
2. **A WebGL2 message** — the machine or the webview cannot provide WebGL2.
3. **A blank frame with no panel** — assets 404'd. Check that Aetherfield's
   `vite.config.ts` still has `base: './'`; a root-absolute `/assets/…` resolves
   against this app's origin and collides with this app's own bundle. The sync
   script fails loudly on this, so it usually means the folder was hand-edited.

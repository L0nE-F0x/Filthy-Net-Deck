# Filthy Net Deck — Data pipeline & updates

## How the app syncs (automatic — there is no Refresh button)

Since v0.8.2 the app has no manual Refresh button. It re-downloads the published feed by itself: on launch, when connectivity returns (`online` event), and on focus / an hourly timer whenever the loaded copy is more than 90 minutes old.

**Syncing does *not* scrape MTGGoldfish, Melee, Untapped, or tournaments from your PC.**

| Step | What happens |
|------|----------------|
| 1 | `GET https://filthy-net-deck.com/meta/latest.json` (primary; falls back to `filthy-net-deck.netlify.app` — URL-override setting was removed in v0.8.3) |
| 2 | Parse that JSON (formats, 8×8 decks, tournaments, sources) |
| 3 | Diff vs last snapshot (meta movement) |
| 4 | Cache in memory + local snapshot for offline/diff |
| 5 | Check `version.json` for a newer **app** build (soft update banner) |

If the Netlify JSON cannot be fetched, the app shows the **last successfully downloaded copy** (real data, banner marks it offline). There is no built-in seed pack — with no network and no cached copy the app shows an explicit error state.

```
┌─────────────┐    auto-sync     ┌──────────────────────────┐
│  Desktop    │ ───────────────► │ Netlify CDN              │
│  Filthy Net │   latest.json    │ /meta/latest.json        │
│  Deck app   │ ◄─────────────── │ (built by CI / pipeline) │
└─────────────┘                  └────────────▲─────────────┘
                                              │
                                   once/day or on deploy
                                              │
                                 ┌────────────┴────────────┐
                                 │  pipeline/build-meta    │
                                 │  (GitHub / local / CI)  │
                                 └────────────┬────────────┘
                                              │
          magic.gg · MTGO · Goldfish · Melee · Untapped
```

**Cutting-edge accuracy depends on how often the pipeline runs and how good its sources are.** The app only ever re-downloads whatever is already published on Netlify.

### Dual host (custom domain + legacy)

| Host | Role |
|------|------|
| `https://filthy-net-deck.com` | **Primary** — Netlify DNS, marketing, OG, app defaults (v1.5.1+) |
| `https://filthy-net-deck.netlify.app` | **Legacy** — same deploy; kept in CSP, HTTP allowlist, silent-update allowlist, and as fetch fallback so already-installed clients keep working |

Installer URLs in `version.json` / `updater/latest.json` may stay on the legacy host so older binaries that only allow `netlify.app` can still silent-update. Both hosts serve identical `website/` content after Netlify deploy.

---

## What the **pipeline** does (server / CI)

File: `pipeline/build-meta.mjs`  
Modules: `pipeline/sources/{magic-gg,mtgo,melee,untapped,aggregate,common}.mjs`

| Source | What we pull | Accuracy |
|--------|--------------|----------|
| **magic.gg/decklists** | Official WotC/Arena ranked + championship posts (HTML card runs) | **Authoritative** when parsed |
| **MTGO** (`mtgo.com/decklist/…`) | Embedded `window.MTGO.decklists.data` JSON (full main + SB) | **Authoritative** |
| **MTGGoldfish metagame** | Archetype names + meta % | Ranking signal |
| **MTGGoldfish deck export** | Full Arena/text 60s for mapped archetypes | **Authoritative** when not CF-blocked |
| **Melee.gg SearchResults** | Recent paper/RCQ/Arena event links (date-filtered) | Event intel |
| **Untapped.gg** | Arena ladder meta + archetype links | Ladder signal (lists often login-walled) |
| **Built-in pack** | Installer fallback only | Tagged `fallback` — never presented as live |

**Priority when assigning lists onto the 8×8 grid:**

`magic.gg` → `mtgo` → `mtggoldfish export` → `melee` (if lists) → keep tagged fallback

**Policy (product rule):**

1. Prefer **exported tournament / official decklists** over hand-written cards.
2. Never invent a 60 from memory when a source list exists.
3. Tag each deck with `listQuality`: `authoritative` | `partial` | `fallback`.
4. Surface quality + source URL in the app (Deck detail + Settings).

### MTGO details

Event pages are JS-rendered for the UI, but the full payload is already in the HTML:

```js
window.MTGO.decklists.data = { event_id, description, decklists: [ { player, main_deck: [...] } ] }
```

Each card has `qty`, `sideboard`, and `card_attributes.card_name`. We parse that JSON directly — no headless browser required.

Example: https://www.mtgo.com/decklist/standard-challenge-32-2026-07-0912847094

### magic.gg details

Index: https://magic.gg/decklists  
Articles (e.g. Traditional Standard Ranked) contain continuous `N Card Name` runs which we pack into 60/15 boards.

---

## Set radar (`sets.json`)

Arena-first upcoming expansions (spoilers + dates). **No Alchemy.**

| Piece | Role |
|-------|------|
| `npm run sets` | `pipeline/build-sets.mjs` → Scryfall `/sets` + spoiled cards |
| `pipeline/sources/set-calendar-overrides.json` | Optional official Arena / spoiler dates |
| `website/meta/sets.json` (+ `public/meta/`) | Published feed the app downloads |
| App page **Sets** | Countdown (Arena emphasized), spoiler rail, Scryfall link |

**Recently live window.** The radar ships (1) all future/spoiling constructed
products and anything released in the last ~90 days with **full** Scryfall
galleries, plus (2) every expansion still legal in Standard (whatsinstandard
pool — Foundations through current) with a **slim** mythic/rare sample so the
feed stays small. Older feeds without those rows just show fewer live cards.

The sets feed also carries a `formats` hub (Standard/Pioneer legality, rotation
calendar, ban lists) built from Scryfall legalities + whatsinstandard. Since 0.21
it includes `formats.standard.rotation` (`{ nextDate, roughLabel, setCodes,
cardNames }`) — the cards leaving Standard at the next rotation, computed by
diffing `f:standard` cards in rotating vs staying sets. The app uses it for the
per-deck rotation impact panel and the B&R pulse diffs the `bans` arrays.

CI refreshes the set radar **4× per day**: the daily meta job (06:00 UTC) plus the
Scryfall-only fast lane `.github/workflows/sets-refresh.yml` (00/12/18 UTC). Arena
dates are `official` when overridden, otherwise `estimated` (paper − 3 days) and
labeled in the UI.

**New announcements are automatic.** When WotC reveals a set or spoils cards at an
event, Scryfall catalogs them (usually within hours); the next radar run picks up
the new set row and every spoiled card — including first-look sets with only 1–4
cards and sets Scryfall hasn't dated yet. No code change needed for new sets.
The only manual pieces are `set-calendar-overrides.json` (official Arena dates /
spoiler-season starts, which have no API) and `future-sets.json` below.

**Roadmap sets (`futureSets`).** Sets announced at preview panels / in press
*before Scryfall has a set row* (e.g. next year's Standard sets) are curated by
hand in `pipeline/sources/future-sets.json` — name, kind, date/window label,
confidence (`official`/`reported`), notes, and a **source URL** (nothing is
invented). The build reconciles automatically: an entry drops out the moment
Scryfall catalogs the set (name match → it becomes a normal radar row) or when
an exact-dated entry's day has passed. The app's Sets page renders them as the
**Future Standard** section; older feeds simply lack the key and hide it.

**Announce trailers.** Official WotC YouTube trailers are curated in
`pipeline/sources/set-trailers.json` (by set code and/or exact name). The sets
build attaches a `trailer: { youtubeId, title }` field when known; the app also
keeps a client fallback map so older feeds still show trailers for Nauctis /
Titanbreach etc. The Sets page plays them in an in-app player
(youtube-nocookie embed). Never invent video IDs.

---

## Built-in app updater

| Mode | Behavior |
|------|----------|
| **Signed (preferred)** | `plugin-updater` reads `updater/latest.json`, verifies minisign against the pubkey in `tauri.conf.json`, then **download + install + relaunch** in one click. |
| **Silent NSIS (desktop fallback)** | If signed metadata isn’t available but `version.json` has a newer build + `downloadUrl`, the app downloads the official setup to temp, runs ` /S`, and relaunches. **Never opens Chrome.** |
| **Browser (last resort)** | Vite preview / non-Tauri only: open the installer URL externally. |

`website/version.json` shape:

```json
{
  "version": "0.7.0",
  "downloadUrl": "https://filthy-net-deck.netlify.app/downloads/Filthy-Net-Deck-Setup-0.7.0.exe",
  "notes": "What changed…"
}
```

**End-to-end release is mandatory** for any user-visible change — see root `AGENTS.md`.

Ship steps when releasing a new app build:

1. Bump `package.json` / `src/version.ts` / `src-tauri` version.
2. `npm run tauri:build` with `TAURI_SIGNING_PRIVATE_KEY` (+ password) → copy installer + `.sig` into `website/downloads/`.
3. Update `website/updater/latest.json` (version, notes, url, **signature**).
4. Update `website/version.json` + `public/version.json`.
5. Update `website/index.html` download links + marketed copy.
6. **Share card:** update `og:*` / `twitter:*` / page title+description; edit `website/assets/_gen_og.py` (version + features); run `python website/assets/_gen_og.py`; set image URLs to `og-image.png?v=<version>` so caches refresh.
7. Push `main` (Netlify). Confirm live `version.json` / `updater/latest.json` / OG image.
8. Tag `vX.Y.Z` for macOS CI when shipping a mac build.

Full checklist: root `AGENTS.md`.

---

## How to keep meta accurate

1. Run `npm run meta` (export + `--live`) on a schedule (GitHub Action daily).
2. Commit or artifact-upload `website/meta/latest.json` to Netlify.
3. Users’ apps auto-sync → get that JSON.

Ideal end state: pipeline only ships decks whose `mainboard` came from magic.gg, MTGO JSON, Goldfish export, or Melee decklist text, validated against Scryfall legality where possible.

# Filthy Net Deck — Data pipeline & updates

## How the app syncs (automatic — there is no Refresh button)

Since v0.8.2 the app has no manual Refresh button. It re-downloads the published feed by itself: on launch, when connectivity returns (`online` event), and on focus / an hourly timer whenever the loaded copy is more than 90 minutes old.

**Syncing does *not* scrape MTGGoldfish, Melee, Untapped, or tournaments from your PC.**

| Step | What happens |
|------|----------------|
| 1 | `GET https://filthy-net-deck.com/meta/latest.json` (primary; falls back to `filthy-net-deck.netlify.app` — URL-override setting was removed in v0.8.3) |
| 2 | Parse that JSON (formats, 8×8 board decks + off-meta recognition decks, tournaments, sources) |
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

**Priority when assigning lists onto the 8x8 grid (C3, 2026-07-20):**

1. **MTGO** challenge / showcase / prelim 60s (embedded JSON) when card overlap confidently matches a Goldfish archetype tile.
2. **magic.gg** structured `<deck-list><main-deck>` blocks from article HTML / Nuxt payload — same listMatch gates + Scryfall validation as MTGO. Free-form HTML card-run scraping stays **dead** (historical name corruption).
3. **MTGGoldfish** archetype page list (fallback when no tournament list matches).
4. **Melee** remains event links only (no free full-list feed today).

Goldfish tiles still own **rank / meta % / archetype name**. The *60* may come from MTGO, magic.gg, or Goldfish (in that order).

**Off-meta recognition pool (2026-08-09):** beyond the 8+8 boards, each format
also ships up to 24 off-meta decks flagged `offMeta: true` — sourced from the
Goldfish *full* metagame tile tail (both formats) and the Untapped Bo1 ladder
tail (Standard), lists assigned by the same C3 priority + Scryfall validation
(archetypes with no real list are skipped, never fabricated). They never appear
on the boards or the meta site; they exist so opponent-deck inference, tag
suggestions, ⌘K search and deep links can name decks outside the top 8. When no
list matches at all, the app's inference (`src/services/opponentArchetype.ts
macroArchetypeFallback`) still labels the opponent's colors + macro strategy
(e.g. "Gruul Midrange") from their revealed cards.

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
Articles (e.g. Traditional Standard Ranked) embed **structured** deck blocks:

```html
<deck-list deck-title="…" format="Standard" event-name="…">
  <main-deck>
  4 Card Name
  …
  </main-deck>
  <side-board>…</side-board>
</deck-list>
```

These often live inside the Nuxt SSR payload (`\u003Cdeck-list…`). Parser: `pipeline/sources/magic-gg.mjs` (`parseMagicGgDecklists` / `fetchMagicGgListPool`). Only boards with ≥55 mainboard cards are candidates; assignment still requires `listMatch` + Scryfall.

---

## Set radar (`sets.json` + lazy galleries)

Arena-first upcoming expansions (spoilers + dates). **No Alchemy.**

| Piece | Role |
|-------|------|
| `npm run sets` | `pipeline/build-sets.mjs` → Scryfall `/sets` + spoiled cards → **slim index + per-code galleries** |
| `pipeline/slim-sets-feed.mjs` | Pure split: live/released galleries out of the index; spoiling stays inline |
| `pipeline/sources/mythicspoiler.mjs` | Fresh (unconfirmed) spoilers ahead of Scryfall |
| `pipeline/sources/set-calendar-overrides.json` | Optional official Arena / spoiler dates |
| `website/meta/sets.json` (+ `public/meta/`) | **Slim** published index the app downloads (~0.5 MB) |
| `website/meta/sets/<code>.json` (+ `public/meta/sets/`) | Full card gallery for that set — loaded when the user opens Gallery |
| App page **Sets** | Countdown, spoiler rail, fresh-spoiler strip; gallery fetches lazy file on open |
| App `fetchSetGallery` | `src/services/setsFeed.ts` — session-cached fetch of `meta/sets/<code>.json` |

**Fresh spoilers (ahead of Scryfall).** Scryfall usually catalogs new cards within
hours, but during spoiler season a leaked/previewed card often lands on a visual
aggregator first. `pipeline/sources/mythicspoiler.mjs` scrapes
`mythicspoiler.com/newspoilers.html` (static HTML — no robots restrictions) and
groups cards by set-folder code, which matches the Scryfall set code (`hob`,
`trk`…). Card slugs are the image filenames, which normalize to the same key as a
lowercased Scryfall name (`Delighted Halfling` → `delightedhalfling`). The build
attaches, per upcoming/spoiling set, a `freshSpoilers[]` array of the cards
Scryfall doesn't have yet — filtered against the Scryfall gallery by that
normalized key (DFC front faces included), so the list is **self-healing**: a
card drops the instant Scryfall catalogs it. Fresh cards render in the gallery's
**"Just spoiled · unconfirmed"** strip from the source image URL (no Scryfall id),
labeled unverified, with a "+N fresh" badge on the set card. Fail-soft: if
MythicSpoiler is unreachable the build ships Scryfall-only, never aborts. The
image host (`mythicspoiler.com`) is allowlisted in the Tauri CSP `img-src`. Adding
another spoiler source later = one more module returning `{ bySetCode }` merged
the same way.

**Slim index + lazy galleries (v2.7.1+).** The radar still ships (1) all
future/spoiling constructed products and (2) every expansion still legal in
Standard (whatsinstandard pool). Full `cards[]` stay **inline only** for
`spoiling` / `announced` (active spoiler product). Live / released sets keep a
short `previews[]` rail on the index; opening Gallery loads
`meta/sets/<code>.json` once per session. That cut the published index from
~4.6 MB to ~0.5 MB without losing full-gallery UX online.

- **Offline cache** (`bbi.sets.lastGood`) uses the same slim policy so localStorage
  does not retain multi‑MB live galleries.
- **Do not “simplify” back to one fat `sets.json`.** CI (`sets-refresh.yml`, daily
  meta’s sets step) and `npm run sets` must keep writing both the index and the
  `meta/sets/` tree. Tests: `pipeline/slim-sets-feed.test.mjs`.
- Historical note: v2.6.x put full galleries for every live Standard set in the
  index for offline gallery UX; that regressed desktop memory and is reversed.

The sets feed also carries a `formats` hub (Standard/Pioneer legality, rotation
calendar, ban lists) built from Scryfall legalities + whatsinstandard. Since 0.21
it includes `formats.standard.rotation` (`{ nextDate, roughLabel, setCodes,
cardNames }`) — the cards leaving Standard at the next rotation, computed by
diffing `f:standard` cards in rotating vs staying sets. The app uses it for the
per-deck rotation impact panel and the B&R pulse diffs the `bans` arrays.

CI refreshes the set radar **7× per day**: the daily meta job (06:00 UTC) plus the
fast lane `.github/workflows/sets-refresh.yml` every 4h (00/04/08/12/16/20 UTC).
The fast lane now also pulls MythicSpoiler, so fresh leaks land within a couple of
hours. Arena dates are `official` when overridden, otherwise `estimated`
(paper − 3 days) and labeled in the UI.

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

## Arena card names Scryfall cannot resolve (`meta/arena-names.json`)

The app turns an Arena `grpId` into a card name with
`https://api.scryfall.com/cards/arena/<grpId>`. That covers almost everything,
almost always — but not in two windows where Scryfall has the card and has
not linked it:

1. **A new set**, between "playable on Arena" and "Scryfall has assigned its
   `arena_id`s". Hit for real on **2026-08-12** with **The Hobbit** (`hob`,
   paper release 08-14): all 193 Scryfall entries said
   `games: ["paper","mtgo","arena"]` and `arena_id: null`, so every Hobbit
   card a player cast rendered in the deck list *and the overlay* as
   `Card #103529` — no name, no cost, no colour, and so no archetype signal
   either. That window lands exactly when a new set matters most.

2. **Arena store cosmetics** dumped into old sets Scryfall never tags with
   `arena_id`. Two evergreen piles plus a basic-land sweep:

   - **ANA** — Scryfall's 2018 New Player Experience (`released_at` never
     moves); the paintings live in `pana` without an `arena_id`. Hit for
     real on **2026-08-25** with the Green Game Jam basics (grpIds
     107492–107496). Joined on **name + artist**.
   - **UNF** — Unfinity (2022). Players sleeve those lands onto live
     constructed decks. Hit for real on **2026-09-01**: grpId **81181**
     (Adam Paquette Swamp) rendered as `Card 81181` because
     `/cards/arena/81181` 404s and `set:unf game:arena` 404s (the prints
     are tagged paper/mtgo only). The builder indexes the paper set for art.
   - **Any other basic land** whose grpId Scryfall does not claim, from
     Jumpstart / Secret Lair / old Standard frames / etc. Name + land flag
     only — no name-only art join (that is how a Swamp became an Island).

| Piece | Role |
|-------|------|
| `pipeline/sources/arena-names.mjs` | Builds the gap map |
| `website/meta/arena-names.json` (+ `public/meta/`) | `{ grpId: {n,c?,i?,l?,s?,t?} }`, fetched after a Scryfall 404 |
| `src/services/arenaNameGap.ts` | Owns the client-side map — fetched once per session, **only after** a Scryfall 404 |
| `src/services/arenaMeta.ts` | Resolver for the overlay, archetype inference, Matchups, DeckView |
| `src/services/arenaCards.ts` | Resolver for the My Stats decklist, Brew Lab, deck share |

**There are two resolvers, and a fallback has to be in both.** v3.0.1/v3.0.2
put the gap map inside `arenaMeta` alone, so the overlay had the Hobbit names
while My Stats still showed `Card #103482` — with the map live and correct and
both ids in it. v3.0.3 moved the map into `arenaNameGap` so neither resolver owns
it. Anything that changes how a grpId becomes a name belongs there, not in a
caller. A gap card has no type line at all, so grouping keys off Arena's own
`isLand` flag first (`TrackedDecklist.typeBucket`, `deckShare.groupIdFor`);
nonlands land in "Other" rather than being guessed into a type.

Wire shape is compact because every client that meets an unresolvable card
fetches it: `n` name, `c` mana value, `i` colour identity (`"BR"`), `l` land.
`c` and `i` are **omitted** rather than defaulted when Arena does not state
them, so the client can tell *unknown* from *colourless* / *zero-cost*. The
reader also still accepts the v3.0.1 shape, where a value was a bare name
string.

Arena's enums, verified empirically against the five basic lands rather than
assumed: colours `1=W 2=U 3=B 4=R 5=G`, and `types` containing `5` means Land.

**Source.** `mtgajson.untapped.gg` republishes Arena's own card + localisation
tables, so it is keyed by `grpid` by construction and has a set the day Arena
does. The pipeline already used it for `decodeUntappedDeckString`, so this adds
a source of truth rather than a dependency.

**Self-healing, the same way `freshSpoilers` is.** Only grpIds Scryfall
*cannot* resolve are emitted, re-checked per set against live Scryfall on every
run (7×/day via the sets build). As Scryfall assigns arena_ids the entries
disappear on their own — nobody has to remember to prune anything.

Three deliberate decisions worth keeping:

1. **Only what Arena states.** Name, mana value, colour identity and land-ness
   come straight from Arena's own table; `scryfallId`, `artUrl` and `typeLine`
   stay empty because there is no Scryfall record to take them from, and are
   never reconstructed. Anything Arena omits stays `null`/empty so *unknown*
   remains distinguishable from *colourless*.

   Publishing colours from a non-Scryfall source deserves the suspicion the
   basic-land bug earned — but that bug came from a **cross-mapping that
   disagreed** (grpId 87457 was a Swamp in the game object and an Island through
   the card API). mtgajson *is* Arena's table, keyed by the same grpId the log
   emits, so there is no second mapping able to disagree.
2. **Never persisted.** Gap entries are marked `partial` and stay in memory for
   the session. A stub written to `localStorage` would shadow the real card
   forever once Scryfall caught up, because the resolver short-circuits on any
   cached hit.
3. **An empty result never overwrites a good file.** Empty far more likely means
   "mtgajson was unreachable" than "Scryfall caught up on every set at once", so
   the build leaves the previous map in place.

Fail-soft throughout: a network problem anywhere yields no map and the app
simply behaves as it did before. Symptom that it has broken: new-set cards go
back to showing `Card #<grpId>` while `arena-names.json` stops changing.

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

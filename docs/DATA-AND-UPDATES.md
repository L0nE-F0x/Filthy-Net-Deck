# Filthy Net Deck — Data pipeline & updates

## How the app syncs (automatic — there is no Refresh button)

Since v0.8.2 the app has no manual Refresh button. It re-downloads the published feed by itself: on launch, when connectivity returns (`online` event), and on focus / an hourly timer whenever the loaded copy is more than 90 minutes old.

**Syncing does *not* scrape MTGGoldfish, Melee, Untapped, or tournaments from your PC.**

| Step | What happens |
|------|----------------|
| 1 | `GET https://filthy-net-deck.netlify.app/meta/latest.json` (fixed — the URL-override setting was removed in v0.8.3) |
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

## Built-in app updater

| Mode | Behavior |
|------|----------|
| **Soft (shipped)** | On launch + every auto-sync: check `version.json` → gold banner when remote > local → **Download installer** opens the `.exe` URL via Tauri opener (or browser fallback). Settings → “Check for updates” same path. |
| **Hard (Tauri plugin-updater)** | Signed updates, silent install. Needs signing keys + release workflow. Scaffolded but optional until keys exist. |

`website/version.json` shape:

```json
{
  "version": "0.7.0",
  "downloadUrl": "https://filthy-net-deck.netlify.app/downloads/Filthy-Net-Deck-Setup-0.7.0.exe",
  "notes": "What changed…"
}
```

Ship steps when releasing a new app build:

1. Bump `package.json` / `src/version.ts` / `src-tauri` version.
2. `npm run tauri:build` → copy installer into `website/downloads/`.
3. Update `website/version.json` (`version`, `downloadUrl`, `notes`).
4. Deploy Netlify (website + meta). Users open the app → banner → download → run NSIS.

---

## How to keep meta accurate

1. Run `npm run meta` (export + `--live`) on a schedule (GitHub Action daily).
2. Commit or artifact-upload `website/meta/latest.json` to Netlify.
3. Users’ apps auto-sync → get that JSON.

Ideal end state: pipeline only ships decks whose `mainboard` came from magic.gg, MTGO JSON, Goldfish export, or Melee decklist text, validated against Scryfall legality where possible.

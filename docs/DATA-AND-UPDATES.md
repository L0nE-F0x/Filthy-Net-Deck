# Filthy Net Deck — Data pipeline & updates

## What **Refresh** does (inside the app)

**Refresh does *not* scrape MTGGoldfish, Melee, Untapped, or tournaments from your PC.**

| Step | What happens |
|------|----------------|
| 1 | `GET https://filthy-net-deck.netlify.app/meta/latest.json` (or your Settings override URL) |
| 2 | Parse that JSON (formats, 8×8 decks, tournaments, sources) |
| 3 | Diff vs last snapshot (meta movement) |
| 4 | Cache in memory + local snapshot for offline/diff |
| 5 | Check `version.json` for a newer **app** build (soft update banner) |

If the Netlify JSON cannot be fetched, the app falls back to the **built-in offline pack** that shipped inside the installer (labeled **offline pack** — not “live meta”).

```
┌─────────────┐     Refresh      ┌──────────────────────────┐
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
                    Goldfish · Melee · (future: full deck exports)
```

**Cutting-edge accuracy depends on how often the pipeline runs and how good its sources are — not on Refresh alone.** Refresh only re-downloads whatever is already published on Netlify.

---

## What the **pipeline** does (server / CI)

File: `pipeline/build-meta.mjs`

| Source | What we pull today | Accuracy |
|--------|-------------------|----------|
| **MTGGoldfish metagame HTML** | Archetype **names** + meta **%** | Good for ranking |
| **MTGGoldfish deck export** (when resolvable) | Full **Arena decklist text** for top shells | **Authoritative** lists |
| **Melee.gg SearchResults** | Recent tournament names, formats, links | Event intel only |
| **Built-in pack** (`seed-export.json`) | Fallback structure | Used only if live fetch fails or to fill gaps |

**Policy (product rule):**

1. Prefer **exported tournament / archetype decklists** over hand-written cards.
2. Never invent a 60 from memory when a source list exists.
3. Tag each deck with `listQuality`: `authoritative` | `partial` | `fallback`.
4. Surface quality + source URL in the app (Deck detail + Settings).

---

## Built-in app updater

| Mode | Behavior |
|------|----------|
| **Soft (shipped)** | Check `version.json` → banner → download `.exe` → open installer (user clicks through UAC). No visit to the website required. |
| **Hard (Tauri plugin-updater)** | Signed updates, silent install. Needs signing keys + release workflow. Scaffolded but optional until keys exist. |

---

## How to keep meta “utter accuracy”

1. Run `npm run meta` (export + `--live`) on a schedule (GitHub Action daily).
2. Commit or artifact-upload `website/meta/latest.json` to Netlify.
3. Users hit **Refresh** → get that JSON.

Ideal end state: pipeline only ships decks whose `mainboard` came from Goldfish/Arena export or Melee decklist text, validated against Scryfall Standard legality where possible.

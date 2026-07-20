# Filthy Net Deck — handoff

**Last wrap-up:** 2026-07-20 (Grok session ending) — 100× Phase 0 + A4 + B1 (source) + C3 shipped on `main`.  
**Next agent (Claude):** Read this file + `AGENTS.md` + `100X-ROADMAP.md`. Do **not** re-do completed work below. Pick up at **§ Next actions**.

**Repo:** `L0nE-F0x/Filthy-Net-Deck` · branch **`main`** · HEAD at wrap: **`ea29aef`** (confirm with `git log -1`).  
**Live product version:** **v1.5.1** (website + installers). App code for B1 is **ahead of published binaries**.

---

## Session context (what just happened)

User resumed a Claude session mid-100× program, then continued with Grok:

1. Explained winget/Homebrew/Chocolatey → **user cancelled package managers entirely** (website download + signed in-app updater only).
2. Removed A1 packaging work; shipped **A4 public meta site**.
3. Shipped **B1 opponent-archetype inference** (tracker + UI source).
4. User chose **skip desktop release for now**.
5. Shipped **C3 multi-source meta lists** (MTGO → Goldfish fallback).
6. User asked to update handoff so Claude can continue exactly here.

**Owner preferences:**
- Desktop only (no mobile promises).
- Install via website + in-app updater — **no winget / Homebrew / Chocolatey**.
- Pause and ask on product decisions; otherwise follow `100X-ROADMAP.md` + `AGENTS.md`.
- End-to-end release checklist is mandatory for any user-visible app version (see `AGENTS.md`).

---

## ▶ TOP OF THE TODO LIST

Canonical program: **`100X-ROADMAP.md`**.

### Done this program (2026-07-20)

| ID | Item | Evidence / paths |
|----|------|------------------|
| **C1** | CI quality gate | `.github/workflows/ci.yml` — tsc/vitest/build + rustfmt/clippy/cargo test |
| **C2** | Goldfish fixture tests | `pipeline/goldfish.test.mjs` + `pipeline/__fixtures__/` |
| **C5** | ESLint zero-warning gate | `eslint.config.js`, `npm run lint`, CI web job |
| **C4** | Tracker log fixtures | `src-tauri/tests/fixtures/logs/*` + `fixture_*` tests; real-log helper stays `#[ignore]` |
| **A1** | winget/brew/choco | **CANCELLED** by owner — do not resurrect without asking |
| **A4** | Public meta site | `pipeline/build-meta-site.mjs` → `website/meta-web/`; `sitemap.xml` / `robots.txt`; wired into `npm run meta` + daily-meta CI; homepage nav “Public meta” |
| **B1** | Opponent archetype inference | **Source only** — see § B1 detail; **not in v1.5.1 installer** |
| **C3** | Multi-source meta lists | MTGO match → Goldfish fallback; see § C3 detail |

### Explicitly open

1. **Ship B1 to users** — cut **v1.5.2** (or next version) full AGENTS.md release when owner wants it. Until then, B1 exists only on `main` for `tauri:dev` / future builds.
2. **Live meta refresh with C3** — optional: run `npm run meta` once and inspect how many lists are `listSource: "mtgo"` vs goldfish; commit if good.
3. **magic.gg full-list assignment** — still **deferred** (historical name corruption). Events links only.
4. **Next 100× features** (after release choice): **B2** deeper personal analytics, **B3** grounded coach, **A5** share loop, **A2** Store, etc. Prefer owner direction; default ladder was B1+C3 then B2/B3.

### Do **not** touch without asking

- Unrelated dirty tree: `marketing-video/*`, `website/assets/youtube*`, `goal/` — leave alone.
- Private signing key: `%USERPROFILE%\.tauri\filthy-net-deck.key` (never commit).
- Do not claim app UI is live without installer + updater + site channel.

---

## B1 — opponent archetype (detail)

**Intent:** GRE already exposes opponent cards on battlefield/gy/exile/stack/hand. Collect `grpId`s, match to today’s ranked meta lists (distinctive non-land overlap), show local WR by inferred archetype.

| Layer | Location |
|-------|----------|
| Rust collect + persist | `src-tauri/src/tracker.rs` — `opponent_seen` on `TrackedMatch` / `LiveMatch` / pending; `note_opponent_cards`; test `opponent_cards_seen_from_gre_game_objects` |
| Types | `src/types/tracker.ts` — `opponentSeen?: number[]` |
| Matcher (pure) | `src/services/opponentArchetype.ts` + `.test.ts` |
| Daily panel | `src/components/OpponentArchetypePanel.tsx` (wired in `Daily.tsx`) |
| Stats history | `MatchHistory` / `MatchRow` in `src/pages/Stats.tsx` |
| Overlay live guess | `src/overlay/OverlayApp.tsx` — uses `bbi.meta.lastGood` cache |

**Release requirement:** Rust change → new Windows (and macOS) binary + updater. Soft channel alone is insufficient.

---

## C3 — multi-source lists (detail)

**Intent:** Kill single-source list failure. Goldfish tiles still own **rank / meta % / name**. Lists: prefer MTGO challenge 60 when card-overlap matches tile; else Goldfish archetype page.

| Piece | Path |
|-------|------|
| MTGO JSON extract + pool | `pipeline/sources/mtgo.mjs` — `extractMtgoDecklistsData`, `fetchMtgoListPool` |
| Match scoring | `pipeline/sources/listMatch.mjs` — `pickBestListForTile` |
| Assignment | `pipeline/build-meta.mjs` → `buildFormat` |
| Tests | `pipeline/listMatch.test.mjs` |
| Docs | `docs/DATA-AND-UPDATES.md` (priority section) |

Decks may include `listSource: "mtgo" | "goldfish"` and richer `listNote` / `sources[]`.

**Not done:** magic.gg list scrape for assignment (links only). Melee still links only.

---

## A4 — public meta site (detail)

- Generator: `pipeline/build-meta-site.mjs` (`npm run meta:site`; also end of `npm run meta`)
- Output: `website/meta-web/` (hub, standard/pioneer, 32 deck pages), `website/sitemap.xml`, `website/robots.txt`
- After Netlify deploy: `https://filthy-net-deck.com/meta-web/`

---

## Where the product is

| Item | Value |
|------|--------|
| Published app | **v1.5.1** (dual host filthy-net-deck.com + netlify.app) |
| Windows | `website/downloads/Filthy-Net-Deck-Setup-1.5.1.exe` (+ `.sig`) |
| macOS | `website/downloads/Filthy-Net-Deck-1.5.1-universal.dmg` |
| Updater / soft | `website/updater/latest.json`, `website/version.json`, `public/version.json` |
| Formats | Standard + Pioneer only |
| Tracker | Local `Player.log` only |

Signing: `%USERPROFILE%\.tauri\filthy-net-deck.key` (encrypted). Password local only.

---

## Must not regress

- Never `set_focus` overlay · Rust owns show/hide · dirty-only `tracker:live`
- No backdrop-filter · local-only tracking · ApexForge credit
- Sound opt-in OFF · never in overlay
- Events: freshness + magic.gg/mtgo allowlist
- Brew Lab: **no AI / no hallucinated card names**
- Real-data-only pipeline (abort rather than fabricate)
- End-to-end releases per `AGENTS.md`

---

## Dev commands

```bash
npm install
npm run tauri:dev
npm test              # vitest (pipeline + src) — ~166 tests at wrap
npm run lint
npm run meta          # live meta + regenerates meta-web
npm run meta:site     # static pages only from existing latest.json
npm run tauri:build   # installers (set TAURI_SIGNING_* for updater)
cd src-tauri && cargo test
```

---

## Suggested next actions (pick with user if ambiguous)

**Default if user says “continue” without specifying:**

1. **Optional smoke:** `npm run meta` — confirm C3 assigns some MTGO lists; commit meta JSON only if policy allows (real live data).
2. **Or** start **B2** / next moat item from `100X-ROADMAP.md` (source-only OK).
3. **Or** when user asks to ship B1: **v1.5.2** full release checklist in `AGENTS.md` (version bumps, signed build, downloads, updater, version.json, OG, Netlify, tag for macOS).

**Do not** re-open winget/Homebrew/Chocolatey unless user reverses that decision.

---

## One-liner

> Phase 0 + public meta site + C3 list failover are on `main`. B1 opponent inference is coded but needs a desktop release. Next: owner chooses release vs more features; leave marketing-video dirt alone.

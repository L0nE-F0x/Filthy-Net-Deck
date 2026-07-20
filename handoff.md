# Filthy Net Deck — handoff

**Last wrap-up:** 2026-07-20 (Grok) — **v1.7.0 live**; **fat unreleased batch ready for v1.8.0** (do not claim shipped until AGENTS checklist).
**Next agent:** Read this file + `AGENTS.md` + `100X-ROADMAP.md`. Do **not** re-do A5/B4/D1 or re-ship 1.6.0. Pick up at **§ Explicitly open**.

**Repo:** `L0nE-F0x/Filthy-Net-Deck` · branch **`main`** (confirm with `git log -1` — should show `c41a710` or later).
**Live product version:** **v1.7.0** — Windows signed exe (5,701,809 bytes) + macOS universal dmg (18,327,664 bytes) + updater + soft channel + OG, all confirmed live byte-identical on filthy-net-deck.com.

---

## Session context (what just happened, across Claude ↔ Grok handoffs today)

1. Prior Claude session explained winget/Homebrew/Chocolatey → **owner cancelled package managers entirely** (website + signed in-app updater only — do not resurrect without asking).
2. Grok shipped **A4 public meta site**, **B1 opponent-archetype inference** (source only), **C3 multi-source meta lists** (MTGO → Goldfish fallback), then handed off to Claude.
3. This Claude session: found Grok's B1/C3 pushes had left CI **red** (rustfmt drift + one unused var) — fixed and restored green (`4df30bf`) before doing anything else.
4. Ran the first live C3 smoke: **30/32 deck objects sourced from real MTGO challenge lists** (2 Goldfish fallback), committed (`d7b62d1`).
5. Owner said: **keep progressing through 100X-ROADMAP.md in whatever order I judge best; do a version-bump workflow at the end of the session.**
6. Shipped **B2 game-level analytics** (Bo3 pre/post-board delta + per-deck matchup table vs B1-inferred archetypes) and **C6 anonymized diagnostic export** (Settings → Export diagnostic).
7. A user-spawned background task asked for an **MTGO→Scryfall card-name normalizer** (root cause of a 2026-07-20 Mardu Discard list shipping 58/60 cards). Investigated and fixed: MTGO names OM1 Universes Beyond cards by **printed alias** ("Desecrex, Gift of Servitude"), not the **canonical Scryfall name** ("Carnage, Crimson Chaos"). Shipped a 148-entry alias map **generated from Scryfall itself** (verified by construction) + normalizer wired into the MTGO parser (`1a2bd14`).
8. Owner approved an immediate release. Ran the **full AGENTS.md end-to-end checklist** for **v1.6.0**: version bumps, signed Windows build, updater metadata, soft channel, site copy + OG regeneration, push, tag, macOS CI, dmg roll. **Verified every live URL byte-for-byte against the local artifacts** — not just "pushed and assumed."

**Owner preferences (apply across all agents/sessions):**
- Desktop only (no mobile promises).
- Install via website + in-app updater — **no winget / Homebrew / Chocolatey**.
- Pause and ask on product decisions; otherwise follow `100X-ROADMAP.md` + `AGENTS.md`.
- End-to-end release checklist is mandatory for any user-visible app version (see `AGENTS.md`) — **run the full local gate (`npm run lint && npx tsc --noEmit && npm test && cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test`) before every push.** Two prior pushes this program broke CI by skipping this.
- "Continue" / "keep progressing" without further detail = pick the next roadmap item yourself, in the order you judge best; ask before scope changes or releases unless already told to proceed.

---

## Unreleased v1.8.0 batch (source on main — not in binary)

Cut **one** full AGENTS end-to-end release when the owner asks. Do not ship piecemeal.

| Theme | What landed (source) |
|-------|----------------------|
| **Retention** | D2 light Catch-up strip; D2-b season recap notify+share; local open-day counters |
| **Analytics** | Matchup form + play/draw; field EV; queue WR panel; form on Daily meta panels; Climb form; Stats form extremes + insights |
| **Virality** | Opponent share card (Matchup Lab); existing A5 destinations |
| **Habits** | Meta-mover desktop notify (Settings toggle); richer match-end toast (B1 archetype + MU) |
| **Data out** | CSV adds season + opponent_cards_seen |
| **Hygiene** | Peels: statsHelpers, deckStats, setDates, matchHistorySort, matchupGroups |
| **Cancelled** | A1 packages, A2 Store, A3 Linux, B3 cloud LLM |

**Test suite:** 248+ vitest; Rust tracker tests green.

---

## ▶ TOP OF THE TODO LIST

Canonical program: **`100X-ROADMAP.md`**.

### Done this program (2026-07-20) — all shipped in **v1.6.0**, live and verified

| ID | Item | Evidence / paths |
|----|------|------------------|
| **C1** | CI quality gate | `.github/workflows/ci.yml` — tsc/vitest/build + rustfmt/clippy/cargo test, runs on every push/PR |
| **C2** | Goldfish fixture tests | `pipeline/goldfish.test.mjs` + `pipeline/__fixtures__/` |
| **C5** | ESLint zero-warning gate | `eslint.config.js`, `npm run lint`, CI web job |
| **C4** | Tracker log fixtures | `src-tauri/tests/fixtures/logs/*` + `fixture_*` tests; real-log helper stays `#[ignore]` |
| **A1** | winget/brew/choco | **CANCELLED** by owner — do not resurrect without asking |
| **A4** | Public meta site | `pipeline/build-meta-site.mjs` → `website/meta-web/`; wired into `npm run meta` + daily CI; live at `/meta-web/` |
| **B1** | Opponent archetype inference | **RELEASED in v1.6.0** — see § B1 detail |
| **C3** | Multi-source meta lists | **RELEASED** — MTGO match → Goldfish fallback; first live run 30/32 MTGO; see § C3 detail |
| **C3 fix** | MTGO alias normalizer | **RELEASED** — `pipeline/sources/mtgo-name-map.json` (148 entries, Scryfall-generated), `pipeline/sources/mtgoNames.mjs`; see § MTGO normalizer detail |
| **B2** | Game-level analytics | **RELEASED in v1.6.0** — `src/services/gameAnalytics.ts` (+11 tests), `GameAnalyticsPanel` in Stats deck detail; see § B2 detail |
| **C6** | Anonymized diagnostic export | **RELEASED in v1.6.0** — `tracker_export_diagnostic` + Settings button; see § C6 detail |
| **A5** | Community share loop | **RELEASED in v1.7.0** — matchup share card + save / copy-image / post-X; see § A5 detail |
| **B4** | Overlay matchup depth | **RELEASED in v1.7.0** — historical WR line + cards-seen chip; see § B4 detail |
| **D1** | Sub-2-minute first value | **RELEASED in v1.7.0** — progress bar, "You're live", home strip, local funnel stamps; see § D1 detail |
| **B3** | Grounded AI coach | **CANCELLED** — no cloud LLM ever (owner 2026-07-20) |
| **A2** | Microsoft Store (MSIX) | **CANCELLED** — website + signed updater only (owner 2026-07-20) |
| **A3** | Linux build | **CANCELLED** — Windows + macOS only (owner 2026-07-20) |
| **D2** | Daily-loop strip (light) | **SOURCE only (unreleased)** — Catch up chips on Daily; see § D2 detail |
| **D2-b** | Season recap habit | **SOURCE only (unreleased)** — closed-season notify + share banner on Climb |
| **Ret** | Local open-day counters | **SOURCE only** — Settings About note; never uploaded |
| **B2+** | Matchup form + play/draw | **SOURCE only** — Game analytics table columns + form extremes tile |
| **Ref** | Stats pure helpers peel | **SOURCE only** — statsHelpers.ts (tally/rolling/form extremes) |

**Test suite at wrap: 224 vitest. v1.7.0 live; stacked unreleased: D2*, B2+ matchup form/play-draw, statsHelpers peel, retention.**

### Explicitly open — pick up here

1. **Owner verification (only the owner can do these — flag, don't block on them):**
   - In-app "Check for updates" on an installed pre-1.6.0 client offers **Update & restart** (not a browser download).
   - B1/B2 panels (opponent archetype, game analytics) look right against **real** Arena match history — everything shipped was verified with synthetic data in a browser preview, never a live game.
2. **magic.gg full-list assignment** — still **deferred** (historical name corruption in that scraper). magic.gg stays events-links-only in C3's source chain.
3. **Next 100× features** — product check-in before large scope:
   - **B3** grounded AI coach — **CANCELLED** (no cloud LLM ever).
   - **D2** light catch-up strip — **done in source** (batch into next release).
   - **A2** Microsoft Store / **A3** Linux — **CANCELLED** (owner 2026-07-20). Windows + macOS via website + signed updater only.
   - **A5 / B4 / D1** — **released in v1.7.0**.
   - Smaller: MTGO alias-map gaps when new UB sets land — `node scripts/gen-mtgo-name-map.mjs om1 <newset>`.

### Do **not** touch without asking

- Unrelated dirty tree: `website/assets/youtube*`, `goal/` — leave alone if present (owner WIP). **`marketing-video/` was deleted 2026-07-20** (old Remotion promo pipeline; no longer part of the product).
- Private signing key: `%USERPROFILE%\.tauri\filthy-net-deck.key` + password file `%USERPROFILE%\.tauri\filthy-net-deck-key-password.txt` — never commit, never echo the contents to logs/output.
- Do not claim app UI is live without installer + updater + site channel **and independently verifying the live URL**, not just trusting the push succeeded.
- Do not re-open winget/Homebrew/Chocolatey (A1), Microsoft Store (A2), or Linux packaging (A3) unless the owner reverses that decision.

---

## D2 — daily digest strip (light) (detail)

**Product decision (2026-07-20):** light version only (2–3 chips). **B3 AI coach cancelled**; hard rule **no cloud LLM ever**.

| Piece | Path |
|-------|------|
| Pure chips | `src/services/dailyDigest.ts` (+ tests) — window, record, rank delta, top meta mover |
| UI | `src/components/DailyDigestStrip.tsx` on Daily (after onboarding) |
| Last-open stamp | localStorage `bbi.daily.lastOpenAt` (local only) |

**Not released** — still on v1.7.0 binary until next version bump.

### D2-b — season recap habit + retention

| Piece | Path |
|-------|------|
| Closed-season nudge | `src/services/seasonRecapHabit.ts` — ≥5 games, dismiss/notify once |
| UI | `SeasonRecapBanner` on Climb — share via A5 destinations + dismiss |
| Local retention | `src/services/localRetention.ts` — open-day set; Settings About note |
| Digest fillers | streak + Standard rotation days when primary chips are thin |

---

## D1 — sub-2-minute first value (detail)

**Intent:** Guided, checkable first-session loop so users hit "my own first tracked match" fast.

| Piece | Path |
|-------|------|
| Progress + live | `onboardingProgress`, "You're live" banner when log + match done |
| Local funnel stamps | `syncFunnelFromState` / `recordFunnelMilestone` → `localStorage` `bbi.funnel.v1` (never uploaded) |
| UI | `TrackerOnboarding.tsx` progress bar + live card; **Daily home** strip while coach still needed |
| Tests | `trackerHealth.test.ts` |

**Not released** — still on v1.6.0 binary.

---

## B4 — overlay matchup depth (detail)

**Intent:** Live HUD shows personal historical WR vs the inferred opponent archetype (cards seen → B1 guess → your record on *this* deck). Thin evidence (<2 matches) stays hidden.

| Piece | Path |
|-------|------|
| Pure HUD format | `src/overlay/overlayModel.ts` — `matchupHudLine`, `opponentCardsSeenCount` (+ tests) |
| Live wiring | `src/overlay/OverlayApp.tsx` — reuses `inferOpponentArchetype` + `deckMatchupMatrix`; compact bar shows `· 62% (5–3)`; expanded subline shows full detail or `n seen` |
| CSS | `src/index.css` — `.overlay-opp-mu`, `.overlay-mu-line`, `.overlay-seen-line` |

**Must not regress (unchanged):** no `set_focus`; Rust owns show/hide; dirty-only `tracker:live` coalesced per frame. No Rust overlay changes.

**Not released** — still on v1.6.0 binary.

---

## A5 — community share loop (detail)

**Intent:** Close the virality loop on existing PNG infrastructure. Destinations: save PNG, copy image (Discord paste), post on X (intent + PNG download). Captions seed `filthy-net-deck.com` / public meta-web when a matchup maps to today's ranked list.

| Piece | Path |
|-------|------|
| Destinations + captions | `src/services/communityShare.ts` (+ `.test.ts`) — `deliverShare`, `communityShareOptions`, recap/climb/matchup/deck captions, meta-web URLs |
| Matchup share card | `src/services/matchupShare.ts` (+ `.test.ts`) — package B2 rows → 1080×1350 PNG |
| UI | Week recap + Climb story menus (3 destinations); Game analytics → **Share matchups** |
| ShareMenu | Custom status strings from `onPick` / `onShare` |

**Not released** — still on v1.6.0 binary. Batch with the next feature drop per RELEASE PACING.

---

## B1 — opponent archetype (detail)

**Intent:** GRE already exposes opponent cards on battlefield/gy/exile/stack/hand. Collect `grpId`s, match to today's ranked meta lists (distinctive non-land overlap), show local WR by inferred archetype.

| Layer | Location |
|-------|----------|
| Rust collect + persist | `src-tauri/src/tracker.rs` — `opponent_seen` on `TrackedMatch` / `LiveMatch` / pending; `note_opponent_cards`; test `opponent_cards_seen_from_gre_game_objects` |
| Types | `src/types/tracker.ts` — `opponentSeen?: number[]` |
| Matcher (pure) | `src/services/opponentArchetype.ts` + `.test.ts` |
| Daily panel | `src/components/OpponentArchetypePanel.tsx` (wired in `Daily.tsx`) |
| Stats history | `MatchHistory` / `MatchRow` in `src/pages/Stats.tsx` |
| Overlay live guess | `src/overlay/OverlayApp.tsx` — uses `bbi.meta.lastGood` cache |

**Shipped in v1.6.0** — Rust change went out with a new signed Windows binary + macOS dmg + updater.

---

## B2 — game-level analytics (detail)

**Intent:** Match-level stats already existed (play/draw, Bo1/Bo3). B2 adds game-level granularity: Bo3 pre-board (game 1) vs post-board (games 2+) winrate — the sideboard signal — plus a per-deck matchup table vs B1-inferred opponent archetypes.

| Piece | Path |
|-------|------|
| Pure logic | `src/services/gameAnalytics.ts` (+ `.test.ts`, 11 tests) — `sideboardSplit`, `deckMatchupMatrix`, `gamePlayDrawSplit` |
| UI | `src/components/GameAnalyticsPanel.tsx`, mounted in Stats deck detail below `SplitsPanel` |
| Refactor | `SplitsPanel`'s inline play/draw loop in `src/pages/Stats.tsx` now calls the shared `gamePlayDrawSplit` — same output, single source of truth |

Games without a recorded winner or on-play stamp are excluded, never guessed. Thin matchup evidence is skipped, never bucketed as "Unknown."

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

Decks may include `listSource: "mtgo" | "goldfish"` and richer `listNote` / `sources[]`. **First live run (2026-07-20): 30/32 deck objects from MTGO, 2 Goldfish fallback.**

**Not done:** magic.gg list scrape for assignment (links only). Melee still links only.

### MTGO alias normalizer (added same day, fixes a C3 regression)

MTGO decklist JSON names Universes Beyond dual-identity printings by their **printed alias** ("Desecrex, Gift of Servitude"), which Scryfall's `/cards/collection` validation endpoint rejects — the canonical name is "Carnage, Crimson Chaos". Without normalization, these cards silently drop from lists (2026-07-20 Mardu Discard shipped 58/60).

| Piece | Path |
|-------|------|
| Generated alias map (148 entries, OM1) | `pipeline/sources/mtgo-name-map.json` — every entry sourced from Scryfall, never hand-typed |
| Regen script | `scripts/gen-mtgo-name-map.mjs` — `node scripts/gen-mtgo-name-map.mjs om1 <newset>` when a new UB alias set enters Standard/Pioneer |
| Normalizer | `pipeline/sources/mtgoNames.mjs` — `normalizeMtgoCardName`, pass-through for unknown names (still drop with a diagnostic downstream — no fabrication) |
| Wired into | `pipeline/sources/mtgo.mjs` → `cardsFromMtgoRows` (also merges MTGO's duplicate per-printing rows by name) |
| Tests | `pipeline/mtgoNames.test.mjs` (4 tests) |
| Maintenance doc | `docs/MAINTENANCE.md` §5b — symptom to watch for: diagnostics showing `MTGO cleaned (unknown=<alias>)` |

---

## C6 — anonymized diagnostic export (detail)

**Intent:** Privacy-preserving field visibility. When the tracker misbehaves after an Arena update, a user can export a small JSON with **counters and flags only** — no player names, no opponent names, no match contents, no file paths — and attach it to a GitHub issue.

| Piece | Path |
|-------|------|
| Rust command | `src-tauri/src/tracker.rs` — `tracker_export_diagnostic`; writes to Downloads, reveals in file manager |
| Frontend wrapper | `src/services/tracker.ts` — `exportTrackerDiagnostic` |
| UI | Settings → Tracker health card → "Export diagnostic" button (Tauri-only, hidden in browser) |

Contents: app version, platform, `logFound`/`detailedLogs`/`backfillDone` flags, `matchesRecorded`/`parseErrors` counters, last-event date (day granularity only).

---

## A4 — public meta site (detail)

- Generator: `pipeline/build-meta-site.mjs` (`npm run meta:site`; also end of `npm run meta`)
- Output: `website/meta-web/` (hub, standard/pioneer, 32 deck pages), `website/sitemap.xml`, `website/robots.txt`
- Live: `https://filthy-net-deck.com/meta-web/`

---

## Where the product is (v1.6.0, live and verified 2026-07-20)

| Item | Value |
|------|--------|
| Published app | **v1.6.0** (dual host filthy-net-deck.com + netlify.app) |
| Windows | `website/downloads/Filthy-Net-Deck-Setup-1.6.0.exe` (+ `.sig`) — live, 5,703,492 bytes |
| macOS | `website/downloads/Filthy-Net-Deck-1.6.0-universal.dmg` — live, 18,324,628 bytes (rolled from tag CI, `c41a710`) |
| Updater / soft | `website/updater/latest.json`, `website/version.json`, `public/version.json` — all confirmed live at 1.6.0 |
| OG image | `website/assets/og-image.png?v=1.6.0` — live, 256,715 bytes, feature copy refreshed |
| Formats | Standard + Pioneer only |
| Tracker | Local `Player.log` only |

Signing: `%USERPROFILE%\.tauri\filthy-net-deck.key` (encrypted) + `%USERPROFILE%\.tauri\filthy-net-deck-key-password.txt`. Never commit or echo either. Pipe file contents into env vars (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) for `npm run tauri:build`.

**Downloads hygiene:** `website/downloads/` currently holds exactly the 1.6.0 exe+sig+dmg — no superseded versions. Keep it that way per `docs/MAINTENANCE.md`.

---

## Must not regress

- Never `set_focus` overlay · Rust owns show/hide · dirty-only `tracker:live`
- No backdrop-filter · local-only tracking · ApexForge credit
- Sound opt-in OFF · never in overlay
- Events: freshness + magic.gg/mtgo allowlist
- Brew Lab: **no AI / no hallucinated card names**
- **No cloud LLM ever** (owner 2026-07-20 — B3 cancelled; do not resurrect)
- Real-data-only pipeline (abort rather than fabricate)
- End-to-end releases per `AGENTS.md`

---

## Dev commands

```bash
npm install
npm run tauri:dev
npm test              # vitest (pipeline + src) — 181 tests / 32 files at wrap
npm run lint           # eslint, zero-warning gate
npx tsc --noEmit
npm run meta           # live meta + regenerates meta-web
npm run meta:site      # static pages only from existing latest.json
npm run tauri:build    # installers (set TAURI_SIGNING_PRIVATE_KEY + _PASSWORD)
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

**Before every push:** run the full local gate above. Two pushes this program broke CI by skipping it (rustfmt drift + an unused var) — cheap to catch locally, costly to catch in CI.

---

## Suggested next actions (pick with owner if ambiguous, otherwise use judgment per their standing instruction)

1. **Flag, don't block on:** ask the owner to smoke-test v1.6.0 on a real installed client (update path + B1/B2 against real Arena data) when convenient.
2. **Otherwise:** keep stacking app features (D2/B2 peels already unreleased). B3 AI, A1 packages, **A2 Store, A3 Linux** are all **cancelled**. No open distribution product calls — ship Win+macOS via website + updater only.
3. **Do not** re-open winget/Homebrew/Chocolatey unless the owner reverses that decision.
4. **Do not** start a new release unless the owner asks, or the accumulated unreleased work is substantial enough to justify one (match this session's judgment: batch a few features, then release, don't ship one micro-version per item — see `ROADMAP.md`'s "RELEASE PACING" note).

---

## One-liner

> **v1.7.0 live.** **v1.8.0 batch is fat and unreleased:** D2 digest + season recap, retention, B2+ form/play-draw/field EV, queue analytics, meta-mover notify, opponent share, richer match-end toast, CSV season/cards_seen, peels. A1/A2/A3/B3 cancelled. Cut full AGENTS release when owner asks.

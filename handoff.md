# Filthy Net Deck — handoff

**Read this first.** Live top-of-todo across model/agent handoffs
(Claude ↔ Opus ↔ Grok ↔ Kimi).

**Live product version: v2.5.3** · repo `L0nE-F0x/Filthy-Net-Deck` · branch **`main`**.

**Session wrap (2026-07-28, Opus 5):** release train is **complete** (Windows +
macOS + updater + site) for **v2.5.3**, an owner-reported overlay bug fix. No
open engineering work from this session. Resume by picking from **Backlog**
below; do not invent product work.

---

## Current state (as of wrap)

| Item | Status |
|------|--------|
| App version | **v2.5.3** (`package.json`, `src/version.ts`, Cargo, `tauri.conf.json`) |
| Branch | `main` synced with `origin/main` |
| Key commits | `a8c20f1` rank-path fix · `d3c8250` release · `c57d06f` macOS dmg roll |
| Tag | `v2.5.3` (macOS CI green, 13m48s) |
| Windows | `website/downloads/Filthy-Net-Deck-Setup-2.5.3.exe` + `.sig` |
| macOS | `website/downloads/Filthy-Net-Deck-2.5.3-universal.dmg` |
| Updater | `website/updater/latest.json` → 2.5.3 (key **67FCA9900F523D49**, sig cross-checked live) |
| Soft channel | `website/version.json` + `public/version.json` → 2.5.3 |
| Site | Download buttons + OG `?v=2.5.3` |
| Live Netlify | version.json / updater / setup.exe / .sig / dmg all **200** @ 2.5.3 |
| Gates last green | **355** vitest · **35** cargo (2 ignored) · lint/tsc/clippy clean |
| `WHATS_NEW` | 3 lines (rank-path fix — post-update banner fires) |

Tree keeps **current + previous** installers only (2.5.2 exe + 2.5.3). Older
binaries on GitHub Releases.

---

## What this session shipped (v2.5.3 — overlay rank path)

Owner report: fresh deck, deck history deleted, yet the post-match card drew a
long climb line.

1. **`src/services/rankPath.ts`** (new, 12 tests) — the sparkline called
   `buildRankSeries(matches)` on *every* match ever recorded. Now scoped three
   ways: **this deck** (everything else on the card already was), **one
   season** (never span a monthly reset), **ladder queues only** (`myRank` is
   the constructed rank and gets stamped on drafts/Play too, which padded the
   line with points that never moved the ladder). Session-first with a season
   fallback; the caption names the window it used.
2. **`rank_now` on `LiveMatch`** (`src-tauri/src/tracker.rs`) — `my_rank` is
   frozen at match start, so the path could not show the game you just played.
   `record_matches` seeds `rank_now` from the parser's freshest rank and
   `refresh_ended_rank` patches the lingering ended frame when Arena logs the
   update (~50 log lines after the result). One game + a real move is now a
   two-point line. **Verified against a live `Player.log`**: 12/13 results
   close on a new rank (13th is a draw) — e.g. a win at Mythic 92.1% earning
   92.6%. Harness: `FND_REPLAY_LOG=<path> cargo test replay_real_log --
   --nocapture --ignored`.
3. **Three related bugs** — `PostMatchSummary` counted every match as the
   current deck when the live match had no deck identity; `seasonRecord`
   matched any deckless match via `undefined === undefined`;
   `estimateMatchesPerStep` counted drafts/Play between rank samples,
   overstating Climb's "matches to next rank".
4. **Demo knobs** — `/?demo&phase=ended#/overlay` renders the post-match card,
   `&fresh` cuts history to one game (day-one empty state).
5. **Full release train** — signed Windows (key id verified against the
   `tauri.conf.json` pubkey *before* publish, password file
   `%USERPROFILE%\.tauri\filthy-net-deck-key-password.txt` next to the key),
   updater + soft channels, OG regen, push `main`, tag `v2.5.3`, then roll
   macOS dmg from tag CI into downloads + fix site links.

Audit context: `docs/AUDIT-2026-07-22-v2.5.0.md` (P1/P2 hygiene items closed
in v2.5.2; major deps + owner P3 still open there).

---

## OPEN — needs owner (not agent-solo)

### 1. Netlify meta-web prod↔git drift — ✅ CLOSED 2026-07-30 (not a drift)

Both halves of this had mundane explanations. No deploy was ever pinned and
auto-publish was never off.

**"Live HTML matches no git commit"** — Netlify's **Pretty URLs** post-processing
rewrites HTML on deploy: `href="deck/x.html"` becomes `href='/meta-web/deck/x'`
(absolute, extension stripped, single-quoted). Live HTML will therefore *never*
byte-match git, by design. Both forms return 200 and every canonical points at
the `.html` form, so indexing consolidates correctly. Nothing to fix.

**"`max-age=300` never showed up live"** — correct, and it never will: that rule
lives in the repo-root `netlify.toml`, which Netlify does not read for headers.
Headers come from `website/netlify.toml` (it sits inside the publish directory).
More to the point, **the rule was not worth having** — live pages serve
`max-age=0, must-revalidate`, which is *fresher* than the 300s the "fix" would
have imposed. See the note at the top of the root `netlify.toml`.

**Confirmed working:** deploys land from git push (multiple verified 2026-07-30),
and the daily cron regenerated the full meta-web corpus with a same-day
`lastmod`. Verification method for future doubt: check a response header or a
generated marker, not a byte-diff against git.

### 2. Owner marketing WIP (dirty / untracked — DO NOT TOUCH)

Leave alone unless the owner explicitly asks:

- `website/assets/youtube*`, `video/`, `video_stills/`, `launch/`
- `website/assets/_gen_youtube.py`, `_compose_youtube_community.py`
- `website/assets/app-screenshot-decks.png`
- `scripts/capture-app-stills.mjs`, `generate_marketing_*.py`
- `goal/`

---

## Backlog for the next agent (pick with owner, or hygiene only)

**Do not cut a release unsolicited.** Batch product work; engineering hygiene
may proceed on judgment. Ask before product decisions.

| Priority | Item | Notes |
|----------|------|--------|
| Optional smoke | In-app **Update & restart** from an older build | Confirms signed path; not a code task |
| P2 eng | Major dep bumps **one branch at a time** | typescript 7, vite 8, vitest 4, plugin-react 6 — never batch |
| P2 product-aware | Secondary-monitor toast/presence | Owner-aware; follow Arena’s display — real work |
| P3 owner-only | Donations link · v3.0 accounts/sync · Scryfall attribution re-add · `.git` history purge | Ask first; attribution was a deliberate v2.2.1 trade |

**Good first resume prompts (owner should choose):**

1. “Check Netlify meta-web drift” (owner has dashboard).
2. “Bump one dep on a branch” (e.g. vitest 4 alone).
3. “Start secondary-monitor presence/toast” (product-ish — confirm first).
4. Marketing WIP finish (owner assets only).

---

## Release artifacts (current)

| Target | File |
|--------|------|
| Windows | `website/downloads/Filthy-Net-Deck-Setup-2.5.3.exe` + `.sig` |
| macOS | `website/downloads/Filthy-Net-Deck-2.5.3-universal.dmg` |
| Updater | `website/updater/latest.json` |
| Soft | `website/version.json` + `public/version.json` |
| Tag | `v2.5.3` |

**Sign only** with key id **67FCA9900F523D49**
(`%USERPROFILE%\.tauri\filthy-net-deck.key` + `filthy-net-deck-key-password.txt`).
Repo-root `filthy-net-deck.key` is abandoned (wrong pubkey — breaks auto-update).
Never commit keys; never echo password.

Full definition of done: **`AGENTS.md`**.

---

## Full local gate before every push

```
npm run lint && npx tsc --noEmit && npm test
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

## Verification without Arena

`npm run dev`, then seed:

```js
window.__fndStore.setState({ trackerMatches: [/* real grpIds e.g. Ethereal Armor 92065 */] })
```

Overlay/toast/presence demos: `/?demo#/overlay` (add `&phase=ended` for the
post-match card, `&fresh` for its day-one state).

## Architecture must-knows

- **Four webviews:** `main` · `overlay` · `toast` · `presence`. Every new
  window label MUST be in `src-tauri/capabilities/default.json` `windows`.
  `.transparent()` stays `#[cfg(not(macos))]` or dmg CI breaks.
- **Feed entry:** only `normalizeMetaBundle` in `src/services/deckHelpers.ts`.
- **Stats UI:** panels under `src/components/stats/`; page shell
  `src/pages/Stats.tsx`.
- **Meta pipeline:** `pipeline/build-meta.mjs`, `build-sets.mjs`,
  `build-meta-site.mjs` (`npm run meta:site` in daily cron).

## Owner preferences (non-negotiable)

- Desktop only — no mobile / Android WR promises.
- Distribution: website + signed in-app updater only (no winget/Homebrew/Store/Linux).
- Prefer **Update & restart** over browser `.exe` download.
- Formats: **Standard + Pioneer only**; real lists only. Brew Lab stays pure.
- Batch features per release; ask before product-scale decisions or unsolicited releases.

## Quick map

| Need | Where |
|------|--------|
| Version / What's New | `package.json`, `src/version.ts`, `src-tauri/{Cargo.toml,tauri.conf.json}`, `*/version.json` |
| My Stats | `src/components/stats/*`, `src/pages/Stats.tsx` |
| Tracker / ranks | `src-tauri/src/tracker.rs`, `src/types/tracker.ts` |
| Arena open watcher | `src-tauri/src/arena.rs`, `presence.rs` |
| Overlay / toast | `src/overlay/*`, `src/toast/*` |
| Meta pipeline | `pipeline/*` |
| Release rules | **`AGENTS.md`** |
| Self-maintenance | `docs/MAINTENANCE.md` |
| Audit + backlog detail | `docs/AUDIT-2026-07-22-v2.5.0.md` |

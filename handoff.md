# Filthy Net Deck — handoff

**Last wrap-up:** 2026-07-21 (Claude/Opus 4.8) — **three releases shipped back-to-back, all fully live + byte-verified:**

- **v2.1.0 — Set Radar spoilers ahead of Scryfall.** New `pipeline/sources/mythicspoiler.mjs` scrapes mythicspoiler.com/newspoilers (static HTML, folder code == Scryfall set code, slug == normalized card name). Per spoiling set, cards Scryfall hasn't catalogued attach as `freshSpoilers[]` (self-healing: drop the instant Scryfall confirms, DFC front-face aware; dedup in `sets.mjs buildFreshSpoilers`). Fail-soft. Radar refresh cadence 3x/day → **every 4h** (`sets-refresh.yml`). CSP allowlists mythicspoiler.com img-src.
- **v2.2.0 — copy the opponent's deck (Untapped-parity ask).** New `src/components/OpponentDeckRead.tsx` on Matchup Lab opponent detail: infers closest ranked list from a match's `opponentSeen` (reuses existing `inferOpponentArchetype` — NOT a new engine), shows revealed cards w/ signature hits, "Copy their deck" (Arena import) + "Improve in Brew Lab". New pure `selectOpponentSeenGrpIds(matches, scope)` (recent vs union; unit-tested). New store action `openBrewLabText()` seeds Brew Lab paste clinic + auto-runs. Framed "closest ranked list, not their exact 75."
- **v2.2.1 — data-source provenance hidden app-wide EXCEPT Events.** New `src/services/sanitizeSources.ts` strips " on <Source>" + trailing "Representative … from …" from `deck.description`; applied in `normalizeMetaBundle` (deckHelpers.ts, the single feed entry point) which also drops `listNote` + empties `sources` → DeckView Sources footer (SourceFooter.tsx **deleted**) + listNote gone. Sets fresh-spoiler strip, FormatHub, Settings, Splash, Help, BrewLab, TrackedDecklist genericized. `build-meta.mjs` templates now source-free. **Owner calls:** utility "Open on Scryfall" card links KEPT; Events (MetaPulse/FormatView) keep sources. Verified sanitizer vs LIVE feed → 0 residuals.

**Known follow-ups (not done, owner-scoped):** public meta-site (`build-meta-site.mjs` → filthy-net-deck.com/meta-web) still shows a Sources section (this pass was "the app" only). Scryfall attribution removed from Settings (their API guidelines request it — deliberate owner trade). Donations link / v3.0 accounts+sync still unstarted.

100X program remains **complete**; future work = owner requests. Preview verification uses the `window.__fndStore` dev handle (seed `trackerMatches`/state in plain vite dev — real Arena grpIds e.g. Ethereal Armor 92065). Note: browser-pane **screenshots time out** (Scryfall CDN images); verify via DOM/get_page_text instead.

**Repo:** `L0nE-F0x/Filthy-Net-Deck` · branch **`main`**.
**Live product version:** **v2.2.1**

| Artifact | Notes |
|----------|--------|
| Windows | `website/downloads/Filthy-Net-Deck-Setup-2.2.1.exe` + `.sig` (local key, sig key id 67FCA9900F523D49 byte-verified) |
| macOS | `website/downloads/Filthy-Net-Deck-2.2.1-universal.dmg` (rolled from tag CI) |
| Updater | `website/updater/latest.json` · soft channel `website/version.json` + `public/version.json` |
| Tag | `v2.2.1` (also `v2.1.0`, `v2.2.0` this session) |
| Marketing | Flagship story stays "Copy the opponent's deck"; OG `og-image.png?v=2.2.1` cache-bust. v2.2.1 notes framed as a UI polish pass (sources deliberately not mentioned). |

Release recipe unchanged: `scripts/do-<ver>-bump.mjs` + `_gen_og.py` + signed `npm run tauri:build` (env from `%USERPROFILE%\.tauri\`) → exe+sig to downloads → `updater/latest.json` → push → tag → macOS CI dmg → mac links. Every release this session pushed clean (no cron race) and byte-verified live on both hosts.

---

## What v2.0.2 shipped (owner's overlay redesign request)

Owner brief: shrink the overlay footprint, make it more discreet, lose no functionality, add more info, beat Untapped, remember size/position.

| # | Feature | Where |
|---|---------|-------|
| 1 | **Density modes** — Cozy / Compact / **Compact is the new default** (22px art) / Minimal (text-only HUD, readable at 164px; window MIN_W lowered 180→164; pips stay visible in minimal even under the 214px media query) | `overlayModel.ts` (`OverlayDensity`, `normalizeDensity`), `OverlayApp.tsx`, `index.css` `.density-*`, `overlay.rs` MIN_W |
| 2 | **Opponent tab** — every card the opponent has shown this match (from `opponentSeen`, already collected), grouped Lands/Creatures/Spells with art+pips, archetype read + personal matchup on top; tab strip "My deck / Opponent · N" | `groupSeenCards()` in overlayModel, `SeenRow`/`SeenSection` in OverlayApp, `.overlay-tabs` CSS |
| 3 | **New live chips, zero new parsing** — turn (T7), Play/Draw, mulligans (M1) on bar + expanded sub-row. Rust exposes already-parsed `cur_turn`/`game_on_play`/`game_mulligans` on `LiveMatch` (`turn`/`onPlay`/`mulligans`); turn changes + turn-1 lock now set `live_dirty` | `tracker.rs` (LiveMatch fields, `note_turn_number` returns changed), `types/tracker.ts` |
| 4 | **Idle dim** (default ON) — panel fades to 0.6 opacity while mouse is away (1.2s delay), wakes on hover; never while ended, never with click-through. Pref `overlayIdleDim` | `OverlayApp.tsx` `dimmed`, `.is-dim` CSS, Settings + ⚙ pill |
| 5 | **Geometry rescue** — saved position validated against monitor layout at window creation (`geometry_reachable`); unplugged monitor → position falls back, size kept. Size/position persistence itself pre-existed (save on move/resize, restore on create) | `overlay.rs` (+ unit test) |
| 6 | **Browser demo state** — `/?demo#/overlay` in plain vite dev renders the HUD with real Arena grpIds (Scryfall-resolvable), no Arena/Tauri needed. Use it to verify overlay styling changes | `src/overlay/demoLive.ts` (gated `!isTauri()`) |

Prefs plumbing: `overlayDensity` + `overlayIdleDim` follow the exact `overlayBarClock` pattern (store setters → `pushOverlayPrefs()` → `prefs:overlay` event → overlay `readOverlayPrefs`). The overlay's separate opponent-name resolve effect was folded into one shared `useArenaMetaMap(ids)` (library + opponentSeen).

**Release recipe used:** `scripts/do-2.0.2-bump.mjs`, `_gen_og.py` (badge "STEALTH OVERLAY + OPPONENT TAB"), signed `npm run tauri:build` (env from `%USERPROFILE%\.tauri\`, sig key id decoded + matched 67FCA9900F523D49), exe+sig → `website/downloads`, `updater/latest.json`, rebase `--autostash` over cron bots, push, tag `v2.0.2` → macOS CI dmg → downloads + mac links, 2.0.1 dmg pruned. All live URLs byte-verified after deploy.

## Owner preferences (non‑negotiable)

- Desktop only — no mobile / Android WR tracking promises.
- Distribution: **website + signed in-app updater only** — no winget / Homebrew / Chocolatey / Store / Linux.
- Prefer **Update & restart** over browser download for updates.
- Signing key: `%USERPROFILE%\.tauri\filthy-net-deck.key` + password file `filthy-net-deck-key-password.txt` next to it — **never commit, never echo**. Never sign with the repo-root key (abandoned, wrong pubkey).
- Formats: **Standard + Pioneer only**; real lists only. Brew Lab must stay pure (no AI, no invented cards).

## Do **not** touch without asking

- Owner WIP (dirty/untracked): `website/assets/youtube*`, `website/assets/video/`, `website/assets/_gen_youtube.py`, `website/assets/_compose_youtube_community.py`, `website/assets/launch/`, `website/assets/app-screenshot-decks.png`, `goal/`
- Private signing keys · git history rewrite (`docs/GIT-HISTORY-BLOAT.md`) · cancelled tracks (packages, Store, Linux, cloud LLM).

## Full local gate before every push

`npm run lint && npx tsc --noEmit && npm test`
then `cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test`

## Quick map

| Need | Where |
|------|--------|
| Version / What's New | `package.json`, `src/version.ts`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` |
| Tracker / ranks / mulligans | `src-tauri/src/tracker.rs`, `src/types/tracker.ts` |
| Overlay (HUD + post-match + demo) | `src/overlay/OverlayApp.tsx`, `PostMatchSummary.tsx`, `demoLive.ts`, `src-tauri/src/overlay.rs` |
| Share cards | `src/services/shareKit.ts` + `deckShare / matchupShare / opponentShare / recapCard / shareCards.ts` |
| Brew Lab / grade | `src/services/brewLab.ts`, `src/pages/BrewLab.tsx` |
| Meta sources | `pipeline/build-meta.mjs`, `pipeline/sources/*` |
| Release rules | **`AGENTS.md`** (definition of done) · release recipe also in agent memory |
| Marketing + OG | `website/index.html`, `website/assets/_gen_og.py` |

# Filthy Net Deck — handoff

**Last wrap-up:** 2026-07-20 (Kimi) — **v2.0.1 fully released** (share-image overhaul + post-match overlay summary + notification fix, one batch). 100X program is **complete**; there is no active roadmap. Future work = owner requests.

**Repo:** `L0nE-F0x/Filthy-Net-Deck` · branch **`main`**.
**Live product version:** **v2.0.1**

| Artifact | Notes |
|----------|--------|
| Windows | `website/downloads/Filthy-Net-Deck-Setup-2.0.1.exe` + `.sig` (same local key, signed on the dev box) |
| macOS | `website/downloads/Filthy-Net-Deck-2.0.1-universal.dmg` (rolled from tag CI) |
| Updater | `website/updater/latest.json` · soft channel `website/version.json` + `public/version.json` |
| Tag | `v2.0.1` |
| Marketing | New-in-v2.0.1 bento, OG / Twitter meta + `og-image.png?v=2.0.1` cache-bust |

---

## What v2.0.1 shipped (owner's batch)

| # | Feature | Where |
|---|---------|-------|
| 1 | **Share image overhaul** — every shareable PNG (deck, matchup, opponent, weekly recap, session wrap, climb, theme) rebuilt on a shared premium canvas kit: brand frames, gradients/glows, WR rings, mana pips, stat tiles, sparklines; latent mojibake on cards fixed | `src/services/shareKit.ts` (kit), `deckShare.ts`, `matchupShare.ts`, `opponentShare.ts`, `recapCard.ts`, `shareCards.ts`, kickers in `Stats.tsx` + `SessionWrapBanner.tsx` |
| 2 | **Post-match summary in the overlay** (toggleable) — after win/loss the "ended" frame lingers ~12s (Rust `schedule_clear_ended`, was 2.8s) and the overlay shows a result card: season + session record chips, recent-form squares, **rank-path sparkline** (WR-trend fallback). Panel auto-expands/grows and restores the user's height on the next match | `src/overlay/PostMatchSummary.tsx`, `OverlayApp.tsx` (SUMMARY_MIN_H 252, preSummaryH restore), `src-tauri/src/overlay.rs` (`overlay-post-match` flag + `overlay_set_post_match`) |
| 3 | **Match-end toasts fixed** — the tracker thread posts the toast itself (was: frontend, throttled when tray-hidden + muted by Focus Assist mid-game). Toasts land in Action Center regardless; JS path kept for browser dev only. Toggle mirrored to Rust (`notify-match-end` file, `notify_set_match_end`), both flags self-heal from localStorage on boot (`initTracker`) | `src-tauri/src/tracker.rs` (`match_end_body`, `post_match_end_toast`), `useAppStore.ts` (dedupe via `!isTauri()`), `src/services/overlay.ts` bridges |
| 4 | Toggles wired everywhere: Settings → In-game overlay ("Post-match summary") + overlay ⚙ pill menu; Settings → Notifications copy now tells the Focus Assist / Action Center story | `Settings.tsx`, `OverlayApp.tsx`, prefs `overlayPostMatch` (default on) |

**Release recipe:** same as always — `scripts/do-2.0.1-bump.mjs` (bump + site + OG cache-bust), `_gen_og.py` regenerated, signed `npm run tauri:build` (env from `%USERPROFILE%\.tauri\`), exe+sig into `website/downloads`, `updater/latest.json`, tag `v2.0.1` → macOS CI dmg.

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
| Overlay (HUD + post-match) | `src/overlay/OverlayApp.tsx`, `src/overlay/PostMatchSummary.tsx`, `src-tauri/src/overlay.rs` |
| Share cards | `src/services/shareKit.ts` + `deckShare / matchupShare / opponentShare / recapCard / shareCards.ts` |
| Brew Lab / grade | `src/services/brewLab.ts`, `src/pages/BrewLab.tsx` |
| Meta sources | `pipeline/build-meta.mjs`, `pipeline/sources/*` |
| Release rules | **`AGENTS.md`** (definition of done) · release recipe also in agent memory |
| Marketing + OG | `website/index.html`, `website/assets/_gen_og.py` |

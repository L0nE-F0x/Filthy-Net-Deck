# Filthy Net Deck — handoff

**Last wrap-up:** 2026-07-20 (Claude / Fable 5) — **v2.0.0 fully released** (owner's 10-item handwritten final batch). 100X program is **complete**; there is no active roadmap. Future work = owner requests.

**Repo:** `L0nE-F0x/Filthy-Net-Deck` · branch **`main`**.
**Live product version:** **v2.0.0**

| Artifact | Notes |
|----------|--------|
| Windows | `website/downloads/Filthy-Net-Deck-Setup-2.0.0.exe` + `.sig` (key 67FCA9900F523D49 verified) |
| macOS | `website/downloads/Filthy-Net-Deck-2.0.0-universal.dmg` (rolled from tag CI) |
| Updater | `website/updater/latest.json` · soft channel `website/version.json` + `public/version.json` |
| Tag | `v2.0.0` |
| Marketing | New-in-v2.0 bento, OG / Twitter meta + `og-image.png?v=2.0.0` cache-bust |

---

## What v2.0.0 shipped (owner's 10 items)

| # | Feature | Where |
|---|---------|-------|
| 1 | Decklist views on My Stats deck detail: **Stacked (default, Arena-style) / List / Text**, persisted | `src/components/TrackedDecklist.tsx`, prefs `decklistView` |
| 2 | **Brew Lab standalone page** — clinic any tracked deck or **pasted list**; **Clinic Grade** A+…D over 5 axes; copyable text report | `src/pages/BrewLab.tsx`, `src/components/BrewLabPanel.tsx` (`BrewClinic`), `brewLab.ts` (`clinicGrade`, `fromNamedLines`), `namedCards.ts` (Scryfall POST /cards/collection), `arenaImport.ts` (`parseDeckText`) |
| 3 | **Mythic % climb** — tracker stamps `Mythic 93.4%` / `Mythic #874` (from `constructedPercentile` / `constructedLeaderboardPlace`, defensive); climb chart zooms into the Mythic band | `src-tauri/src/tracker.rs on_rank`, `src/services/ranks.ts`, `src/pages/Climb.tsx` |
| 4 | Climb path **newest/oldest toggle** (stretch numbers stay chronological) | `Climb.tsx`, pref `climbNewestFirst` |
| 5 | Nav: **Events ↔ Format Hub swapped**, Brew Lab added — keys **1–9** | `App.tsx` NAV, CommandPalette |
| 6 | Overlay **⚙ quick-settings pill** (opacity, start-expanded, bar widgets, click-through) — writes prefs + emits `prefs:overlay`; main window mirrors via `reloadPrefs()` | `src/overlay/OverlayApp.tsx`, `useAppStore.ts` |
| 7 | **Minimized overlay bar** now shows season record, Bo chip, match clock (toggleable) | `OverlayApp.tsx`, prefs `overlayBarClock/Record` |
| 8 | **Help & tour** — first-run modal (localStorage `bbi.helpSeen.v1`), topbar Help button, Settings entry | `src/components/HelpGuide.tsx` |
| 9 | Settings **Interface card**: launch page, decklist view, climb order, reduce motion (`data-reduce-motion`) | `Settings.tsx`, `theme.ts applyReduceMotion` |
| 10 | Everything persisted in the `bbi.prefs` blob (shared with overlay webview) | `useAppStore.ts loadPrefs` |

## Owner preferences (non‑negotiable)

- Desktop only — no mobile / Android WR tracking promises.
- Distribution: **website + signed in-app updater only** — no winget / Homebrew / Chocolatey / Store / Linux.
- Prefer **Update & restart** over browser download for updates.
- Signing key: `%USERPROFILE%\.tauri\filthy-net-deck.key` + password file `filthy-net-deck-key-password.txt` next to it — **never commit, never echo**. Never sign with the repo-root key (abandoned, wrong pubkey).
- Formats: **Standard + Pioneer only**; real lists only. Brew Lab must stay pure (no AI, no invented cards).

## Do **not** touch without asking

- Owner WIP (dirty/untracked): `website/assets/youtube*`, `website/assets/video/`, `website/assets/_gen_youtube.py`, `website/assets/_compose_youtube_community.py`, `goal/`
- Private signing keys · git history rewrite (`docs/GIT-HISTORY-BLOAT.md`) · cancelled tracks (packages, Store, Linux, cloud LLM).

## Full local gate before every push

`npm run lint && npx tsc --noEmit && npm test`
then `cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test`

## Quick map

| Need | Where |
|------|--------|
| Version / What's New | `package.json`, `src/version.ts`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` |
| Tracker / ranks / mulligans | `src-tauri/src/tracker.rs`, `src/types/tracker.ts` |
| Brew Lab / grade | `src/services/brewLab.ts`, `src/pages/BrewLab.tsx` |
| Meta sources | `pipeline/build-meta.mjs`, `pipeline/sources/*` |
| Release rules | **`AGENTS.md`** (definition of done) · release recipe also in agent memory |
| Marketing + OG | `website/index.html`, `website/assets/_gen_og.py` |

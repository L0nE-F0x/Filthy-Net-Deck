# Filthy Net Deck — Production Roadmap

**Source:** Full preproduction audit, 2026-07-17 (Claude Fable 5), starting from v0.14.0.
**How to use this file:** Work top to bottom. Check items off (`[x]`) as they ship; delete a milestone section once fully shipped. Any user-visible change ships via the **full AGENTS.md release checklist** (version bumps → signed installer → updater/latest.json → version.json ×2 → website links → OG image + meta with `?v=` cache-bust → push → tag → verify live). Source-only pushes are not releases.
**Handoff note:** If you are a new agent/model picking this up, read `handoff.md` and `AGENTS.md` first. Signing key: `%USERPROFILE%\.tauri\filthy-net-deck.key` (ask the owner for the passphrase — never commit it).

---

## Milestone 1 — v0.14.1 hotfix (IN PROGRESS)

Critical fixes before the social-media marketing push.

- [x] **P0: Feed-origin bug** — fixed: `getMetaUrl()`/`getSetsUrl()` use the relative path only when `import.meta.env.DEV`; installed apps always hit the CDN (`src/services/metaFeed.ts`, `setsFeed.ts`).
- [x] **P0: macOS downloads stranded at 0.12.0** — v0.14.0 universal dmg pulled from the GitHub release into `website/downloads/`; both mac links + labels updated in `website/index.html`.
- [x] **P1: "New since last visit" wiped by background sync** — snapshot no longer saved on fetch; `markSetsSeen` baselines it when the user leaves the Sets page.
- [x] **P1: "Later" on update banner doesn't stick** — `dismissedUpdateVersion` tracked in the store for the session; banner suppressed for that version, Settings still shows the update.
- [x] **P1: Sets card drawer keyboard support** — Escape closes, drawer takes focus on open, focus returns to the opening card on close.
- [x] **P1: Arena-eve estimated dates hedged** — "expected on Arena tomorrow (estimated date)" wording in the desktop notification and SpoilerPulse banner when confidence is `estimated`.
- [x] **Release v0.14.1 end-to-end** — shipped 2026-07-17; live Netlify verified (version.json, updater/latest.json + signature, installer, OG); owner confirmed in-app Update & restart worked.
- [x] **Roll v0.14.1 dmg to macOS** — CI dmg pulled from the v0.14.1 GitHub release; mac links now at 0.14.1 (parity with Windows).

**Milestone 1 complete — v0.14.1 live on all platforms.**

## Milestone 2 — v0.15.0 "Polish & Trust"

Remaining correctness/quality items plus the highest-value shell improvements.

- [x] **Meta-movement panel disappears mid-session** — the day's diff is persisted (`bbi.meta.lastDiff`) and re-served on same-day re-syncs.
- [x] **Events: Limited events mislabeled as Standard** — `mapMeleeFormat` now maps draft/sealed/limited/cube/prerelease to "limited" (dropped by build-meta).
- [x] **plugin-http decision** — Scryfall API calls now route through `apiFetch` (`src/services/http.ts`): Tauri HTTP plugin in the desktop app (real User-Agent), plain fetch fallback in the browser.
- [x] **CSP/capability tightening** — `frame-src 'none'`, `img-src` narrowed to the app's own Netlify domain.
- [x] **Launch at startup (minimized to tray)** — tauri-plugin-autostart with `--hidden` flag (boots hidden to tray) + "Start with your PC" toggle in Settings.
- [x] **First-time "still running in the tray" notification** on close-to-tray (one-time marker file in app data).
- [x] **Window state persistence** — tauri-plugin-window-state (visibility flag excluded; tray logic owns it).
- [x] **"What's new" panel** — one-time banner after an update, driven by `WHATS_NEW` in `src/version.ts` vs `bbi.lastSeenVersion`.
- [x] **Persist last-selected format** — `prefs.lastFormatId`, restored on launch.
- [x] **Dedupe the land-detection regex** — shared `src/services/landNames.ts`.
- [ ] **Release v0.15.0 end-to-end** (full AGENTS.md checklist + macOS dmg roll after tag CI).
- [x] **Marketing site: SmartScreen note** — already present in the download section (audit missed it); nothing to do.
- [ ] **Marketing site: real screenshot/GIF carousel** (Set Radar gallery, Climb chart, Stats) to replace/augment the CSS mock for video traffic. *Deferred: needs real app screenshots from the owner's machine (with tracker data visible) — capture at 1280×860, drop in `website/assets/`, then wire the carousel.*

## Milestone 3 — v0.16.0 "Stats & Matchup upgrades"

- [ ] **Session line in My Stats** — "Today: 5W 2L (71%)" tile at the top; streamers screenshot exactly this.
- [ ] **Current win/loss streak indicator.**
- [ ] **Tag-aggregated matchup table** — the Matchup Lab payoff: once opponents are tagged, show per-deck "vs Izzet Prowess: 12W 8L" aggregated across all opponents with that tag.
- [ ] **Seed tag autocomplete with today's meta archetype names** (from the loaded meta bundle), not just previously-typed tags.
- [ ] **CSV export of match history** — local file save; respects the privacy story.
- [ ] **Opponent search box** in Matchup Lab / match history.
- [ ] **Winrate-over-time sparkline** on the Stats home.
- [ ] **Meta ↔ personal bridge** — match tracked deck names/hashes to meta archetypes; show "your winrate with this archetype" on Decks-page deck cards.

## Milestone 4 — v0.17.0 "Set Radar & Decks upgrades"

- [ ] **Gallery arrow-key navigation** — ←/→ steps through cards while the detail drawer is open; prev/next buttons in the drawer.
- [ ] **Legality copy for unreleased sets** — "Std — / Pio —" reads as broken pre-release; show "Std at release" for `spoiling`/`announced` sets.
- [ ] **Render mana costs as colored symbol pips** instead of `{2}{U}` text (drawer + gallery captions).
- [ ] **"Days until next Arena drop" badge** on the Sets nav item.
- [ ] **Virtualize the gallery grid** for 300+ card sets (or windowed rendering) — 400 DOM cells with shadows stutter on laptops.
- [ ] **Decks: per-deck movement chips** (↑2 / ↓1 / new) on deck cards, from the existing metaDiff data.
- [ ] **Decks: multi-select color filter.**
- [ ] **Deck view: hover art previews on card rows** (or click → reuse the Sets card drawer with oracle text).
- [ ] **Deck view: group mainboard by type** (creatures/spells/lands) with counts; show average mana value next to the curve.
- [ ] **Deck view: post-copy hint** ("paste in Arena → Decks → Import") for newer players.
- [ ] **Events: format/platform filter chips + relative dates** ("2d ago").
- [ ] **Events: move Untapped meta-page rows** out of the tournament list into a separate "Meta trackers" strip.

## Milestone 5 — v0.18.0 "Content engine" (new features)

Ranked by impact-per-effort; all desktop-local, real-data-only.

- [ ] **Daily archetype diff** — "what changed in Izzet Prowess today": diff today's list vs yesterday's per archetype using the already-archived `website/meta/<date>.json`; reuse the tracker's `DiffArt` card-swap UI. (Pipeline: keep N days of dated JSON; app fetches yesterday's file.)
- [ ] **Shareable recap card** — render a local PNG ("This week: 62% WR · Diamond 3 → Diamond 1 · best deck …" + card art + branding + download URL) from Stats/Climb. One button; every share is an ad.
- [ ] **Match-end toast** — desktop notification when a match records ("Win vs Rival · 64% today"). Opt-in like Arena-eve; proves the tracker is alive.
- [ ] **Meta-share timeline** — pipeline appends each day's `{archetype, pct}` to a compact `history.json`; app charts 30-day archetype trends.
- [ ] **Personal vs. meta dashboard** — combine the above: your WR piloting the #1 deck vs its meta share, best-performing archetype for *you*.

## Milestone 6 — Infrastructure backlog (no version bump needed unless noted)

- [ ] **CI failure alerting** — `daily-meta.yml` runs with `continue-on-error` and no notification; add a step that opens/updates a GitHub issue (or pings) when `npm run meta`/`npm run sets` fail, so silent meta rot is impossible.
- [ ] **Cap 429 retry loops in the pipeline** (`scryfallGet`, `fetchAllSetCards` retry forever; a bad Scryfall day hangs CI).
- [ ] **Slim the feeds** — drop the `previews` array from sets.json when `cards` is present (client already prefers `cards`); write minified JSON (no 2-space indent) for `latest.json` + `sets.json` (~30% smaller).
- [ ] **JS unit tests** — vitest for the pure logic: `setPulse`, `versionCheck.isNewer`, `metaDiff`, `ranks`, `deckHelpers` (the Rust tracker already has a good suite).
- [ ] **macOS auto-update path** — either wire updater signing into the macOS CI (key as repo secret — owner decision) or add a mac-specific "new version — download dmg" flow via `version.json`.
- [ ] **Keyboard shortcuts** for page navigation (1–7).

## Explicit non-goals (do not add)

In-game overlay (ToS risk), price tracking, cloud sync, mobile/APK tracking promises, Alchemy/Historic, fabricated matchup/sideboard content.

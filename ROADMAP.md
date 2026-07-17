# Filthy Net Deck — Production Roadmap

**Source:** Full preproduction audit, 2026-07-17 (Claude Fable 5), starting from v0.14.0.
**How to use this file:** Work top to bottom. Check items off (`[x]`) as they ship; delete a milestone section once fully shipped. Any user-visible change ships via the **full AGENTS.md release checklist** (version bumps → signed installer → updater/latest.json → version.json ×2 → website links → OG image + meta with `?v=` cache-bust → push → tag → verify live). Source-only pushes are not releases.
**Handoff note:** If you are a new agent/model picking this up, read `handoff.md` and `AGENTS.md` first. Signing key: `%USERPROFILE%\.tauri\filthy-net-deck.key` (ask the owner for the passphrase — never commit it).

> **RELEASE PACING POLICY (owner directive, 2026-07-17):** Version bumps are now
> **batched into fewer, bigger releases**. 2026-07-17 shipped four versions in one
> day (0.14.1 → 0.17.0) — do not repeat that cadence. Finish ALL remaining
> milestone work on `main`-ready state and cut **one** release when the batch is
> complete, or when the owner asks for a release for a marketing beat. Data-only
> refreshes (`npm run meta` / `npm run sets`) still ship anytime without a version
> bump, and a genuine P0 hotfix may still ship solo.

---

## Immediate follow-ups

- [x] **Roll v0.17.0 macOS dmg** onto `website/downloads/` + fix mac labels.
- [x] **v0.18.0 signed Windows publish** — NSIS + `.sig`, `updater/latest.json`, version.json ×2, OG `?v=0.18.0`.
- [ ] **Roll v0.18.0 macOS dmg** after tag `v0.18.0` CI succeeds (site still serves 0.17.0 dmg until then).

## Milestones 1–4 — shipped (2026-07-17, versions 0.14.1 → 0.17.0)

Full detail lives in git history and `handoff.md`. Condensed:

- **v0.14.1** — P0 live-meta feed origin fix + polish; macOS catch-up.
- **v0.15.0** — Autostart / tray / window memory / trust fixes.
- **v0.16.0** — Matchup intel, streaks, CSV.
- **v0.17.0** — Set Radar / Decks / Events upgrade batch.

**Deferred (still open, low priority):**
- Marketing site real screenshot/GIF carousel — needs owner-supplied 1280×860 captures.

## Milestone 5 — v0.18.0 "Content engine" — implemented (pending signed publish)

- [x] **Daily archetype diff** — deck view compares today's mainboard to previous dated meta archive (`fetchDatedMeta` + `diffCardLists`).
- [x] **Shareable recap card** — My Stats → week recap PNG (`recapStats` + canvas `recapCard`).
- [x] **Match-end toast** — opt-in pref `notifyMatchEnd` + desktop notify on `tracker:match`.
- [x] **Meta-share timeline** — pipeline writes `meta/history.json`; Decks home charts series + movers.
- [x] **Personal vs. meta dashboard** — Decks home table joining pilot WR to ranked board.

## Milestone 6 — Infrastructure — implemented

- [x] **CI failure alerting** — `daily-meta.yml` opens/updates a `pipeline-failure` issue when meta/sets steps fail.
- [x] **Cap 429 retry loops** — Scryfall collection + set gallery capped at 8 retries with exponential backoff (`retryPolicy` + pipeline sources).
- [x] **Slim the feeds** — minified `latest.json` / `sets.json`; drop `previews` when `cards` present; history JSON compact.
- [x] **JS unit tests** — vitest for `archetypeDiff`, `metaHistory`, `recapStats`, `personalMeta`, `versionCheck`, `setPulse`, `deckHelpers`, `ranks`, `retryPolicy`.
- [x] **macOS auto-update path** — soft channel: Settings shows dmg download CTA when `version.json` / update URL ends in `.dmg` (full signed mac updater still needs repo secret owner decision).
- [x] **Keyboard shortcuts** — keys `1`–`7` jump main nav pages (skip when typing in inputs).

## Explicit non-goals (do not add)

In-game overlay (ToS risk), price tracking, cloud sync, mobile/APK tracking promises, Alchemy/Historic, fabricated matchup/sideboard content.

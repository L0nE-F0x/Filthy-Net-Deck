# Filthy Net Deck — Production Roadmap

**Source:** Full preproduction audit, 2026-07-17 (Claude Fable 5), starting from v0.14.0.
**How to use this file:** Work top to bottom. Check items off (`[x]`) as they ship; delete a milestone section once fully shipped. Any user-visible change ships via the **full AGENTS.md release checklist** (version bumps → signed installer → updater/latest.json → version.json ×2 → website links → OG image + meta with `?v=` cache-bust → push → tag → verify live). Source-only pushes are not releases.
**Handoff note:** If you are a new agent/model picking this up, read `handoff.md` and `AGENTS.md` first. Signing key: `%USERPROFILE%\.tauri\filthy-net-deck.key` (ask the owner for the passphrase — never commit it).

> **RELEASE PACING POLICY (owner directive, 2026-07-17):** Version bumps are now
> **batched into fewer, bigger releases**. 2026-07-17 shipped four versions in one
> day (0.14.1 → 0.17.0) — do not repeat that cadence. Finish ALL remaining
> milestone work (5 and 6 below, or whatever remains) on `main`-ready state and
> cut **one** release when the batch is complete, or when the owner asks for a
> release for a marketing beat. Data-only refreshes (`npm run meta` / `npm run
> sets`) still ship anytime without a version bump, and a genuine P0 hotfix may
> still ship solo.

---

## ⚠️ Immediate next task (source-only, no version bump)

**Roll the v0.17.0 macOS dmg.** Windows shipped v0.17.0; the macOS CI for tag `v0.17.0`
was still running when the previous session ended, so the site's mac download is
one version behind (v0.16.0). Steps:

1. Check `https://api.github.com/repos/L0nE-F0x/Filthy-Net-Deck/actions/runs` (filter
   `head_branch: "v0.17.0"`) — wait for `status: completed` / `conclusion: success`.
2. Pull the dmg: `https://github.com/L0nE-F0x/Filthy-Net-Deck/releases/download/v0.17.0/Filthy-Net-Deck-0.17.0-universal.dmg`
   into `website/downloads/`.
3. Update the two mac download links + `btn-meta` version labels in `website/index.html`
   (search for `0.16.0`).
4. Commit as `Roll v0.17.0 out to macOS.` (pattern from prior commits), push. **No version bump, no tag** — this just catches mac up to what Windows already has.

## Milestones 1–4 — shipped (2026-07-17, versions 0.14.1 → 0.17.0)

Full detail lives in git history and `handoff.md` §2. Condensed for context:

- **v0.14.1** — P0 hotfix: installed Windows apps were reading the meta snapshot baked into the installer instead of the live daily feed (never shipped fresh data to real users). Also: new-spoiler badges surviving background syncs, "Later" not sticking, no keyboard support on the Set Radar card viewer, Arena-eve notifications overstating estimated dates. macOS rolled forward from a stale 0.12.0.
- **v0.15.0** — Tray autostart ("Start with your PC"), window state memory, first-close tray explainer, one-time "what's new" banner, CSP hardening, Scryfall calls through the Tauri HTTP plugin for a real User-Agent.
- **v0.16.0** — Matchup Lab tag-aggregated winrate table, "you 4–0 vs Izzet Prowess" chips on the Decks board, My Stats today/streak/rolling-winrate tiles, CSV export, opponent search.
- **v0.17.0** — Set Radar arrow-key browsing + mana pips + honest "at release" legality + Arena-drop countdown badge, Decks rising/falling movement chips + multi-select color filters, deck view grouped by type with avg mana value + hover-art previews, Events filters + relative dates.

**Deferred from the original audit list (still open, low priority):**
- Marketing site real screenshot/GIF carousel — needs actual app screenshots from the owner's machine (tracker data visible, 1280×860) before it can be built; nothing to do until the owner supplies those.

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

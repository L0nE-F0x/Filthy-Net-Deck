# Filthy Net Deck — Production Roadmap

**Source:** Full preproduction audit, 2026-07-17 (Claude Fable 5), starting from v0.14.0.  
**How to use this file:** Work top to bottom. Check items off (`[x]`) as they ship. Any user-visible change ships via the **full AGENTS.md release checklist**. Source-only pushes are not releases.  
**Handoff:** Read `handoff.md` + `AGENTS.md` first. Signing: `%USERPROFILE%\.tauri\filthy-net-deck.key` + local password file `filthy-net-deck-key-password.txt` (or ask owner — never commit).

> **RELEASE PACING POLICY (owner directive, 2026-07-17):** Version bumps are **batched into fewer, bigger releases**. Do not repeat the four-versions-in-one-day cadence (0.14.1 → 0.17.0). Finish meaningful work on `main`, then cut **one** release when the owner asks or a full batch is ready. `npm run meta` / `npm run sets` anytime without a version bump. P0 hotfix may ship solo.

---

## Immediate follow-ups

Releases 0.17.0 → **0.23.0** shipped (Windows signed + marketing/OG). macOS dmg for
0.23 rolls after tag CI. Detail in git history + `handoff.md` §2.

- [x] **v0.23.0 signed Windows publish** (light mode, Arena // import fix, set trailers; NSIS + `.sig`, updater, version.json ×2, OG `?v=0.23.0`).
- [ ] **Roll v0.23.0 macOS dmg** onto `website/downloads/` + mac download labels (after tag CI).

**Open (low urgency):**

- [ ] **Owner:** verify in-app **Update & restart** 0.22→0.23 from an installed build.
- [ ] Marketing screenshot/GIF carousel — needs owner-supplied 1280×860 captures with real tracker data.
- [ ] Full macOS **signed** auto-update in CI (owner decision: store key as repo secret) — soft dmg CTA already works when download URL ends in `.dmg`.
- [ ] `whatsinstandard` v6 is deprecated — build warns; migrate `fetchStandardRotation` to v7 when it lands (also see `docs/MAINTENANCE.md` item 5).
- [ ] More set trailers in `set-trailers.json` as WotC posts them (Hobbit, Reality Fracture, etc.).

---

## Milestones 1–4 — shipped (2026-07-17, 0.14.1 → 0.17.0)

Condensed; detail in git history + `handoff.md`.

- **v0.14.1** — P0 live-meta feed origin fix + polish; mac catch-up.
- **v0.15.0** — Autostart / tray / window memory / trust.
- **v0.16.0** — Matchup intel, streaks, CSV.
- **v0.17.0** — Set Radar binder UX, deck movement chips, hover-art lists, Events filters.

---

## Milestone 5 — v0.18.0 "Content engine" — shipped

- [x] Daily archetype list diff (DeckView vs previous dated meta).
- [x] Shareable week recap PNG (My Stats).
- [x] Match-end toast (Settings opt-in).
- [x] Meta-share timeline + movers (Decks home; `meta/history.json`).
- [x] Personal vs. meta table (Decks home).

---

## Milestone 6 — Infrastructure — shipped (with 0.18.0)

- [x] CI failure alerting (`daily-meta.yml` opens/updates issue by **title only** — no missing label).
- [x] Cap Scryfall 429 retries (max 8, exponential backoff).
- [x] Slim feeds (minified latest/sets; drop redundant previews; history JSON).
- [x] Vitest suite for pure helpers (`npm test`).
- [x] macOS soft update CTA for `.dmg` URLs; full signed mac updater deferred.
- [x] Keyboard shortcuts `1`–`7` for main nav.

---

## Milestone 7 — Owner refinement batch — **shipped as v0.19.0** (2026-07-17)

Owner requests (Claude Fable 5 session after Grok handoff), released the same day at the
owner's call: signed Windows publish + updater, macOS dmg rolled, marketing + OG refreshed.
Owner verified the in-app 0.18→0.19 update.

- [x] **Fullscreen mode** — Settings → Display toggle + F11 anywhere (persists in `bbi.prefs.fullscreen`, applied at boot).
- [x] **Decks home overhaul** — "Deck to beat" art-backed hero with big stat tiles, top-8 grid right below, meta timeline + you-vs-meta demoted to a two-column row underneath, format switcher inline in the header.
- [x] **Sets → Format hub** — every Standard-legal set with rotation dates ("rotating next" highlighted), full Pioneer set pool, ban lists with card art for both formats. Data via pipeline `formats` section (Scryfall legalities + whatsinstandard rotation calendar); old feeds without it hide the hub.
- [x] **My Stats decklist** — deck detail now shows the full latest build (type groups, art thumbs, mana pips, mana curve, sideboard) with one-click **Copy decklist** in Arena import format; Your Arsenal card fans click through to the deck.

---

## Milestone 8 — v0.21.0 "Current events" — shipped (2026-07-18)

Batched release (owner directive: fewer, bigger). Theme: the app reacts to
real-world MTG events with minimal lag, and self-maintains.

- [x] **Pipeline: 4×/day set radar** — Scryfall-only fast lane
  (`sets-refresh.yml`, 00/12/18 UTC) beside the daily meta job; ship first-look
  panel spoilers (dropped the <5-card "stub" skip) and undated Scryfall set rows.
- [x] **B&R pulse** — diff feed ban lists vs a local snapshot; banner on Decks +
  opt-in desktop toast on a real Banned & Restricted update
  (`banPulse.ts`, `BanPulse.tsx`, Settings `notifyBanlist`).
- [x] **Rotation impact** — pipeline `formats.standard.rotation` (cards leaving
  Standard next); DeckView "loses N cards at rotation" panel + per-card markers;
  Sets format hub card count (`rotationImpact.ts`, `buildRotationImpact`).
- [x] **Climb polish** — win/loss streak chips + loss-streak note; season-vs-
  previous-season comparison (WR, peak, games) (`climbStats.ts`).
- [x] **Docs** — `docs/MAINTENANCE.md` (self-maintains vs. monthly checklist).

## Milestone 9 — v0.22.0 "Roadmap + card watch" — shipped (2026-07-18)

Owner-directed batch (Kimi). Theme: see further ahead, find cards faster.

- [x] **Future Standard** — roadmap-announced sets with no Scryfall row yet
  (Nauctis: The Sunken Realm 2027-02-05, Kamigawa: Titanbreach 2027-06-04,
  Zhalfir 2027-10-01, + the three 2027 Universes Beyond slots) render on the
  Sets page with dates, notes, and announcement source links. Curated in
  `pipeline/sources/future-sets.json` (every entry source-linked, nothing
  invented); the build auto-drops entries once Scryfall catalogs the set or an
  exact date passes. Feed `sets.json` → `futureSets`, version 1.2.0.
- [x] **Card watch / Ctrl+K palette** — `cardWatch.ts` indexes every meta
  decklist (both formats × both modes, main + side); Ctrl+K anywhere opens the
  palette: card search → which decks play it (copies, board, rank), deck jump,
  page nav. Topbar Ctrl-K hint button for discovery. 14 unit tests.
- [x] **Matchup Lab QoL** — tags + notes save on every keystroke (no more lost
  edits on opponent switch); helper dedupe (`winrateFavor` → `ranks.ts`,
  `currentStreak` → `climbStats.ts`); `personalMeta` fuzzy join now picks the
  longest, most specific archetype key instead of first-iteration.

## Explicit non-goals (do not add)

In-game overlay (ToS risk), price tracking, cloud sync, mobile/APK tracking promises, Alchemy/Historic, fabricated matchup/sideboard content.

---

## Milestone 10 — v0.23.0 "Polish + trailers" — shipped (2026-07-18)

Owner-directed batch (Grok 4.5). Theme: comfort, Arena reliability, set hype.

- [x] **Light / dark mode** — CSS token flip via `data-theme`, prefs `theme`, discreet
  top-bar pill + Settings Appearance section (`theme.ts`, `ThemeToggle.tsx`).
- [x] **Arena import // fix** — front-face only for DFC / adventure / room names so
  Arena accepts lists (`arenaCardName` client + pipeline; DeckView rebuilds on copy).
- [x] **Set trailers** — curated WotC YouTube ids (`set-trailers.json` + client
  fallback); sleek in-app player (youtube-nocookie); View trailer on set cards /
  Future Standard when known (Nauctis, Titanbreach at ship).

## Milestone 11 — v0.24.0 "Polish batch" — shipping (2026-07-18)

- [x] **Fullscreen topbar collision** — Exit fullscreen / Close to tray in the topbar action row.
- [x] **Search label** — topbar **Search** button (Ctrl+K still the shortcut).
- [x] **Recently live expands** — full current Standard pool on Sets (slim previews for older sets).
- [x] **Settings denser layout** — two-column grid + compact notification rows (uses empty right side).
- [x] **v0.24.0** full AGENTS.md release (Windows signed + marketing/OG; macOS roll after tag CI).

## In progress — nav + Format Hub standalone

- [x] **Nav reorder** — Decks · My Stats · Climb · Matchups · Sets · Events · Format Hub · Settings (keys 1–8).
- [x] **Format Hub page** — legality / rotation / bans promoted off Sets into its own nav item (`formats`).
- [ ] Ship in next version bump when owner asks (with marketing if user-visible).

## Suggested next product batch (ideas)

- **Rotation UI as the date nears** — deck-tile badges once rotation is within ~30–45 days.
- Performance / feed size — full galleries for recent sets still dominate `sets.json`; slim path helps older Standard.
- Screenshot-driven marketing carousel (when owner supplies 1280×860 captures).
- More curated set trailers as WotC posts them.
- Limited still backburner.

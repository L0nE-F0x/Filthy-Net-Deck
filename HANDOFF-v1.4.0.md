# Filthy Net Deck — v1.4.0 "Bells & Whistles" handoff

**Wrapped:** 2026-07-19 (pass 2) by **Kimi**. **Next agent:** **Grok 4.5 — #5 Sound + micro-interactions** (owner taste gate below), then the owner-gated release step.
**Read first:** `AGENTS.md` (release rules), this file, the v1.3.5 audit note in `handoff.md` (overlay invariants). Memory: `v1.4.0-bells-and-whistles`.

> **The batch:** finishing touches to take FND from fan project → production-grade companion the owner will promote hard (YouTube + X **@MBrewlab**). Ship as **ONE** v1.4.0 via the full AGENTS.md checklist. **Owner runs the signed build themselves** (has the passphrase — do not handle it in plaintext).

---

## Where things are — updated 2026-07-19 (Kimi, pass 2)

**Branch: `release/v1.4.0` (LOCAL, UNPUSHED).** `npx tsc --noEmit` clean · `npm test` = **120 green** · `npm run build` clean (0 chunk warnings) · `cargo check --lib` clean.

**#1–#4 are DONE and committed on this branch.** What remains: **#5** (sound — owner taste gate, assigned to Grok 4.5) → smoke-test on a real Windows build → **release step** (owner-gated).

⚠️ Working tree also has **unrelated owner marketing assets** (`website/assets/_gen_youtube.py` mods, `youtube-post.png`, untracked `youtube-community-*` / `app-screenshot-decks.png`) — **not part of this batch, do not commit or delete them with the code changes.**

⚠️ If you're in a fresh/cloud env, the branch may not exist yet — have the owner `git push -u origin release/v1.4.0` first, or work locally.

### Commits so far (newest last)
```
(pass 2)  feat(overlay) hardening (#2) + feat(a11y/empty-states) (#3, #4) — see git log
8a5ca5f  merge null-cache fix (fix/arena-meta-null-cache) into the batch
d1756ae  feat(share): deck share cards — decklist + WR + FND branding (#1)
8cc1eb9  feat(share): embed FND fox logo mark on the card header
af856f4  feat(share): Share deck-card control in My Stats deck detail (#1)
44efe0f  feat(overlay): sync in-game overlay to the chosen Planeswalker theme
```

---

## ✅ DONE (verified)

### #1 Share cards — the Untapped replacement
- **`src/services/deckShare.ts`** (+ `deckShare.test.ts`): `aggregateDeck(mainIds, sideIds, cards)` → grouped/quantified list (creatures/spells/lands, mana-color dots); `renderDeckSharePng(input)` → branded **1080×1350** PNG; `downloadDeckSharePng`. One `scope` param: `match | season | run | day | session | week | all`. Match scope adds a Victory/Defeat pill + opponent. Balanced 2-column layout, row height scales to fill. FND fox logo from `/app-icon.png` top-right.
- **`src/services/recapStats.ts`**: added `dayWindow`, `sessionWindow` (+ tests) for those scopes.
- **`src/pages/Stats.tsx`**: `ShareDeckButton` (scope `<select>`) wired into the **deck-detail action row**. Resolves full card meta (`resolveArenaCards(ids,{full:true})`) before render so grouping/colors are right.
- **Verified:** pure logic unit-tested; renderer visually confirmed in-browser. **NOT yet run in the installed app with real Arena data** — smoke-test the deck-detail Share end-to-end there.
- **Optional add still open:** match-card Share on **match-history rows** (`MatchHistory` in Stats.tsx) and/or the match-end toast — renderer already supports `scope:"match"` with `opponent`+`result`. Owner wants "match/season/run/day/session" — season/run/day/session/week/all are wired; **match is the one not yet surfaced in UI.**

### Overlay theme sync (owner's mid-session ask)
- **`src/index.css`** overlay block: added `--ov-accent: var(--color-gold-500)` / `--ov-accent-2: var(--color-azure-400)` on `.overlay-shell`, and converted the hardcoded gold/azure accents (top line, shell border, `is-ended` border, deck name, resize grip) to `color-mix(in srgb, var(--ov-accent) X%, transparent)`. Skins already retint `--color-gold-*/--color-azure-*`, so Chandra→ember, Teferi→azure, etc. carry into the HUD. Semantic colors (win/loss greens+reds, land green) deliberately left hardcoded.
- **`src/overlay/OverlayApp.tsx`**: the prefs `storage` handler now also calls `bootThemeFromStorage()` so switching skin in the app recolors an open overlay live.
- **Verified** across Chandra/Teferi in-browser (inject overlay markup + set `document.documentElement.dataset.skin`).

### Null-cache fix (owner's queued item) — merged
`src/services/arenaMeta.ts`: failed Scryfall lookups are a session-only negative cache (never persisted), so a transient offline hit retries next session instead of poisoning the card.

---

## ✅ DONE (pass 2 — Kimi, 2026-07-19, uncommitted)

### #2 Overlay hardening — done
1. **`MatchClock` extracted (Grok P1-1).** The 1 Hz `setInterval` + `now` state moved out of `OverlayApp` into a memoized `<MatchClock startedAt>` child (`src/overlay/OverlayApp.tsx` ~L329). Per-second tick now repaints only the clock span; groups/rows were already memoized.
2. **Reliable cross-webview prefs (Grok P1-2/P1-3).** New `pushOverlayPrefs()` in `src/services/overlay.ts` emits Tauri event `prefs:overlay`; called from `useAppStore` setters `setOverlayOpacity`, `setOverlayStartExpanded`, `setOverlayClickThrough`, `setTheme`, `setSkin`. `OverlayApp` listens (`listen("prefs:overlay")`) → opacity + `bootThemeFromStorage()` + `startExpandedRef` + click-through; the `storage` listener stays as fallback. **startExpanded** is refreshed into `startExpandedRef` live and applied **once per new match** (keyed on `matchId`, via new `setCompactMode`) — never mid-match, so a manual collapse survives Bo3 sideboarding.
3. **Click-through toggle.** New pref `overlayClickThrough` (default false) in `useAppStore` + Settings toggle; Rust command `overlay_set_click_through` (`src-tauri/src/overlay.rs`, registered in `lib.rs`) calls `set_ignore_cursor_events` on the overlay window; the overlay applies it on mount and on every prefs push. Passive HUD; Settings is the way back out.

**Invariants held:** no `set_focus`, Rust owns show/hide, dirty-only `tracker:live`, no backdrop-filter, local-only, ApexForge credit untouched.

### #3 A11y / reduced-motion — done
- Global `@media (prefers-reduced-motion: reduce)` block in `src/index.css` (after the `:focus-visible` rule) nukes animation/transition durations + delays everywhere (covers SplashScreen, BanPulse, SpoilerPulse, PlaneswalkerThemes, StatusBanners, skin/hover transitions). No `scroll-behavior: smooth` in CSS or JS to gate.
- `role="status"` on the in-app toasts (`DeckView.tsx`, `TrackedDecklist.tsx`); `aria-live="polite"` on the Stats insight-chips container.
- Keyboard pass: only one non-actionable `div onClick` in the app (CommandPalette backdrop stopPropagation; palette already has Escape + `role="dialog"`/`listbox`/`option` + focus restore). Global `:focus-visible` ring already existed.

### #4 Empty-state & first-run — done
- Climb, Matchups, Stats already shipped branded empties + `TrackerOnboarding`; FormatHub arsenal-at-risk hides gracefully (verified).
- **DeckView** "Your record" section now renders compact `TrackerOnboarding` (no health detail) when the desktop app has **zero tracked matches**, instead of the tag-your-opponents copy that presupposed matches. With matches but no tag vs the archetype → original copy. Browser/dev unchanged.

---

## 🔜 TO DO — what remains

### ⏸️ #5 Sound + micro-interactions — GET OWNER'S TASTE FIRST
No audio anywhere today. Owner: **"do sound well, bad sound ruins an app."** Constraints: **opt-in, OFF by default**, Settings toggle, **not in the overlay**. Bring 2–3 candidate cue sets to the owner *before* committing. Micro-interactions: stat count-ups, rank-up moment, toast slide-ins.

### Smoke-test on a real Windows build (before release)
- Overlay: opacity slider + skin switch update the **open** overlay live via `prefs:overlay` (storage event is only the fallback now).
- Overlay: toggle **Start expanded** → next match opens expanded/collapsed accordingly; manual collapse mid-match survives between Bo3 games.
- Overlay: **Click-through** makes the HUD passive; Settings toggle brings it back.
- Overlay: match clock still ticks (now an isolated `MatchClock`).
- Deck share card (#1) end-to-end from My Stats deck detail with real Arena data (still open from pass 1).

---

## How to verify without the Tauri runtime
- Dev server: `npm run dev` (vite, port 1420).
- `deckShare` is runtime-self-contained (type-only import of `ArenaCardInfo`) → in the browser console `await import('/src/services/deckShare.ts?t='+Date.now())`, build mock data, render to canvas, screenshot. **Editing a dynamically-imported module triggers a full page reload** (not HMR) — re-inject after.
- Overlay theme: overlay component classes are global CSS → inject overlay markup into the page + set `document.documentElement.dataset.skin` → screenshot. Overlay-**with-data** can't be driven in plain browser (needs Tauri tracker events) — smoke-test the live HUD in the installed build.
- Always finish with `npx tsc --noEmit` + `npm test`.

## Release — LAST step, owner-gated
Ship ONE **v1.4.0** via AGENTS.md: bump `package.json`, `src/version.ts` (+ `WHATS_NEW`), `src-tauri/{Cargo.toml,tauri.conf.json}` (+ Cargo.lock); **owner runs signed `npm run tauri:build`**; copy `.exe`+`.sig` to `website/downloads/`; `website/updater/latest.json` (version+signature+url); `website/version.json` + `public/version.json`; `website/index.html` versions + OG (regen `website/assets/_gen_og.py`, `?v=1.4.0` cache-bust); push `main`; tag `v1.4.0` (macOS dmg CI). Update `ROADMAP.md` + `handoff.md`.

## Housekeeping
- Branch is **unpushed** — flag above.
- Untracked `goal/plan.md` = stale planning doc; ignore.
- A vite dev server may still be running from this session; start your own.
- **Security note:** the signing passphrase was pasted in this session's chat — treat it as exposed. The encrypted `.key` is still required and stays local, but rotating the signing key is prudent if the transcript is shared. (Not stored anywhere by me.)

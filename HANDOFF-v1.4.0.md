# Filthy Net Deck — v1.4.0 "Bells & Whistles" handoff

**Wrapped:** 2026-07-19 by **Claude Code**. **Next agent:** Kimi K3 / Grok 4.5 — continue **#2 → #4**.
**Read first:** `AGENTS.md` (release rules), this file, the v1.3.5 audit note in `handoff.md` (overlay invariants). Memory: `v1.4.0-bells-and-whistles`.

> **The batch:** finishing touches to take FND from fan project → production-grade companion the owner will promote hard (YouTube + X **@MBrewlab**). Ship as **ONE** v1.4.0 via the full AGENTS.md checklist. **Owner runs the signed build themselves** (has the passphrase — do not handle it in plaintext).

---

## Where things are

**Branch: `release/v1.4.0` (LOCAL, UNPUSHED).** `npx tsc --noEmit` clean · `npm test` = **120 green**.

⚠️ If you're in a fresh/cloud env, the branch may not exist yet — have the owner `git push -u origin release/v1.4.0` first, or work locally.

### Commits so far (newest last)
```
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

## 🔜 TO DO — #2 → #4

### #2 Overlay hardening (low-taste, do first)
1. **Extract `MatchClock` (Grok P1-1).** OverlayApp re-renders every second while playing because `now`/`setNow` live in `OverlayApp` (search `setNow`, `const playing`, the `useInterval`-style effect ~L461, and `formatClock(live.startedAt, now)` ~L700). Move the 1 Hz `setInterval`+`now` into a tiny `<MatchClock startedAt={live.startedAt} />` child that renders `formatClock`. Delete `now`/`setNow` + the clock effect from OverlayApp. Groups/rows are already memoized, so this removes the last per-second re-render.
2. **Reliable cross-webview prefs (Grok P1-2/P1-3).** Opacity + skin currently propagate via the `window` `storage` event, which may not fire across WebView2 windows on all setups; `startExpanded` only reads at mount. Add a Tauri event as the reliable path: emit `prefs:overlay` from the main webview when prefs change (`useAppStore` setters: `setOverlayOpacity`, `setOverlayStartExpanded`, `setSkin`, `setTheme`) via `import { emit } from "@tauri-apps/api/event"`; in `OverlayApp` `listen("prefs:overlay")` → `setOpacity(readOverlayPrefs().opacity)` + `bootThemeFromStorage()` (+ re-read `startExpanded`). Keep the `storage` listener as fallback. The overlay is a **persistent** webview (Rust show/hides it), so mid-session changes must be pushed to it.
3. **Click-through toggle (optional).** New pref `overlayClickThrough` (default false) in `useAppStore` + Settings; Tauri command calling `window.set_ignore_cursor_events(bool)` on the `overlay` window; apply on show. Lets players make the HUD purely passive.

**Overlay invariants — MUST NOT regress** (from the v1.3.5 audit): never `set_focus` the overlay; Rust owns show/hide; dirty-only `tracker:live`; no `backdrop-filter`/heavy blur; local-only; ApexForge credit stays. Don't reintroduce per-frame re-renders.

### #3 A11y / reduced-motion
- **Zero `prefers-reduced-motion` today** (`grep prefers-reduced-motion src/index.css` = 0). Add a global `@media (prefers-reduced-motion: reduce)` block neutralizing transitions/animations. Motion lives in: `SplashScreen`, `BanPulse`, `SpoilerPulse`, `PlaneswalkerThemes`, `StatusBanners`, and skin/hover transitions.
- Add `:focus-visible` rings, `aria-live` on toasts/insight chips, quick keyboard-nav pass. Polish pass — CSS/markup, no unit tests expected.

### #4 Empty-state & first-run
- New users have no `Player.log` data (that's the "Desktop app only / First 5 minutes" onboarding you'll see on My Stats). Give every data-dependent page an intentional branded empty/loading state with honest CTAs ("play a ranked game and it shows here"). Reuse `TrackerOnboarding` + `SplashScreen` patterns. Pages to cover: DeckView, Climb, Matchups, and any other tracker-fed surface.

### ⏸️ #5 Sound + micro-interactions — GET OWNER'S TASTE FIRST
No audio anywhere today. Owner: **"do sound well, bad sound ruins an app."** Constraints: **opt-in, OFF by default**, Settings toggle, **not in the overlay**. Bring 2–3 candidate cue sets to the owner *before* committing. Micro-interactions: stat count-ups, rank-up moment, toast slide-ins.

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

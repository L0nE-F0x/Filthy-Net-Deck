# Filthy Net Deck — handoff

**Read this first.** Live top-of-todo across model/agent handoffs
(Claude ↔ Opus ↔ Grok ↔ Kimi).

**Live product version: v2.7.3** · repo `L0nE-F0x/Filthy-Net-Deck` · branch **`main`**.

**Session (2026-08-10, Claude):** regression audit of the v2.7.0–v2.7.3
weekend work — see **`docs/AUDIT-2026-08-10-v2.7.3.md`**. Nine issues found and
fixed, two of them P0 Windows deadlocks (one of which reintroduced a bug this
repo had already documented). **Source-only so far — not released.** Needs a
`tauri:dev` pass with Arena launching/quitting before a version bump.

**Session wrap (2026-08-09, Grok):** **v2.7.2 fully shipped** — desktop
performance pass (splash re-render loop, nav prefetch / no remount, tracker
no-op polls, leaner CardArt + Daily paint), signed Windows installer, macOS
universal dmg rolled from tag CI, site + OG + updater live. Working tree
clean vs `origin/main` at wrap.

---

## Current state (as of wrap)

| Item | Status |
|------|--------|
| App version | **v2.7.2** (`package.json`, `src/version.ts`, Cargo, `tauri.conf.json`, `Cargo.lock`) |
| Branch | `main` = `origin/main` |
| Key commits | `0a9e402` release v2.7.2 · `27b22cf` CI lint fix · `dc97589` macOS dmg roll |
| Tag | `v2.7.2` (points at release commit `0a9e402`; macOS CI green) |
| Windows | `website/downloads/Filthy-Net-Deck-Setup-2.7.2.exe` + `.sig` |
| macOS | `website/downloads/Filthy-Net-Deck-2.7.2-universal.dmg` (~20 MB) |
| Updater | `website/updater/latest.json` → **2.7.2** + signature |
| Soft channel | `website/version.json` + `public/version.json` → **2.7.2** |
| Site | Download buttons + OG `?v=2.7.2`, og-image regenerated |
| Live Netlify | version / updater / setup.exe / .sig / dmg all **200** @ 2.7.2 |
| Gates last green | **409** vitest · `tsc` clean · eslint clean · signed Windows build |
| `WHATS_NEW` | Snappier nav · fixed splash re-render loop · leaner home paint |

**Downloads pruned 2026-08-10:** `website/downloads/` now holds 2.7.3 + 2.7.2
only (current + one prior, per `docs/MAINTENANCE.md`). The 2.7.0/2.7.1
exe/sig/dmg were removed — recoverable from git history, and macOS dmgs are on
their GitHub Releases.

---

## What v2.7.2 shipped (this session)

### 1. Performance pass (no feature loss)

User-reported lag after v2.7.1: sluggish mouse/nav even between menu pages.

| Cause | Fix |
|-------|-----|
| Splash tip `setInterval` never stopped after dismiss → full app re-render every **900ms** | Stop interval when gone; early-return children once dismissed (`SplashScreen.tsx`) |
| `refreshTracker` 12s poll always replaced `trackerMatches` array | Fingerprint status + matches; skip `set` when unchanged (`useAppStore.ts`) |
| `key={page}` remounted `<main>` + pageIn animation every nav click | Drop key; swap active page child only (`App.tsx`) |
| Lazy page chunks cold on first click | Idle prefetch all pages after boot; hover/focus prefetch on nav |
| Heavy page mounts blocked click paint | `startTransition` on all page navigations in the store |
| CardArt loading state for every scryfallId thumb | Sync CDN URL when id present; `memo` art strip (`CardArt.tsx`) |
| Daily coach/timeline/personal panels blocked first paint | Defer secondary panels one idle tick; memo deck cards (`Daily.tsx`) |
| Command palette rebuilt card index while closed | Index only while open |
| CSS transform page-in + expensive deck-card paint | Opacity-only enter; `content-visibility` / contain on deck cards |

Pages memoized: Daily, Stats, Matchups, Climb, Settings.

### 2. CI follow-up

Release CI failed on pre-existing eslint: unused `_drop` in
`src/services/setsFeed.ts` slim-cache destructure. Fixed in `27b22cf` by using
the destructured `cards` for the offline previews sample.

### 3. Release train (complete)

Full `AGENTS.md` checklist for **2.7.2**:

- Signed NSIS with key `%USERPROFILE%\.tauri\filthy-net-deck.key` (password
  **local only** — never commit; cleared from shell after build).
- Tag `v2.7.2` → macOS workflow attached dmg → rolled in `dc97589`.
- Remote had set-radar commits; release rebased onto `origin/main` before push;
  tag force-updated once so macOS CI built the rebased tip (two tag builds
  both green — expected).

---

## Hard-won facts (do not re-derive)

### UI performance

- **Splash wrappers that keep state + interval after exit will re-render the
  entire app.** Prefer early-return unwrapped children once the splash is gone.
- Zustand `set({ trackerMatches: newArray })` on a no-op poll is expensive —
  any page subscribed to matches re-renders. Fingerprint before set.
- **Do not code-split the pages.** `React.lazy` renders its fallback once before
  resolving *even when the chunk is already cached*, so page-level splitting
  buys a permanent skeleton flash on each page's first visit. Prefetching does
  not suppress it, and `startTransition` cannot either. Measured 2026-08-10:
  static imports give 0–2 ms synchronous nav. The split worth keeping is
  `main.tsx`'s App-vs-overlay/toast/presence one.
- **Zustand updates cannot be deferred.** It reaches React through
  `useSyncExternalStore`, which React always renders synchronously —
  `startTransition(() => set(...))` is a no-op.
- `key={page}` on the content shell is usually wrong for “snappy nav” — it
  forces remount + CSS enter animation every click.

### WebView memory (still true from v2.7.1)

- Counting “WebView2 Manager (N)” in Task Manager: one browser process + GPU +
  utility + **one renderer per webview window**. Secondary labels
  `toast` / `overlay` / `presence` are intentional product surfaces, not
  leaks — but they must not outlive their need.
- **Never prewarm toast at boot** again for “first-toast latency” without
  measuring RAM cost.
- ⚠️ Creating WebView windows **inside** `run_on_main_thread` on Windows
  **deadlocks the event loop** (see toast.rs comments). Create off that hop;
  show/destroy on main when required. **This has now been reintroduced twice** —
  in `toast.rs` (2026-07-22) and in `arena.rs` (2026-08-09, found in the
  2026-08-10 audit). Anything that reaches `ensure_window` counts, including
  `presence::show`, `overlay::show` / `prewarm_if_enabled`, and
  `toast::show_toast`. That last one also fires from `notify_tray_hint_once`,
  which runs on the event loop — so it must be raised off-thread.

### Sets feed (still true from v2.7.1)

- Live/released sets: slim index + lazy `meta/sets/<code>.json`. Spoiling sets
  stay fat inline. Do not regress to full-gallery-in-index for every live set.
- Offline cache (`bbi.sets.lastGood`) strips live full galleries (same policy).

### Release / git

- `main` can move under you via scheduled set-radar commits. Rebase release
  onto `origin/main` before push; retarget the version tag if it was created
  pre-rebase (force-push tag — may fire two macOS builds).
- Signing: `TAURI_SIGNING_PRIVATE_KEY` (file contents) +
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; clear from the shell after.
- PowerShell mangles HEREDOC / JSON argv — use temp files or node scripts for
  multi-line commits and version bumps on Windows.

### Unchanged product rules (still true)

- See `docs/PLATFORM-STRATEGY.md` for growth phases (Phase 2 still gated).
- Install counting: signal is **`/updater/latest.json`**, not `/version.json`
  (`docs/INSTALL-COUNTING.md`).
- Dual Netlify config: root `netlify.toml` ≠ `website/netlify.toml` headers.
- Desktop only for Arena log tracking.

---

## OPEN / next (not blocking)

| Priority | Item | Notes |
|----------|------|--------|
| **Next** | Verify the two P0 Rust fixes in `tauri:dev` | Launch/quit Arena; first close-to-tray with no `tray-hint-shown` marker. Then cut **v2.7.4** |
| **Next** | Backend / crowd-meta (`docs/PLATFORM-STRATEGY.md` §1.1) | The plan the owner wants to resume |
| Measurement | Search Console (checkpoint ~2026-08-24) | Two weeks from the 08-10 check; one week elapsed so far |
| Optional | Upload Windows exe/sig to GitHub Release | macOS dmg is there; Windows is still site CDN + local archive |
| Disk | `cargo clean` — `src-tauri/target/` is 8.8 GB | Owner call; costs one full rebuild |
| Later | Further RAM | Main WebView + card images are the remaining floor |
| Later | macOS signed updater | Workflow explicitly disables updater artifacts; key is local-only |

**Open defects: none.** Nine found in the 2026-08-10 audit, all fixed in tree
and unreleased — see `docs/AUDIT-2026-08-10-v2.7.3.md`.

---

## Dev / release commands (reminder)

```bash
npm install
npm run tauri:dev
npm test
npm run sets          # rebuild slim sets index + galleries
npm run meta          # daily meta (no app bump required)
npm run tauri:build   # set TAURI_SIGNING_* for Windows updater artifacts
```

Release definition of done: root **`AGENTS.md`** checklist (binary +
downloads + updater + version.json + site + OG + Netlify live + tag/macOS).

---

## Docs touched this wrap

| File | Why |
|------|-----|
| `handoff.md` | This file — session state for next agent |

(No pipeline/docs process change in 2.7.2 — pure app perf + release.)

---

## Older context (still valid, not re-audited)

- Platform/growth plan: `docs/PLATFORM-STRATEGY.md`
- Install counting post-mortem: `docs/INSTALL-COUNTING.md`
- Long-form roadmap (both programs closed): `ROADMAP.md` / `100X-ROADMAP.md`
- Latest deep audit: `docs/AUDIT-2026-08-10-v2.7.3.md` (the 07-22 v2.5.0 audit
  it supersedes was removed; it is in git history)
- v2.7.1 memory / slim-sets detail: still accurate in git history of this file

# Filthy Net Deck — handoff

**Read this first.** Live top-of-todo across model/agent handoffs
(Claude ↔ Opus ↔ Grok ↔ Kimi).

**Live product version: v2.7.5** · repo `L0nE-F0x/Filthy-Net-Deck` · branch **`main`**.

**Session (2026-08-10, Claude) — part 2: the backend started.** Repo is now
**MIT licensed** and stays public (public repos get free unlimited Actions;
going private would meter the 4-hourly sets refresh and the 10×-billed macOS
builds). **Privacy was downgraded from a strategic pillar to an ordinary
constraint** by owner call — see `PLATFORM-STRATEGY.md` §1.2; do not reintroduce
privacy caveats into new designs. **Phase 4 (paid tiers) is deferred
indefinitely**; monetization is Ko-fi donations only. Supabase project is live
on **Pro**, and **Phase 2 slice 0 (opt-in health ping) is shipped in v2.7.5** —
table, Edge Function and client all verified end to end. Design:
`docs/BACKEND-PHASE-2.md`.

**Session (2026-08-10, Claude): v2.7.4 SHIPPED.** Regression audit of the
v2.7.0–v2.7.3 weekend work (built with Kimi K3 / Grok 4.5) — see
**`docs/AUDIT-2026-08-10-v2.7.3.md`**. Ten issues found and fixed; the P0 was a
Windows event-loop deadlock with **four** entry points (including any sync
`#[tauri::command]`), now guarded in code by `refuse_if_main_thread`. All paths
verified live in `tauri:dev` by the owner. Windows release train complete and
byte-verified live; macOS dmg rolls from tag CI.

**Session wrap (2026-08-09, Grok):** **v2.7.2 fully shipped** — desktop
performance pass (splash re-render loop, nav prefetch / no remount, tracker
no-op polls, leaner CardArt + Daily paint), signed Windows installer, macOS
universal dmg rolled from tag CI, site + OG + updater live. Working tree
clean vs `origin/main` at wrap.

---

## Current state (as of wrap)

| Item | Status |
|------|--------|
| App version | **v2.7.5** (`package.json`, `src/version.ts`, Cargo, `tauri.conf.json`, `Cargo.lock`) |
| Branch | `main` = `origin/main` |
| Key commits | `b3f857c` release v2.7.5 · `b87c3c3` health-ping backend fixes · `6d2acc5` slice 0 · `e109e21` release v2.7.4 |
| Tag | `v2.7.5` (macOS CI triggered on push) |
| Windows | `website/downloads/Filthy-Net-Deck-Setup-2.7.5.exe` + `.sig` — **live, 6,659,926 bytes** |
| macOS | dmg rolls from tag CI (follow-up commit) |
| Updater | `website/updater/latest.json` → **2.7.5**; published signature byte-matches the local `.sig` |
| Soft channel | `website/version.json` + `public/version.json` → **2.7.5** |
| Site | Download buttons + OG `?v=2.7.5`, og-image regenerated |
| Live Netlify | version + updater **200 @ 2.7.5** on both custom domain and netlify alias |
| Gates last green | **419** vitest · `tsc` · eslint · `cargo fmt`/`clippy` · **42** cargo tests |
| `WHATS_NEW` | Opt-in tracking watchdog in Settings → Data & privacy |
| Licence | **MIT** (`LICENSE`, added 2026-08-10). README carves out the brand, third-party meta data, and Scryfall/WotC card content |
| Backend | Supabase **Pro**, project `bzcryoocsapqtyhiwzbe`. `health_pings` table + `health-ping` Edge Function live and verified |

**Downloads pruned 2026-08-10:** `website/downloads/` holds 2.7.4 + 2.7.3 only
(current + one prior, per `docs/MAINTENANCE.md`). The 2.7.0/2.7.1/2.7.2
exe/sig/dmg were removed — recoverable from git history, and macOS dmgs are on
their GitHub Releases.

**Windows-release gotcha (cost a build cycle 2026-08-10):** do **not** bump
versions with PowerShell `Set-Content -Encoding utf8` — PS 5.1 writes a BOM and
`package.json` then fails to parse mid-build (`Unexpected token '﻿'`). A
`ReadAllText`/`WriteAllText` round-trip also mojibakes the em-dashes in
`Cargo.toml` / `tauri.conf.json`. Use the editor tool (or a UTF-8-no-BOM writer)
and diff-check for `â€"` before building.

**CSP gotcha (cost a second build cycle, same day):** `connect-src` in
`tauri.conf.json` is an **allowlist**, and the Vite dev server does not enforce
it — so a new backend host works perfectly in `tauri:dev` and is blocked for
every installed user. Any new origin must be added there. Two follow-ons:
Tauri reads the config at **build start**, so editing it mid-build silently
yields an installer with the old CSP; and you cannot verify by grepping the NSIS
installer (LZMA-compressed) — grep `target/release/filthy-net-deck.exe` instead,
with a known origin like `api.scryfall.com` as a positive control.

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
- ⚠️ **Never build a WebView window on the event-loop thread** on Windows — it
  deadlocks: the window is created, `build()` never returns, and every later
  main-thread task is wedged (tray Quit included). Reintroduced **four times**
  from four directions: `toast.rs` (2026-07-22), then `arena.rs`,
  `presence_set_enabled` and `toast_show` (2026-08-09, all found 2026-08-10).
  You reach the event loop from **three non-obvious places**:
  1. inside a `run_on_main_thread` closure;
  2. an `on_window_event` handler (this is how `notify_tray_hint_once` got there);
  3. **any synchronous `#[tauri::command]`** — Tauri 2 runs those on the main
     thread. This is the one that keeps catching people.

  There is now a guard: `refuse_if_main_thread()` in `lib.rs`, called at the top
  of every `ensure_window`. It refuses and names the offender instead of hanging,
  and `debug_assert!`s so `tauri:dev` fails loudly. **Call it from any new
  webview builder.** Create on a worker thread (Tauri hops internally); only
  show/destroy on main.

### Supabase / backend (new 2026-08-10)

- Project `bzcryoocsapqtyhiwzbe`, **Pro** tier. Client config in
  `src/services/cloud/config.ts` — the `sb_publishable_…` key is public by
  design; the secret key belongs only in Edge Function env, never the repo.
- **"Automatically expose new tables" is OFF** (deliberate). Every new table
  therefore starts with **no privileges for any Data API role — `service_role`
  included** — so each migration must `grant all on public.<table> to
  service_role;`. Symptom when forgotten: an Edge Function write fails with
  Postgres **42501** although its key is correct, which reads like a database
  fault rather than config.
- This project uses the **new API key system**, so
  `SUPABASE_SERVICE_ROLE_KEY` may not be injected into functions — read it with
  fallbacks and fail loudly. `createClient(url, undefined)` **does not throw**;
  it silently downgrades every write to `anon`.
- **RLS is row-level, not column-level.** A `select` policy exposes the whole
  row; use a view over a locked-down base table to publish a column subset.
- Never return raw Postgres messages from a public Edge Function — return the
  error *code* plus a stage label and log the rest. That split located the 42501
  on the very next request.

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
| **Next** | Backend / crowd-meta (`docs/PLATFORM-STRATEGY.md` §1.1) | The plan the owner wants to resume. §1.2 local-first-forever is a hard constraint |
| Tail | Roll the v2.7.4 macOS dmg into `website/downloads/` | Site already links it; 404s until the tag CI artifact is committed |
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

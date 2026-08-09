# Filthy Net Deck — handoff

**Read this first.** Live top-of-todo across model/agent handoffs
(Claude ↔ Opus ↔ Grok ↔ Kimi).

**Live product version: v2.7.1** · repo `L0nE-F0x/Filthy-Net-Deck` · branch **`main`**.

**Session wrap (2026-08-09, Grok):** **v2.7.1 fully shipped** — leaner Windows
memory (WebView lifecycle + code-splitting), slim sets radar with lazy
galleries, signed Windows installer, macOS universal dmg rolled from tag CI,
site + OG + updater live. Working tree clean vs `origin/main` at wrap.

---

## Current state (as of wrap)

| Item | Status |
|------|--------|
| App version | **v2.7.1** (`package.json`, `src/version.ts`, Cargo, `tauri.conf.json`, `Cargo.lock`) |
| Branch | `main` = `origin/main` |
| Key commits | `5e91ac5` release v2.7.1 · `4e756d1` macOS dmg roll |
| Tag | `v2.7.1` (points at release commit; macOS CI green) |
| Windows | `website/downloads/Filthy-Net-Deck-Setup-2.7.1.exe` + `.sig` |
| macOS | `website/downloads/Filthy-Net-Deck-2.7.1-universal.dmg` (~20 MB) |
| Updater | `website/updater/latest.json` → **2.7.1** + signature |
| Soft channel | `website/version.json` + `public/version.json` → **2.7.1** |
| Site | Download buttons + OG `?v=2.7.1`, og-image regenerated |
| Live Netlify | version / updater / setup.exe / .sig / dmg / slim `meta/sets.json` / `meta/sets/fdn.json` all **200** @ 2.7.1 |
| Gates last green | **409** vitest · `tsc` clean · release build signed |
| `WHATS_NEW` | Leaner memory · slim sets radar · code-splitting |

**Also still in tree (optional prune):** v2.7.0 exe/sig/dmg under
`website/downloads/`. Policy prefers current-only (see
`docs/GIT-HISTORY-BLOAT.md` / `docs/MAINTENANCE.md`); not blocking.

---

## What v2.7.1 shipped (this session)

### 1. Memory / WebView lifecycle (no feature loss)

Task Manager was showing ~400+ MB under WebView2 for Filthy Net Deck because
**each Tauri webview is a full Chromium renderer**, and secondary windows were
kept warm forever.

| Window | Before | After (v2.7.1) |
|--------|--------|----------------|
| **toast** | Prewarmed at boot; hide only | **No prewarm**; create on first alert; **`destroy` after linger** |
| **overlay** | Created on first match; hide only | Hide between matches (snappy next game); **`destroy` when Arena quits** or overlay disabled; **prewarm only while Arena is running** |
| **presence** | Show/hide with Arena | **`destroy` when Arena quits** or badge disabled |
| **main** | Always | Unchanged |

Rust modules: `src-tauri/src/{toast,overlay,presence,arena,lib}.rs`.
Arena process watcher hops create/destroy onto the **main thread** (Windows
WebView2 deadlock trap).

**Expected impact:** clearest RAM drop with **Arena closed** (one Filthy
WebView2 renderer, not 2–3). GPU process is Chromium tax and stays while any
window exists.

### 2. Frontend code-splitting

- `src/main.tsx` — `React.lazy` per route (`App` / `OverlayApp` / `ToastApp` /
  `PresenceApp`). Secondary webviews no longer parse the full main-app graph.
- `src/App.tsx` — page-level `lazy()` + `Suspense` (Daily, Stats, Sets, …).
- Build shape: entry ~198 KB gzip-friendly shell; toast chunk ~2 KB; pages
  load on demand.

### 3. Slim sets feed + lazy galleries

**Problem:** `sets.json` was ~4.6 MB almost entirely full `cards[]` for live
Standard-pool sets, held in network response + Zustand + localStorage.

**Shape now:**

| Path | Contents |
|------|----------|
| `website/meta/sets.json` (+ `public/meta/`) | **Slim index** (~0.5 MB). Full `cards[]` **inline only** for `spoiling` / `announced`. Live/released keep a short `previews[]` rail. |
| `website/meta/sets/<code>.json` (+ `public/meta/sets/`) | Full gallery per set; fetched when the user opens a gallery. |

**Code:**

- `pipeline/slim-sets-feed.mjs` + tests — pure split helpers
- `pipeline/build-sets.mjs` — writes index + gallery tree
- `src/services/setsFeed.ts` — `fetchSetGallery(code)` + slim offline cache
- `src/pages/Sets.tsx` — `SetGallery` loads full cards on open if missing

**Do not regress:** CI `sets-refresh` / `npm run sets` must keep writing both
the index **and** `meta/sets/*.json`. If a future agent “simplifies” back to
one fat JSON, RAM and cold-start cost return.

App offline cache (`bbi.sets.lastGood`) also strips live full galleries
(same policy). Network refresh restores full galleries via per-code files.

### 4. Small hygiene

- Arena card id cache soft-capped at 6 000 entries (`src/services/arenaCards.ts`).

### 5. Release train (complete)

Full `AGENTS.md` checklist for **2.7.1**:

- Signed NSIS with key `%USERPROFILE%\.tauri\filthy-net-deck.key` (password
  is **local only** — never commit; last used for this release was provided
  interactively by the owner).
- Tag `v2.7.1` → macOS workflow attached dmg to GitHub Release → rolled into
  `website/downloads/` in `4e756d1`.

---

## Hard-won facts (do not re-derive)

### WebView memory

- Counting “WebView2 Manager (N)” in Task Manager: one browser process + GPU +
  utility + **one renderer per webview window**. Secondary labels
  `toast` / `overlay` / `presence` are intentional product surfaces, not
  leaks — but they must not outlive their need.
- **Never prewarm toast at boot** again for “first-toast latency” without
  measuring RAM cost.
- Creating WebView windows **inside** `run_on_main_thread` on Windows can
  **deadlock** (see toast.rs comments). Create off that hop; show/destroy on
  main when required.
- Tauri 2.11 exposes wry’s `MemoryUsageLevel` poorly — lifecycle (destroy)
  is the practical win, not an undocumented low-memory API.

### Sets feed

- Full-gallery-in-index for every live set was a **v2.6-era** choice for
  offline gallery UX; **v2.7.1 reverts that for live/released only**, with
  lazy `meta/sets/<code>.json`. Spoiling sets stay fat inline (product focus).
- Offline transform of an existing fat feed (without re-scraping Scryfall):
  `splitSetsBundle` in `pipeline/slim-sets-feed.mjs`.
- On Windows, `git show … > file` can write **UTF-16**; prefer
  `execSync('git show …', { encoding: 'buffer' })` + UTF-8 parse when scripting.

### Release / git

- `main` can move under you via scheduled set-radar commits. Rebase release
  onto `origin/main` and **re-slim** if remote rewrote fat `sets.json`.
- Tag may fire **two** macOS builds if rewritten (force-push tag); both green
  is fine — use the release asset.
- Signing: `npx tauri signer sign <setup.exe>` with
  `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` envs;
  clear password from the shell after.

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
| Optional | Prune `website/downloads/*2.7.0*` | Keep current-only per hygiene docs |
| Optional | Upload Windows exe/sig to GitHub Release | macOS dmg is there; Windows is still dev-box-only archive |
| Measurement | Search Console / updater Observability | From older handoff — still the growth checkpoint, not a build |
| Later | Further RAM | Sets in-memory slim-on-open for live sets already; main WebView + images are the remaining floor |
| Later | macOS signed updater | Workflow explicitly disables updater artifacts; key is local-only |

**No open engineering defect from this session.** Ship is complete.

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
| `docs/DATA-AND-UPDATES.md` | Slim sets + lazy galleries (replaces “full gallery always” note) |
| `docs/MAINTENANCE.md` | Sets pipeline outputs + memory lifecycle note |
| `docs/GIT-HISTORY-BLOAT.md` | Current working-tree example → v2.7.1 |

---

## Older context (still valid, not re-audited)

- Platform/growth plan: `docs/PLATFORM-STRATEGY.md`
- Install counting post-mortem: `docs/INSTALL-COUNTING.md`
- Long-form roadmap: `ROADMAP.md` / `100X-ROADMAP.md`
- Prior release audit sample: `docs/AUDIT-2026-07-22-v2.5.0.md`

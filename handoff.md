# Filthy Net Deck - handoff

**Read this first.** Live top-of-todo across model/agent handoffs
(Claude / Opus / Grok / Kimi).

**Live product version: v2.7.5** - repo L0nE-F0x/Filthy-Net-Deck - branch **main**.

**Do not cut a version yet.** Owner asked to finish the Matchups + crowd path
fully, then release. App still markets **v2.7.5**.

---

## Resume here (2026-08-10 evening -> next morning)

### Session wrap (Grok, 2026-08-10)

Finished the **Matchup Lab -> Matchups** replacement that Claude started before
hitting the session limit. Service layer was already on main
(commit a2ba9b8 personalMatchups); this session shipped the **UI + wiring**.

| Done | Detail |
|------|--------|
| Matchups page rebuild | src/pages/Matchups.tsx - your record **vs archetype**, auto-inferred; no per-opponent list, no notes UI, no tag nudge |
| Service join | Uses personalRecords + mergeMatchups + readDelta from src/services/cloud/personalMatchups.ts |
| Manual tags | Still work as **override** via getOpponentNote -> tagFor (not required) |
| Match history deep link | Clicks go to archetype, not player (MatchHistory onArchetype -> openMatchupTag) |
| Call sites | Stats.tsx, DeckDetail.tsx, Daily/DeckView "you vs" chips use inference |
| Help / title / onboarding | Matchup Lab copy retired; first match completes Matchups onboarding step |
| Gates | **tsc clean, 475 vitest green** |

| Not done | Detail |
|----------|--------|
| Community rollup **fetch** | community is still an empty array in Matchups - UI shows "you only" / honest empty community copy |
| Match **upload** path | matchSync.ts has buildSharedMatch / chunk helpers; full opt-in upload + Settings toggle not finished as a user-visible loop |
| Wire upload -> rollup -> UI | Phase 2 slice 5-6 payoff; design in docs/BACKEND-PHASE-2.md |
| Version cut | **Do not release** until owner says the feature is finished |
| Live UI smoke | Owner has not click-tested the new Matchups page in tauri:dev this wrap |

### Exact next steps (pick up in order)

1. **Smoke the new Matchups page** in npm run tauri:dev with a real tracker history (identified vs unknown counts, season/deck filters, deep link from Stats match history and Daily chips).
2. **Crowd half:** fetch matchup_rollup (or whatever the migration exposes) into Matchups; pass usable rows through matchupsFor / orient / usable (src/services/cloud/crowdMeta.ts) then mergeMatchups. Subject orientation: community rates are for a *subject* archetype facing each opponent - decide subject filter (your deck / most-played) when joining.
3. **Upload path:** finish opt-in match sharing (Settings + allowlist payload from matchSync.ts + Supabase insert). Never upload opponentName / opponentSeen.
4. **Migration / RLS grants** if any tables still lack service_role grants (see hard-won Supabase notes below).
5. Only then: full AGENTS.md release train for **v2.7.6** (or next) - version bump, signed Windows, updater, site, OG, Netlify.

### Owner product calls (locked)

- App free without login; **opt-in free account** unlocks more (crowd meta, etc.). No paid tier for now (Ko-fi only).
- Privacy is an ordinary constraint, not a marketing pillar - still never upload other players' identity.
- Matchup Lab per-opponent + notes UX is **dead**; tags optional override only.
- Supabase **Pro**, project bzcryoocsapqtyhiwzbe. Stick with Supabase (Firebase rejected).

### Key files for Matchups / crowd

| File | Role |
|------|------|
| src/pages/Matchups.tsx | New archetype-centric page |
| src/services/cloud/personalMatchups.ts | archetypeForMatch, personalRecords, mergeMatchups, readDelta, recordForArchetypeName |
| src/services/cloud/crowdMeta.ts | Wilson intervals, matchupsFor, MIN_GAMES = 30 |
| src/services/cloud/matchSync.ts | Shared match allowlist builder (upload not fully wired) |
| src/services/cloud/archetypeSlug.ts | Canonical slug join key |
| src/components/stats/MatchHistory.tsx | onArchetype deep link |
| docs/BACKEND-PHASE-2.md | Schema + slice plan |
| docs/PLATFORM-STRATEGY.md | Growth phases |

### Prior session notes still true

- **v2.7.5 shipped** (health ping, Windows installer, updater, site). MIT license.
- Phase 1 Search Console gate waived by owner 2026-08-10.
- Event-loop / WebView deadlock: always call refuse_if_main_thread on new webview builders.
- Do not PowerShell-BOM version files; check CSP connect-src when adding Supabase hosts to production builds.

---

## Current state (as of this wrap)

| Item | Status |
|------|--------|
| App version | **v2.7.5** live; **no bump yet** for Matchups UI |
| Branch | main (Matchups UI + this handoff committed together) |
| Matchups UI | Rebuilt; personal half works; community empty |
| Backend | Supabase Pro live; health ping shipped; core schema / match sharing code present - see recent feat(cloud) commits |
| Gates last green | **475** vitest, tsc clean |
| Licence | MIT |
| Monetization | Ko-fi only; Phase 4 paid deferred |

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

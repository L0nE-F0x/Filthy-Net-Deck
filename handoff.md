# Filthy Net Deck — handoff

**Read this first.** Live top-of-todo across model/agent handoffs
(Claude / Opus / Grok / Kimi).

**Live product version: v2.8.2** · repo `L0nE-F0x/Filthy-Net-Deck` · branch **main**
**In progress: v3.0.0** — the polish release, aimed at a public push to the
owner's YouTube + X audience.

---

# ▶ START HERE — the v3.0.0 program

Owner's brief (2026-08-12): *"refining, debugging, perfecting performance and
polishing — a PERFECT v3.0.0 I can confidently share around."*

Scope chosen by the owner: **full regression audit + a deliberate polish
workstream**, email sign-in hidden, historical docs deleted outright.

## Done so far

| # | Item | Notes |
|---|------|-------|
| ✅ | **False "nothing is uploaded" claims fixed** | README + 3 site strings. Had been wrong since v2.7.5 — see the post-mortem in `docs/PLATFORM-STRATEGY.md` §1.2 rule 4 |
| ✅ | **`website/privacy.html`** | Both allowlists field by field; linked from the site footer and Settings → Data & privacy. In the sitemap via `build-meta-site.mjs` |
| ✅ | **In-app copy sweep** | Three share-card kickers, `StatusPanel`, the Tracker-health blurb, and a genuinely wrong consent line ("the one optional exception" — there were two, and the bigger one was *above* it) |
| ✅ | **Email sign-in hidden** | `EMAIL_SIGN_IN_ENABLED = false` in `src/services/cloud/config.ts`. Code path intact |
| ✅ | **Doc cleanup** | `ROADMAP.md`, `100X-ROADMAP.md`, `docs/AUDIT-2026-08-10-v2.7.3.md` deleted (git history keeps them). Binding non-goals + cloud rules moved into `AGENTS.md` |

## Still to do

| # | Item | Notes |
|---|------|-------|
| ⬜ | **Full regression audit v2.7.3 → v2.8.2** | Nothing since the v2.7.3 audit has been adversarially reviewed — that is the entire backend, accounts, profiles, friends, deck sync, public decks, and the inference rewrite. Produce `docs/AUDIT-<date>-v3.0.0.md` |
| ⬜ | **Performance pass** | Cold start, RAM across the four webviews, fresh-profile / zero-match first run, on a production build |
| ⬜ | **UI/UX polish** | Empty states, first-run with zero matches, consistency across the pages added during the v2.7–2.8 backend push |
| ⬜ | **Launch readiness** | What a 500-signup day does to Supabase quotas; verify §4 anti-abuse is actually implemented; build the status page (`PLATFORM-STRATEGY.md` §2.7 — still the gap) |
| ⬜ | **Roll the macOS dmg** | ⚠️ **v2.8.2's dmg is on the GitHub Release but was never copied into `website/downloads/`.** `index.html` lines ~114 and ~529 still link the **2.8.1** dmg, so macOS visitors are being served a version behind *right now* |
| ⬜ | **v3.0.0 release train** | Full `AGENTS.md` checklist |

## Known-open, not blocking v3.0.0

- **Phase 3 (crowd meta) is gated on population, not code.** Its machinery
  shipped inside Phase 2 slices 5/6. Cells stay empty until enough opted-in
  users exist. Building more there will not fill them; users will.
- **Email OTP needs custom SMTP** before it can be un-hidden — *and* tests; it
  has none, unlike the OAuth path.
- **§2.6 legal check** gates Phase 4 only, deferred with it.
- Disk: `src-tauri/target/` ~9 GB, `.git` ~1.6 GB / 490 MB packed
  (`docs/GIT-HISTORY-BLOAT.md` — **never from CI or an agent**).

---

## Current state

| Item | Status |
|------|--------|
| App version | **v2.8.2** live on Windows; **macOS site link is stale at 2.8.1** (see above) |
| Branch | `main`, v3.0.0 work in progress |
| Gates last green | **547** vitest / 78 files · tsc · eslint · `cargo fmt`/`clippy` · **48** cargo tests (2026-08-12) |
| Licence | MIT (`LICENSE`); README carves out brand, third-party meta data, Scryfall/WotC content |
| Monetization | Ko-fi only; Phase 4 paid tier deferred indefinitely |
| Supabase | Project `bzcryoocsapqtyhiwzbe`, **Pro**. **Seven** migrations run: health_pings, core schema, public profiles, display-name privacy, decks, public decks, friends |
| Auth | Google **and** Discord enabled + verified live. **Email OTP built but hidden** behind `EMAIL_SIGN_IN_ENABLED` |
| Cron | `fnd-rollup` scheduled hourly (job id 1) — without it `matchup_rollup` never fills |
| Owner's profile | `filthy-net-deck.com/u/l0ne-f0x` — public, 371+ matches uploaded and aggregating |

### Verified live vs merely built

- **Verified against production:** Google sign-in (system browser → Supabase →
  `callback.html` → `fnd://` deep link → app), signup trigger creating the
  profile row, match upload (371 rows), profile page render + OG tags + 404 +
  handle sanitisation, health ping, Matchups crowd orientation/suppression.
- **Built, never exercised for real:** cloud deck sync end-to-end (schema is
  live; no client has written a deck row yet), Discord sign-in (configured,
  unused), email OTP sign-in (**now hidden**), community matchup *cells* (need
  30+ shared games from accounts with 25+ matches and 7+ days — expect empty for
  a while **by design**, that is the honesty discipline, not a fault).

---

## Key files

| File | Role |
|------|------|
| `src/services/cloud/config.ts` | Supabase URL + publishable key; `EMAIL_SIGN_IN_ENABLED` |
| `src/services/cloud/sync.ts` | isCloudEnabled/setCloudEnabled, upload, fetchRollup, handle + display-name |
| `src/services/cloud/syncRunner.ts` | Pulls live state + inference, calls the upload. The only trigger point |
| `src/services/cloud/matchSync.ts` | Shared-match **allowlist** builder — never serialise `TrackedMatch` |
| `src/services/cloud/healthPing.ts` | Slice 0 payload; Settings consent copy is generated from the same object so it cannot drift |
| `src/services/cloud/crowdMeta.ts` | Wilson intervals, matchupsFor, `MIN_GAMES = 30` |
| `src/services/cloud/personalMatchups.ts` | archetypeForMatch, personalRecords, mergeMatchups, readDelta |
| `src/services/cloud/friends.ts` | Phase 5 — friend codes, seasonal race |
| `src/services/cloud/deckSync.ts` | Slice 7 — `deck_hash` upsert, fingerprint instead of a high-water mark |
| `src/services/cloud/auth.ts` | OAuth (system browser + `fnd://`), email OTP, session |
| `src/services/cloud/archetypeSlug.ts` | Canonical slug join key (duplicated in the profile function) |
| `src/services/opponentArchetype.ts` | Inference. `observedColorsFromSeenCards` is where the basic-land fix landed |
| `src/services/site.ts` | `SITE_*`, `DONATE_URL`, `PRIVACY_URL` — empty string hides an affordance everywhere |
| `src-tauri/src/deeplink.rs` | `fnd://` — handles BOTH cold start and the single-instance argv route |
| `netlify/functions/profile.mts` | Server-rendered `/u/<handle>` (config.path routing) |
| `pipeline/build-meta-site.mjs` | The `/meta-web/` corpus + sitemap. Static pages are hardcoded there, not in `paths` |
| `website/privacy.html` | The published field allowlist |
| `supabase/migrations/` | 7 migrations, all run on the live DB |

---

## Hard-won facts (do not re-derive)

### Product rules now live in `AGENTS.md`

Cloud rules, non-goals and the deferred list moved there 2026-08-12 so they sit
with the release checklist rather than in a status file.

### Inference

- **Lands corroborate but never carry.** A four-colour pile plays every dual in
  the format, so land overlap alone matched whatever anyone put on the table.
  An unseen colour costs, scaled by how much of the deck has been seen, and is
  disqualifying once the sample is real unless three cards no other list plays
  say otherwise.
- **Arena basic-land grpIds are not stable identities.** A game object Arena
  described as `SuperType_Basic` / `SubType_Swamp` carried grpId **87457**, which
  resolves through the card API to **Island**. Read Arena's own `subtypes` off
  the game object; a basic resolved *by id* is only soft evidence.
- **Two harnesses exist — rebuild them before touching the engine.** A held-out
  synthetic benchmark over the whole field, and a replay over real tracked
  history. Nobody could previously tell whether an inference change helped.
  Baseline (owner's 322 real matches): wrong-colour reads 25.8% → 5.9%, gave a
  read at all 95.3% → 92.9%.

```
cd src-tauri
FND_REPLAY_LOG=<Player.log> FND_REPLAY_OPP='*' cargo test replay_real_log -- --nocapture --ignored
```

### UI performance

- **Splash wrappers that keep state + interval after exit re-render the entire
  app.** Prefer early-return unwrapped children once the splash is gone.
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
- `key={page}` on the content shell is usually wrong for "snappy nav" — it
  forces remount + CSS enter animation every click.

### WebView memory

- Counting "WebView2 Manager (N)" in Task Manager: one browser process + GPU +
  utility + **one renderer per webview window**. Secondary labels
  `toast` / `overlay` / `presence` are intentional product surfaces, not
  leaks — but they must not outlive their need.
- **Never prewarm toast at boot** again for "first-toast latency" without
  measuring RAM cost.
- ⚠️ **Never build a WebView window on the event-loop thread** on Windows — it
  deadlocks: the window is created, `build()` never returns, and every later
  main-thread task is wedged (tray Quit included). Reintroduced **four times**
  from four directions. You reach the event loop from **three non-obvious
  places**:
  1. inside a `run_on_main_thread` closure;
  2. an `on_window_event` handler;
  3. **any synchronous `#[tauri::command]`** — Tauri 2 runs those on the main
     thread. This is the one that keeps catching people.

  There is a guard: `refuse_if_main_thread()` in `lib.rs`, called at the top of
  every `ensure_window`. It refuses and names the offender instead of hanging,
  and `debug_assert!`s so `tauri:dev` fails loudly. **Call it from any new
  webview builder.** Create on a worker thread; only show/destroy on main.
- `on_window_event` is **global across all four webviews** — scope every arm by
  `window.label()`. An unscoped `prevent_close` once swallowed tray Quit.

### Supabase / backend

- **"Automatically expose new tables" is OFF** (deliberate). Every new table
  starts with **no privileges for any Data API role — `service_role` included**
  — so each migration must `grant all on public.<table> to service_role;`.
  Symptom when forgotten: an Edge Function write fails with Postgres **42501**
  although its key is correct, which reads like a database fault rather than
  config.
- This project uses the **new API key system**, so `SUPABASE_SERVICE_ROLE_KEY`
  may not be injected into functions — read it with fallbacks and fail loudly.
  `createClient(url, undefined)` **does not throw**; it silently downgrades
  every write to `anon`.
- **RLS is row-level, not column-level.** A `select` policy exposes the whole
  row; use a view over a locked-down base table to publish a column subset.
  (This is why `public_profiles` is a view, and why publishing decks needed one.)
- Never return raw Postgres messages from a public Edge Function — return the
  error *code* plus a stage label and log the rest.
- **Subject orientation is load-bearing on Matchups.** Community rows are
  "A vs B", so a field rate is only comparable to yours when both describe the
  same deck facing the same opponent. `subjectArchetype()` requires a 60%
  majority recognised deck; no clear subject means **no comparison is offered**.
  Do not "fix" that with a field average — it is not comparable.
- The public deck page prints deck, format, size and last played — **not the
  list**: `main` is Arena card ids and there is no id→name map on the server.
  If card names on public decks are wanted, ship an id→name map first.

### Sets feed

- Live/released sets: slim index + lazy `meta/sets/<code>.json`. Spoiling sets
  stay fat inline. Do not regress to full-gallery-in-index for every live set.
- Offline cache (`bbi.sets.lastGood`) strips live full galleries (same policy),
  with the bundled copy as an offline floor.

### CI

- **Stage directories, not file lists.** `sets-refresh.yml` hand-listed two
  files to stage; v2.7.1 added per-set lazy galleries writing ~19 more, they
  stayed unstaged, the following `git pull --rebase` refused, and the job exited
  **128 every 4 hours for two days** — with the *build step still reporting
  success*. The set radar was frozen the whole time.
- Nothing with a dot in its basename goes in `netlify/functions/` — it is read
  as a function name and a dot is illegal, failing every deploy.

### Release / git

- `main` can move under you via scheduled set-radar commits. Rebase release onto
  `origin/main` before push; retarget the version tag if it was created
  pre-rebase.
- Signing: `TAURI_SIGNING_PRIVATE_KEY` (file contents) +
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; clear from the shell after. Key id
  **67FCA9900F523D49** — check it against the pubkey in `tauri.conf.json` before
  publishing, because a sig from the abandoned repo-root key looks fine and
  breaks auto-update.
- PowerShell mangles HEREDOC / JSON argv — use temp files or node scripts for
  multi-line commits and version bumps on Windows.
- Install counting: the signal is **`/updater/latest.json`**, not
  `/version.json` (`docs/INSTALL-COUNTING.md`). **Never put a function in front
  of `/updater/latest.json`** — it drives the signed auto-update.
- Dual Netlify config: root `netlify.toml` governs build + functions;
  `website/netlify.toml` governs **headers and redirects**. A redirect in the
  root file silently does nothing.
- Test feed/origin changes in an **installed** build — prod origin is
  `tauri.localhost` and `tauri:dev` does not enforce the CSP.

### MSIX / reading app data

- My reads of `%APPDATA%` can be a frozen copy-on-write snapshot. Verify via
  `\\localhost\c$` or the in-app diagnostic before concluding a persistence bug.

---

## Background queue (nothing here blocks v3.0.0)

| Priority | Item | Notes |
|----------|------|--------|
| Defect | Tracker persistence — root cause | Data loss FIXED (reconcile pass, 2026-08-11). Why appends stalled is still unknown; `persistRepairs` in the next diagnostic is the trail |
| Measurement | Search Console checkpoint ~2026-08-24 | Baseline 2026-08-11: 3 clicks, 32 impressions, position 11.2 |
| Product | Email OTP needs custom SMTP **and tests** | Hidden for now |
| Product | Wildcard craft-cost feature | Buildable locally, never built — `PLATFORM-STRATEGY.md` §2.4 |
| Optional | Upload Windows exe/sig to GitHub Releases | macOS dmgs are there; Windows lives on the site CDN + local archive only |
| Disk | `src-tauri/target/` regrows to ~9 GB | `cargo clean` reclaims it at the cost of one full rebuild |
| Later | macOS signed updater | Workflow disables updater artifacts; key is local-only |
| Later | `.git` is ~1.6 GB | Needs the coordinated filter-repo in `docs/GIT-HISTORY-BLOAT.md`. **Never from CI or an agent** |

---

## Dev / release commands

```bash
npm install
npm run tauri:dev
npm test              # 547 vitest across 78 files
npm run sets          # rebuild slim sets index + galleries
npm run meta          # daily meta (no app bump required)
npm run meta:site     # regenerate /meta-web/ + sitemap
npm run tauri:build   # set TAURI_SIGNING_* for Windows updater artifacts
```

Release definition of done: root **`AGENTS.md`** checklist (binary + downloads +
updater + version.json + site + OG + Netlify live + tag/macOS).

---

## Docs map

| File | Role |
|------|------|
| `handoff.md` | **This file** — live session state |
| `AGENTS.md` | Binding project rules, release checklist, cloud rules, non-goals |
| `docs/PLATFORM-STRATEGY.md` | Growth phases — all buildable ones now shipped; kept for the reasoning |
| `docs/BACKEND-PHASE-2.md` | The backend as designed *and as built* |
| `docs/MAINTENANCE.md` | What self-maintains vs. the monthly hands-on checklist |
| `docs/DATA-AND-UPDATES.md` | Pipeline sources + updater mechanics |
| `docs/INSTALL-COUNTING.md` | Post-mortem: right machinery, wrong endpoint |
| `docs/GIT-HISTORY-BLOAT.md` | The optional history rewrite, and why not to automate it |

Removed 2026-08-12 as shipped history (recover from git if ever needed):
`ROADMAP.md`, `100X-ROADMAP.md`, `docs/AUDIT-2026-08-10-v2.7.3.md`,
and earlier `docs/PAGE-10X.md` / `docs/AUDIT-2026-07-22-v2.5.0.md`.

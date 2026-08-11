# Filthy Net Deck - handoff

**Read this first.** Live top-of-todo across model/agent handoffs
(Claude / Opus / Grok / Kimi).

**Live product version: v2.8.1** - repo L0nE-F0x/Filthy-Net-Deck - branch **main**.

**Phase 2 is complete — all 8 slices, all shipped.** Optional free account
(Google / Discord / email code), opt-in match sharing, community matchup rates
joined to your own record, public profile pages at `/u/<handle>`, and cloud
deck sync. The `decks` migration was run on the live DB by the owner on
2026-08-11 and v2.8.0 shipped the same evening.

---

# ▶ START HERE — next session, in this order

## 1. Confirm v2.8.1 lands on a real client

Everything server-side is verified live. The client half cannot be checked from
a dev machine and is the only thing outstanding:

- **You stay signed in.** v2.8.1's whole point. Close and reopen the app: it
  should still say "Signed in as …" without a fresh login.
- **In-app Check for updates offers "Update & restart"**, not just a browser
  download. This is the primary update path.
- **Deck backup actually writes.** With sharing on, play a match; Settings
  should then say "N lists saved". If it stays empty, suspect the Supabase
  `decks` grants (42501) before the client.
- **`persistRepairs` in a fresh diagnostic export.** Non-zero means the
  reconcile pass is doing real work every session — the *append* path is still
  broken and the root cause is still out there. Zero means it is healthy and
  the 22 July stall was situational.

### The auth bug, for the record (fixed in v2.8.1)

Signing in again on every launch *and* every webview reload was never a token
problem. The session was always written to `auth.json` — a valid
`sb-…-auth-token` with a live refresh token was sitting there the whole time.
Nothing ever read it back: the store started at `authName: null` and only the
OAuth deep link ever filled it in, so the app reported "signed out" over a
perfectly good session. `refreshAuth` existed in the store **with zero
callers**.

Boot now restores from the stored session and subscribes to
`onAuthStateChange`. Two rules worth keeping:

- Restore reads `getSession()` (local), never `getUser()` (server round trip).
  A launch with wifi still coming up must not report a signed-in user as signed
  out — that is the same bug wearing a new hat.
- State that a surface can only learn from an event needs a subscription, not a
  one-shot write at the moment the event happens. The deep-link handler wrote
  `authName` once and nothing maintained it afterwards.

**Look for this shape elsewhere.** Any store field that is only ever set by a
handler, never read back from its source of truth at boot, has the same latent
bug.

## 2. Then: nothing is queued

No feature work is outstanding. The roadmap programs are closed, Phase 2 is
done, and Phase 4 (paid tier) is deferred indefinitely. The next scheduled item
is a **measurement, not a build**: Search Console checkpoint ~2026-08-24
(baseline 2026-08-11: 3 clicks, 32 impressions, avg position 11.2).

Candidates if the owner wants work: Phase 1 item A (252 card pages — the
largest remaining SEO corpus expansion; the position-11.2 read is the argument
*for* it, not against), or public decks on profile pages, which slice 7 left
one view away (`decks.is_public` exists and nothing reads it — publish via a
view, never a policy, because RLS is row-level).

## 3. Owner actions, not code

- **Email OTP needs custom SMTP** before promoting to a real audience.
  Supabase's built-in mailer is rate-limited per project and users would
  silently stop getting codes.
- **§2.6 legal check** (WotC Fan Content, Scryfall commercial terms) — gates
  Phase 4 only. Deferred.
- Disk: `src-tauri/target/` ~9 GB (`cargo clean` reclaims it), `.git` ~1.4 GB
  (needs the coordinated filter-repo in `docs/GIT-HISTORY-BLOAT.md` — **never
  from CI or an agent**).

---

## Released v2.8.1 (2026-08-11) — session restore

Patch on top of v2.8.0, same evening: numbers and notes only, no marketing
rewrite (the workflow's rule for fix releases). Verified live: `version.json`
2.8.1, updater signature byte-identical to the shipped `.exe.sig`, both
installers and the universal dmg HTTP 200, homepage title and OG card on
`?v=2.8.1`. `downloads/` pruned to current + 1 again.

## Released v2.8.0 (2026-08-11)

Full AGENTS train, verified live: `version.json` 2.8.0, `updater/latest.json`
2.8.0 with a signature byte-identical to the shipped `.exe.sig`, both
installers and the universal dmg HTTP 200, homepage title + OG card on
`?v=2.8.0`. Signing key id **67FCA9900F523D49** — checked against the pubkey in
`tauri.conf.json` before publishing, because a sig from the abandoned repo-root
key looks fine and breaks auto-update.

`downloads/` pruned to current + 1 (2.7.6 artifacts dropped; git history and
the GitHub Release still hold them).

## Session log (Claude, 2026-08-11 evening)

Three items, all committed to `main`, all gates green (**526** vitest · tsc ·
eslint · `cargo fmt`/`clippy` · **48** cargo tests). Nothing released yet.

### Basic-land colour fix — done properly (`b629c43`)

The tracker now records what **Arena itself** says about opponent basics —
`superTypes:["SuperType_Basic"]` + `subtypes:["SubType_Swamp"]` off the game
object — per match, on both `TrackedMatch.opponentBasics` and `LiveMatch`, and
the inference takes those as *hard* colour evidence. No id resolution on that
path, so no phantom colour is possible, and the early-game read the soft-basics
mitigation cost is back.

Verified against the owner's real `Player.log`: the exact match that produced
the bug — 24 revealed ids including 87457, which the card API resolves to
Island — now reports `opponentBasics ["Mountain","Swamp"]`. Rakdos, not Grixis.

The mitigation stays: a basic resolved *by id* is still only soft evidence, and
its tests still assert that. The two tests marked "Changed 2026-08-11" now
assert proof again through the new argument.

Diagnostics, both reusable:
```
cd src-tauri
FND_REPLAY_LOG=<Player.log> FND_REPLAY_OPP='*'   cargo test replay_real_log -- --nocapture --ignored
```
`FND_REPLAY_OPP=*` dumps every match; a name substring still filters to one.
Output now includes `opponentBasics` next to `opponentSeen`.

### Slice 7 — cloud deck sync (`342298b`)

Phase 2 is now complete. Decklists ride the **existing** opt-in (one toggle, by
design) and the Settings consent line says so out loud.

The app has no hand-authored deck library: "your decks" are the lists Arena
registers at match start, so a deck row is match history collapsed by
`deckHash`. That history is re-derived from Arena's logs each launch, which is
the whole argument for backing it up — once a log rotates, the 75 cards a deck
was are gone locally and Arena will not give them back. Restored lists fill
`buildVersions` and show as "restored" in Version history; a locally recorded
list always wins.

Two decisions worth keeping:
- `decks` gained `deck_hash` + `unique (user_id, deck_hash)`. A list's identity
  *is* its contents, and upserting on it makes repeat runs free.
- Deck sync has **no high-water mark**. A rename changes no timestamp, so
  "newer than X" would miss it; the client stores a fingerprint of the last
  successful upload instead.
- No public read policy on `decks`, not even for `is_public` rows. RLS is
  row-level, so publishing decks later needs a view, exactly like
  `public_profiles`.

### Tracker persistence — fixed at the consequence (`684c65a`, `bc63fbe`)

373 in memory / 25 on disk, file untouched since 22 July. Rather than wait to
identify why the appends stalled, the append is no longer trusted: after every
batch and once at startup, the file is compared against memory and rewritten
atomically (temp + rename) when short. Deleted matches are not in memory, so a
repair cannot resurrect them, and every repair is counted as `persistRepairs`
in the diagnostic export.

The last silent path is closed too — a missing data file used to return quietly,
which is exactly how this stayed invisible for three weeks; it is now a counted
write error.

Verified on a **copy** of the owner's real app data: 25 on disk → 71 after the
repair, 53 recovered from the two surviving logs, no tombstone resurrected.
```
FND_DATA_DIR=<copy of app data dir> FND_LOG_DIR=<MTGA dir>   cargo test replay_persistence_repair -- --nocapture --ignored
```
Point it at a copy — it rewrites the matches file, as the app now would.

The gap between 71 and the 373 the app once held is the real cost of the three
silent weeks: those logs have rotated and that history is unrecoverable.

Also deleted `src/services/tagSuggest.ts` + its test (referenced by nothing).

---

## Session log (Claude, 2026-08-10 → 08-11)

Three releases shipped: **v2.7.5** (health ping), **v2.7.6** (Matchups rebuild +
accounts + crowd data), **v2.7.7** (public profiles + Discord).

| Done | Detail |
|------|--------|
| Core schema | `supabase/migrations/20260810120000_core_schema.sql` **run on the live DB** — profiles (+signup trigger), archetypes, shared_matches, matchup_rollup, rollup + trust functions |
| Crowd fetch | Matchups reads `matchup_rollup` oriented to **your** deck; verified the mirror, suppression, deltas and sort in-browser |
| Upload | `syncRunner.syncMatchesNow()` on launch (+12s) and 5s after `tracker:match`, debounced, capped 200/run, in-flight guarded |
| Dead code | Removed `openMatchupOpponent` / `matchupsFocusOpponent` and the whole B1 tag-nudge (it ran card resolution + inference on **every match** for a screen that no longer exists) |
| Release | v2.7.6 full AGENTS train |

**Two SQL bugs caught by re-reading before the first run** (both would have been
silent): `shared_matches.id` is bigserial so INSERT needs `usage` on the
sequence, not just the table; and the 5% per-user cap clamped games and wins
independently, which *inflates* a capped user's rate to 100% and biases the
cell the cap exists to protect. Wins now scale proportionally.

**Subject orientation is the load-bearing rule on Matchups.** Community rows are
"A vs B", so a field rate is only comparable to yours when both describe the
same deck facing the same opponent. `subjectArchetype()` requires a 60% majority
recognised deck; no clear subject means **no comparison is offered at all**.
Do not "fix" that by falling back to a field average — it is not comparable.

### CI lesson (2026-08-11) — narrow `git add` lists rot silently

`sets-refresh.yml` hand-listed the two files to stage. v2.7.1 added per-set lazy
galleries, so `npm run sets` began writing ~19 more; they stayed unstaged, the
following `git pull --rebase` refused, and the job exited **128 every 4 hours
for two days** — with the *build step still reporting success*, so the emails
read like flaky CI rather than "the data pipeline is down". The set radar was
frozen the whole time. `daily-meta.yml` stages whole directories and never
broke. **Stage directories, not file lists**, in any workflow that commits
pipeline output.

### Open follow-up: basic-land colour evidence (2026-08-11)

**Arena basic-land grpIds are not stable identities.** Verified against a real
`Player.log`: a game object Arena described as
`superTypes:["SuperType_Basic"], subtypes:["SubType_Swamp"]` carried grpId
**87457**, which resolves through the card API to **Island**. That phantom
Island put `U` into the *required* colour set and reported a Rakdos opponent as
**"Grixis Control"** — and would have uploaded them under that archetype into
the shared matchup data.

**Shipped mitigation:** basics are now *soft* evidence
(`observedColorsFromSeenCards`); non-basic mono-colour lands still prove their
colour. A single mis-resolved land can no longer invent a colour.

**Cost of the mitigation:** early-game reads are weaker when only basics are
down. Two existing tests asserted a lone basic proves its colour and were
updated — the premise was disproven, not the assertion inconvenient.

**Proper fix, not done:** stop resolving basics by id at all and read Arena's
own `subtypes` from the game object. The tracker already sees them in
`note_opponent_cards` but keeps only grpIds. Needs a per-match set of opponent
basic types plumbed through `TrackedMatch` / `LiveMatch` into the inference.
~40 lines across Rust and TS, and it restores the lost signal.

### After slices 1 and 2 above

**Phase 1 item A — 252 card pages.** The largest remaining SEO corpus
expansion. The Search Console read (3 clicks / 32 impressions / **avg position
11.2** / 9.4% CTR over 28 days) is the argument *for* it: Google ranks the
existing 36 pages and they convert when surfaced — there simply are not enough
of them to match many queries. Do not read that as "SEO isn't working".

---

## Older: resume notes (2026-08-10 evening) — SUPERSEDED

> ⚠️ Everything below this line is history. Its "next steps" were completed on
> 2026-08-11: the crowd fetch, the upload path, slice 4 profiles and the release
> train are all done. Read it for context only — **START HERE at the top of this
> file is the live list.**

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
| src/services/cloud/matchSync.ts | Shared-match allowlist builder — upload payload, never serialise TrackedMatch |
| src/services/cloud/archetypeSlug.ts | Canonical slug join key (+ `labelFromSlug`, duplicated in the profile function) |
| src/services/cloud/sync.ts | isCloudEnabled/setCloudEnabled, upload, fetchRollup, handle + display-name |
| src/services/cloud/syncRunner.ts | Pulls live state + inference, calls the upload. The only trigger point |
| src/services/cloud/auth.ts | OAuth (system browser + `fnd://`), email OTP, session |
| src/services/opponentArchetype.ts | Inference. `observedColorsFromSeenCards` is where the basic-land fix lands |
| src-tauri/src/deeplink.rs | `fnd://` — handles BOTH cold start and the single-instance argv route |
| netlify/functions/profile.mts | Server-rendered `/u/<handle>` (config.path routing) |
| supabase/migrations/ | 4 migrations, all run on the live DB |
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
| App version | **v2.8.1** — live on Windows + macOS, every surface verified against production |
| Branch | `main` = `origin/main`, clean, tags `v2.8.0` + `v2.8.1` pushed |
| Gates last green | **526** vitest · tsc · eslint · `cargo fmt`/`clippy` · **48** cargo tests (2026-08-11 evening) |
| Licence | MIT (`LICENSE`); README carves out brand, third-party meta data, Scryfall/WotC content |
| Monetization | Ko-fi only; Phase 4 paid tier deferred indefinitely |
| Supabase | Project `bzcryoocsapqtyhiwzbe`, **Pro**. All **five** migrations run: health_pings, core schema, public profiles, display-name privacy, decks |
| Auth | Google **and** Discord enabled + verified live; email OTP available (Supabase's built-in mailer is rate-limited — needs custom SMTP before promoting to a real audience) |
| Cron | `fnd-rollup` scheduled hourly (`select cron.schedule(...)`, job id 1) — without it `matchup_rollup` never fills |
| Owner's profile | `filthy-net-deck.com/u/l0ne-f0x` — public, 371+ matches uploaded and aggregating |

### Verified live vs merely built

- **Verified against production:** Google sign-in (system browser → Supabase →
  `callback.html` → `fnd://` deep link → app), signup trigger creating the
  profile row, match upload (371 rows), profile page render + OG tags + 404 +
  handle sanitisation, health ping, Matchups crowd orientation/suppression.
- **Built, never exercised for real:** cloud deck sync end-to-end (schema is live; no client has written a deck row yet — START HERE §1), Discord sign-in (configured, unused),
  email OTP sign-in, community matchup *cells* (need 30+ shared games from
  accounts with 25+ matches and 7+ days — expect empty for a while **by
  design**, that is the honesty discipline, not a fault).

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

## Background queue (nothing here blocks the START HERE list)

| Priority | Item | Notes |
|----------|------|--------|
| Defect | Tracker persistence — root cause | Data loss FIXED (reconcile pass, 2026-08-11). Why appends stalled is still unknown; `persistRepairs` in the next diagnostic is the trail |
| Measurement | Search Console checkpoint ~2026-08-24 | Baseline 2026-08-11: 3 clicks, 32 impressions, position 11.2 |
| Product | Email OTP needs custom SMTP | Supabase's built-in mailer is rate-limited per project; users would silently stop getting codes. Do before promoting to the YouTube audience |
| Optional | Upload Windows exe/sig to GitHub Releases | macOS dmgs are there; Windows lives on the site CDN + local archive only |
| Disk | `src-tauri/target/` regrows to ~9 GB | `cargo clean` reclaims it at the cost of one full rebuild |
| Later | macOS signed updater | Workflow disables updater artifacts; key is local-only |
| Later | `.git` is ~1.4 GB | Needs the coordinated filter-repo in `docs/GIT-HISTORY-BLOAT.md`. **Never from CI or an agent** |

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
| `docs/BACKEND-PHASE-2.md` | Slice 7 recorded as built (deck_hash key, no high-water mark) |

(No pipeline/docs process change in 2.7.2 — pure app perf + release.)

---

## Older context (still valid, not re-audited)

- Platform/growth plan: `docs/PLATFORM-STRATEGY.md`
- Install counting post-mortem: `docs/INSTALL-COUNTING.md`
- Long-form roadmap (both programs closed): `ROADMAP.md` / `100X-ROADMAP.md`
- Latest deep audit: `docs/AUDIT-2026-08-10-v2.7.3.md` (the 07-22 v2.5.0 audit
  it supersedes was removed; it is in git history)
- v2.7.1 memory / slim-sets detail: still accurate in git history of this file

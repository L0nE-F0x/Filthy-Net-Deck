# Filthy Net Deck — the 100× Roadmap

**Prepared:** 2026-07-20 · from a full-codebase deep scan
**Baseline:** v1.5.0 shipped (v1.5.1 in tree) · Tauri 2 + React 19 + TypeScript + Tailwind 4 + Zustand 5
**Scope of scan:** ~21,600 lines TS/TSX · ~2,441 lines Rust · ~1,966 lines pipeline JS · 27 test suites · 3 CI workflows

> This is not a list of 100 features. **100× is multiplicative, not additive.** A great app that nobody installs is 1×. This roadmap identifies the handful of multipliers that compound — reach, retention, reliability, and a defensible moat — and sequences them so each one is protected by the one before it.

---

## 0. Honest snapshot — what the scan actually found

Filthy Net Deck is, engineering-wise, **already very good**. It is disciplined where most side projects are sloppy:

**Strengths (do not break these):**
- **A real moat.** `src-tauri/src/tracker.rs` (1,953 lines) tails MTG Arena's `Player.log` entirely offline — parsing match lifecycle, submitted decklists, on-play/draw, rank, season, *and* a live in-library card tracker for the overlay HUD. This is hard, unofficial, reverse-engineered work that competitors cannot copy in a weekend. **This is the product.**
- **A "no-lies" data spine.** `pipeline/build-meta.mjs` aborts without writing when live data can't be verified (`MIN_DECKS_PER_FORMAT`), every card name is Scryfall-validated, and nothing is ever fabricated. The `listQuality` provenance is surfaced in-UI.
- **Self-healing operations.** `daily-meta.yml` + `sets-refresh.yml` rebuild the feed 4×/day and **auto-open a GitHub issue on failure** — silent data-rot is structurally impossible.
- **Real release discipline.** `AGENTS.md` encodes an end-to-end rollout checklist (binary → signed updater → soft channel → marketing → OG card → Netlify → macOS tag). Signed one-click updates with a silent-NSIS fallback.
- **Clean code hygiene.** 0 `console.log` in shipped `src`, only 7 `eslint-disable` lines (all legitimate `exhaustive-deps`), pure-logic services factored out and unit-tested (`deepLinks`, `rotationImpact`, `climbStats`, `statsInsights`, `personalMeta`, …).
- **Privacy as a feature.** Everything local. Nothing uploaded. Ever.

**The real constraints on 100× — grouped by whether they are *principled* or merely *parked*:**

| Finding | Where | Type | Why it caps growth |
|---|---|---|---|
| **Near-zero discovery surface** | Distribution is one self-hosted Netlify site | *Parked* | No store, no `winget`/`brew`/`choco`, no Linux, no SEO corpus. This is the **single biggest 100× lever.** |
| **No test/typecheck CI gate** | `.github/workflows/*` run pipeline + macOS build only | *Fixable now* | Nothing runs `npm test`, `tsc --noEmit`, `npm run build`, `cargo test`, or `cargo clippy` on a push. Regressions can ship. |
| **Single meta source of truth** | `build-meta.mjs::buildFormat` uses **only** MTGGoldfish tiles+archetype pages | *Doc/impl drift* | `docs/DATA-AND-UPDATES.md` describes a `magic.gg → mtgo → goldfish → melee` list-priority chain, but those sources are wired **only** to tournament *links*, not the 8×8 lists. One Goldfish redesign = whole meta dark. |
| **Fragile parsers, no fixtures** | `pipeline/sources/goldfish.mjs` regex-parses HTML; `vitest` includes `pipeline/**/*.test.mjs` but **no such tests exist** | *Fixable now* | The most brittle code in the repo (HTML regex) has 0 tests. |
| **Tracker parser has only a manual harness** | `replay_real_log` is `#[ignore]` | *Fixable now* | The crown-jewel parser is validated only by a human running a hidden test against a real log. |
| **No lint/format config committed** | no `eslint.*`, no `prettier.*`, no `rustfmt.toml`/`clippy` | *Fixable now* | Style/quality drift as contributors (or agents) grow. |
| **Monolith pages** | `Stats.tsx` 1,978 lines / 42 hooks · `Sets.tsx` 1,112 · `Climb.tsx` 1,014 | *Refactor debt* | Hard to test, hard to hand off, slow to change. |
| **No field visibility** | privacy-first ⇒ zero telemetry | *Principled, but* | You cannot see a broken parser in the wild until a user reports it. Needs a *privacy-preserving* answer, not classic analytics. |
| **`.git` bloat** | ~500 MB of historical binaries in history | *Parked* | Slows every clone/CI checkout. |

**Principled constraints to keep forever (these are not "problems"):** local-only tracking, real-data-only / no fabrication, no in-draft overlay (ToS), no Alchemy focus dilution, desktop-only for log tailing, ApexForge credit.

---

## 1. The 100× thesis

Model impact as a product of factors that already exist near 1×:

```
Impact  =  Reach  ×  Activation  ×  Retention  ×  Reliability  ×  Differentiation
```

Today (rough, directional):

| Factor | Today | Ceiling this roadmap unlocks | Multiplier |
|---|---|---|---|
| **Reach** — how many eligible players can find/install it | ~1× (one website) | Store + package-manager + Linux + SEO | **~10×** |
| **Activation** — % who get the tracker working | ~1× | Guided setup, health checks, first-value in <2 min | **~2×** |
| **Retention** — do they open it tomorrow | ~1.5× (tracker is sticky) | Daily loop, streaks, grounded coach | **~2.5×** |
| **Reliability** — does it stay correct unattended | ~2× (self-healing feed) | CI gates + multi-source + parser tests | protects the rest |
| **Differentiation** — why this over Untapped/17Lands | ~2× (offline moat) | Grounded local AI coach, deep local analytics | **~2×** |

`10 × 2 × 2.5 × 2 ≈ 100×`. The reliability factor is the *guardrail* — it doesn't add reach, it keeps you from losing it. **That is why hardening comes first in the sequence even though distribution is the biggest number.**

---

## 2. The four pillars

### Pillar A — Distribution & Discovery  *(the ~10× on Reach)*

The product is finished enough to deserve an audience 100× larger than a single Netlify page can reach.

**A1 — Package-manager presence (fastest ROI).**
- **Windows:** publish a `winget` manifest (`L0nE-F0x.FilthyNetDeck`) and a Chocolatey package. Both consume the *existing* signed NSIS `.exe` — near-zero new build work, huge discoverability with power users.
- **macOS:** ship a **Homebrew Cask** pointing at the universal dmg the `macos-build.yml` tag CI already produces. Roadmap already notes "roll dmg into downloads" — this extends the same artifact to `brew install --cask`.

**A2 — Microsoft Store (MSIX).** The largest untapped Windows discovery channel for a consumer desktop app. Tauri supports MSIX packaging. This is the marquee reach unlock. (Mac App Store is possible but sandboxing fights the `Player.log` read — evaluate, likely defer in favor of Homebrew + notarized dmg.)

**A3 — Linux build.** Arena runs on Linux via Proton for a real, vocal segment. `tracker.rs` already `#[cfg]`-gates log paths (Windows/macOS today) — add the Linux `~/.wine`/Proton `Player.log` path and ship an AppImage + Flatpak. Reuses ~95% of the codebase.

**A4 — SEO / content moat.** The daily pipeline already *produces* the most valuable thing in MTG content — a verified, dated, machine-readable metagame — and throws away the HTML surface. Publish a lightweight, statically-generated **public meta site** from `latest.json` + `history.json`: "Standard metagame on {date}", per-archetype pages, rotation countdowns. Every daily run becomes an indexable page. This turns your CI cron into a compounding content engine that funnels to the download.

**A5 — Community & virality.** The `deckShare` / `shareCards` / `recapCard` infrastructure already renders PNGs. Close the loop: one-click "share my season recap" / "share this matchup record" to X/Discord with the app's OG branding, `?v=` cache-busted. Add a Discord presence and a `Share to community` that *seeds* the SEO site.

---

### Pillar B — The Tracker Moat  *(the ~2× on Differentiation + Retention)*

Nobody else has a local, offline, no-account Arena tracker this good. Widen the gap.

**B1 — Local opponent-archetype inference.** The tracker already captures *cards seen* from the opponent via GRE `gameObjects` (the same feed that drives the in-library HUD). Feed opponent-revealed cards into the existing `cardWatch` / meta-archetype matcher to *label* the opponent's deck — locally, from real cards, never fabricated. This turns "Matchups vs a name" into "Matchups vs Izzet Prowess" with a real, personal win-rate. It's the single highest-value data unlock and it's **already in the log stream you parse.**

**B2 — Deeper personal analytics (all local, all real).** Mulligan-kept-vs-mull rates, win% on the play vs draw by archetype (data is captured; surface it), turn-of-first-land-drop, per-archetype sideboard-game deltas (Bo3 g2/g3 already parsed). This is 17Lands-class insight for Constructed — but private and offline.

**B3 — Grounded AI coach (the deferred idea, done safely).** The roadmap defers "AI without grounded local data" — correctly. The move is a coach that is *only ever* grounded: input = the user's real matches + today's real Scryfall-validated meta lists; output = "you're 2–7 vs the field's #1 deck (Izzet Prowess); here are 3 sideboard cards *from your own list* the ranked Izzet peers run against it." No invented cards (the `brewLab.ts` deterministic staples engine is the guardrail), Claude API only summarizes/prioritizes real rows. Ship it opt-in, offline-capable-degraded, with every claim traceable to a match id or a deck id. This is the feature that gets written up.

**B4 — Overlay depth.** The overlay HUD already tracks the library. Add opponent-cards-seen and a live "you're on X% to win this matchup historically" line — again from purely local data.

---

### Pillar C — Reliability & Self-Healing  *(the guardrail on the whole product)*

100× the audience means 100× the blast radius of any regression. Close the gaps before scaling reach.

**C1 — A real CI quality gate.** Add `.github/workflows/ci.yml` on push/PR: `npm ci` → `tsc --noEmit` → `npm test` → `npm run build` → `cargo test` → `cargo clippy -D warnings` → `cargo fmt --check`. This is a few hours of work and it is the difference between "self-maintaining" and "silently broken." **Do this first.**

**C2 — Fixture tests for the fragile scrapers.** `vitest` already globs `pipeline/**/*.test.mjs` — write them. Snapshot real Goldfish HTML into fixtures and assert `parseMetagameTiles` / `parseArchetypeDeckPage` extract the right tiles/lists. When Goldfish redesigns, the test goes red *before* production does.

**C3 — Multi-source meta (kill the single point of failure).** Resolve the doc/impl drift: actually wire `magic.gg` and `MTGO` decklist parsing into `buildFormat`'s list assignment with the priority chain `docs/DATA-AND-UPDATES.md` already promises, Goldfish as fallback. One source going dark should degrade quality, not black out the meta.

**C4 — Automated tracker-parser regression suite.** Promote the `#[ignore]`d `replay_real_log` into a committed corpus of *anonymized* log fixtures covering each event type (Playing, MatchCompleted, courses, rank, GRE deck, mulligan reshuffle). Run in CI. When an Arena update changes the log, CI tells you which shape broke.

**C5 — Lint/format config.** Commit `eslint` (typescript-eslint + react-hooks), `prettier`, and `rustfmt.toml`. Wire into C1. Removes drift as the contributor/agent surface grows.

**C6 — Privacy-preserving field health.** Not analytics. An *opt-in*, *local-only* "parser health" panel already partially exists (`trackerHealth.ts`, `parse_errors` in status). Extend it so a user hitting parse errors gets a one-click **"generate an anonymized diagnostic log"** they can attach to a GitHub issue. You get field signal; the user keeps control of every byte that leaves their machine.

---

### Pillar D — Activation & Engagement Loop  *(the ~2× on Activation + Retention)*

**D1 — Sub-2-minute first value.** Instrument (locally) the setup funnel: log found → detailed-logs enabled → first match recorded. `TrackerOnboarding.tsx` exists; make it a guided, checkable, "you're live" moment. The faster a user sees *their own first tracked match*, the higher every downstream number.

**D2 — The daily loop.** A "since you last opened" digest: meta movers, your record yesterday, rank delta, rotation countdown. The pieces exist (`metaDiff`, `climbStats`, `rankMoments`) — assemble them into one open-worthy home strip. (Note: the 10× SKIP list parked "Today's plan strip" D1; revisit that decision *now* that retention is the explicit goal — it may be the highest-value un-parking.)

**D2 — Streaks & seasonal recap as a habit.** `recapCard` renders a season PNG. Make the end-of-season recap a *notification-driven event* ("your Silver→Diamond climb is ready") that pulls users back and seeds Pillar A5 sharing.

---

## 3. Sequenced plan (protect each multiplier with the prior one)

> Follow the project's release discipline: finish a batch on `main`, cut **one** version per the `AGENTS.md` end-to-end checklist. `npm run meta`/`sets` still ship anytime without a bump.

### Phase 0 — Harden the base *(ship before any reach work)*
- **C1** CI gate (tsc + vitest + build + cargo test/clippy/fmt) ← *do this literally first*
- **C5** eslint / prettier / rustfmt configs
- **C2** Goldfish fixture tests
- **C4** committed tracker log-fixture corpus, un-`ignore`d in CI
- *Outcome:* regressions can no longer reach users. Now it is safe to scale reach.

### Phase 1 — Open the floodgates *(Reach)*
- ~~**A1** winget / Homebrew / Chocolatey~~ — cancelled (website + in-app updater only)
- **A4** static public meta site generated from `latest.json`/`history.json`
- **A5** one-click community share on recap/matchup
- *Outcome:* discovery surface goes from 1 page to many; every daily run is indexable.

### Phase 2 — The store & the second OS *(Reach, part 2)*
- **A2** Microsoft Store (MSIX)
- **A3** Linux (Proton `Player.log` path + AppImage/Flatpak)
- **C3** multi-source meta assignment (resolve the single-source risk *before* the store audience arrives)
- *Outcome:* the two biggest reach unlocks, on a hardened, multi-sourced spine.

### Phase 3 — Widen the moat *(Differentiation + Retention)*
- **B1** local opponent-archetype inference (highest-value data unlock)
- **B2** deeper personal analytics surfacing
- **D1/D2** activation funnel + daily-loop home strip
- *Outcome:* the tracker becomes clearly best-in-class; day-2 retention climbs.

### Phase 4 — The headline *(Differentiation)*
- **B3** grounded, offline-first AI coach (traceable to real matches + real lists)
- **B4** overlay opponent/matchup depth
- **C6** privacy-preserving diagnostic export
- *Outcome:* a genuinely novel, defensible, press-worthy feature that no account-based cloud tracker can match on privacy.

### Continuous
- **A-hygiene:** `.git` history reclaim during a quiet window (BFG/`filter-repo`), downloads-dir trim (already policy)
- **Refactor debt:** peel `Stats.tsx` / `Sets.tsx` / `Climb.tsx` into tested sub-modules *as you touch them*, not as a big-bang

---

## 4. Guardrails — what must NOT change to hit 100×

The temptation at scale is to compromise the things that make this app trustworthy. Do not.

1. **Real data only.** No fabricated lists, matchups, or sideboard guides — ever. `brewLab`/pipeline abort-on-failure stays.
2. **Local-only tracking.** No account, no upload, no cloud sync of matches/notes. If sync is ever built, it is opt-in and end-to-end encrypted — the privacy promise is a moat, not a limitation.
3. **AI is grounded or absent.** Every coach claim traces to a real match id or a real, Scryfall-validated card. No free-form hallucination surface.
4. **No ToS violations.** No in-draft overlay. Read-only log tailing only.
5. **Focus:** Standard + Pioneer. Resist Alchemy/Historic/Commander dilution — depth over breadth is the strategy.
6. **End-to-end releases.** A version bump is incomplete until updater + soft channel + OG card + Netlify + (tagged) macOS all match. Scaling reach makes this *more* important, not less.

---

## 5. Metrics that would prove 100× *(all measurable without violating privacy)*

- **Reach:** installs/day across each new channel (store/pm telemetry is aggregate, not per-user); indexed meta-site pages; inbound from search.
- **Activation:** % of first launches that reach "first match tracked," measured **locally** and only ever reported in aggregate opt-in.
- **Retention:** day-2 / day-7 app opens (local counter; opt-in aggregate).
- **Reliability:** CI green rate; mean-time-to-detect a broken source (should trend to *minutes* via C2/C4, from *a user report* today).
- **Differentiation:** qualitative — is the app cited in MTG communities as *the* offline tracker? Does the coach get screenshotted?

---

## 6. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Goldfish/scraper redesign blacks out meta | High (eventually) | **C2** fixtures + **C3** multi-source failover |
| Arena log-format change breaks the tracker | Medium (every few patches) | **C4** fixture corpus in CI + **C6** diagnostic export shortens the fix loop |
| Store review friction (MSIX / notarization) | Medium | Start MSIX early in Phase 2; keep the direct-download channel as the guaranteed path |
| AI coach hallucinates and erodes trust | Medium if done wrong | **B3** grounding contract: no card exists in output unless it exists in a real list; ship behind opt-in |
| Growth outpaces a one-person maintenance loop | Medium | Phase 0 CI + fixtures make the app *more* autonomous before the audience scales; the existing failure-issue automation already covers data |
| `.git` bloat slows CI as build frequency rises | Low-Med | Scheduled history rewrite during a coordinated quiet window |

---

## 7. If you only do five things

1. **Ship a CI test/typecheck/clippy gate this week** (C1). Everything else is built on it.
2. **Ship the public meta site from the daily feed** (A4) — SEO surface that funnels to the download.
3. **Local opponent-archetype inference** (B1) — moat from cards already in the log stream.
4. **Wire the multi-source list priority you already documented** (C3) — remove the single point of failure before the audience arrives.
5. **Grounded local coach / deeper analytics** (B2/B3) — only after B1 + C3 harden the spine.

Do these five and the remaining pillars have a hardened, discoverable, differentiated base to multiply against.

---

*Companion to `ROADMAP.md`, `docs/PAGE-10X.md`, and `AGENTS.md`. The 10× program (page-level narrative/actions) shipped in v1.0; the 100× program is reach × reliability × moat. Keep the guardrails in §4 non-negotiable.*

# Filthy Net Deck — handoff

**Read this first.** Live top-of-todo across model/agent handoffs
(Claude ↔ Opus ↔ Grok ↔ Kimi).

**Live product version: v2.5.4** · repo `L0nE-F0x/Filthy-Net-Deck` · branch **`main`**.

**Session wrap (2026-07-30, Opus 5):** release train **complete** for **v2.5.4**
(Windows + macOS + updater + site), and the owner verified in-app *Update &
restart* plus the new tip jar on a real client. This session was mostly
**business/growth work, not app work** — see `docs/PLATFORM-STRATEGY.md`, which
is now the live plan alongside this file. No open engineering work. **Next
checkpoint is a measurement, not a build:** see "Waiting on data" below.

---

## Current state (as of wrap)

| Item | Status |
|------|--------|
| App version | **v2.5.4** (`package.json`, `src/version.ts`, Cargo, `tauri.conf.json`) |
| Branch | `main` synced with `origin/main` |
| Key commits | `22d681f` Ko-fi tip jar · `776bfa1` meta-web SEO · `5b36e94` release · `6053b52` macOS roll |
| Tag | `v2.5.4` (macOS CI green) |
| Windows | `website/downloads/Filthy-Net-Deck-Setup-2.5.4.exe` + `.sig` |
| macOS | `website/downloads/Filthy-Net-Deck-2.5.4-universal.dmg` |
| Updater | `website/updater/latest.json` → 2.5.4 (key **67FCA9900F523D49**, key id cross-checked pre-publish, live sig byte-matched to build) |
| Soft channel | `website/version.json` + `public/version.json` → 2.5.4 |
| Site | Download buttons + OG `?v=2.5.4`, og-image regenerated |
| Live Netlify | version.json / updater / setup.exe / .sig / dmg all **200** @ 2.5.4 |
| Owner-verified | in-app **Update & restart** worked; tip jar link works |
| Gates last green | **365** vitest · lint/tsc clean · `typecheck:functions` (new) |
| `WHATS_NEW` | 2 lines (tip jar + public meta pages) |

Working tree keeps **current Windows** under `website/downloads/` (v2.6.3 exe + sig)
and the last macOS dmg (v2.6.2 until `v2.6.3` tag CI rolls). Older installers
are pruned per `docs/GIT-HISTORY-BLOAT.md`.

---

## What this session shipped (2026-07-30)

Mostly growth/ops rather than app code. The app diff is three files.

1. **`docs/PLATFORM-STRATEGY.md`** (new) — the business plan around the app:
   honest audience read, straight answers on backend/monetization/social, a
   gated five-phase sequence, cut list, risk table. **Read it before proposing
   product work.** Phase 0 done, Phase 1 partially done, Phase 2 gated.
2. **Install counting — attempted, withdrawn.** Full post-mortem in
   `docs/INSTALL-COUNTING.md`. `/version.json` turned out to be a *fallback*
   endpoint: `useAppStore::checkForUpdates` tries the signed Tauri updater
   first and returns early, so real installs never request it. **The per-launch
   signal is `/updater/latest.json`** — read it in Netlify **Observability**
   (URL filter), not Web Analytics, which has no path breakdown for JSON.
   Measured baseline: ~325 updater checks/7d, ~15–25 daily actives, ~5 new
   installs/day. Function code is retained but routed to nothing.
3. **Ko-fi tip jar** — site + Settings → About, one `DONATE_URL` constant in
   `src/services/site.ts` (empty string hides it everywhere). Ko-fi rather than
   PayPal.Me, which Indonesian personal accounts cannot create.
4. **meta-web SEO (`776bfa1`)** — hub linked only 5 of 32 decks; now links all
   32, deck pages gained 6 sibling links each (192 corpus-wide), plus mana
   curve, composition, key-card art, JSON-LD, `lastmod` sitemap. Google Search
   Console verified, sitemap submitted, three pages queued for indexing.
5. **v2.5.4 release** — the tip jar, shipped through the full AGENTS checklist.

### Hard-won facts (do not re-derive)

- **Both `netlify.toml` files are live, for different things.** Repo-root =
  `publish` + `[functions]`. `website/netlify.toml` = **headers and redirects**
  (it sits inside the publish dir). A redirect added to the root file silently
  does nothing.
- **Netlify Pretty URLs rewrites deployed HTML** (`href="x.html"` →
  `href='/meta-web/x'`). Live HTML never byte-matches git. Verify deploys with a
  response header or generated marker, never a byte-diff.
- **Nothing with a dot in its basename may live in `netlify/functions/`** — a
  test file there became a function named `version.test` and failed every
  production deploy for ~15 minutes.
- **Read the Netlify deploy log before theorising.** Three wrong diagnoses this
  session came from inferring via response headers while the log said it plainly.

## Waiting on data — the next checkpoint is a measurement, not a build

Owner is away ~2 days; the real check is **~2 weeks out (from 2026-07-30)**.

**Google Search Console → Indexing → Pages.** The meta-web corpus (35 URLs) was
made crawlable for the first time on 2026-07-30; sitemap submitted, hub + both
format pages queued for indexing.

- **Climbing toward 35** → the crawlability work landed. Option **A** (252 card
  pages, one per unique card, ~1 day, pure Node in `build-meta-site.mjs`) becomes
  clearly worth building, and Phase 2's gate comes into view.
- **Stuck in single digits** → do **not** add more pages. Diagnose discovery first.

Also worth a glance: Netlify **Observability** filtered to `/updater/latest.json`
(install trend), and the Ko-fi page (willingness-to-pay signal long before it is
income).

**Phase 2 (accounts, Discord OAuth, public profiles, then cloud sync) is gated on
this and should not be started early** — see `docs/PLATFORM-STRATEGY.md` §3.

---

## OPEN — needs owner (not agent-solo)

### 1. Netlify meta-web prod↔git drift — ✅ CLOSED 2026-07-30 (not a drift)

Both halves of this had mundane explanations. No deploy was ever pinned and
auto-publish was never off.

**"Live HTML matches no git commit"** — Netlify's **Pretty URLs** post-processing
rewrites HTML on deploy: `href="deck/x.html"` becomes `href='/meta-web/deck/x'`
(absolute, extension stripped, single-quoted). Live HTML will therefore *never*
byte-match git, by design. Both forms return 200 and every canonical points at
the `.html` form, so indexing consolidates correctly. Nothing to fix.

**"`max-age=300` never showed up live"** — correct, and it never will: that rule
lives in the repo-root `netlify.toml`, which Netlify does not read for headers.
Headers come from `website/netlify.toml` (it sits inside the publish directory).
More to the point, **the rule was not worth having** — live pages serve
`max-age=0, must-revalidate`, which is *fresher* than the 300s the "fix" would
have imposed. See the note at the top of the root `netlify.toml`.

**Confirmed working:** deploys land from git push (multiple verified 2026-07-30),
and the daily cron regenerated the full meta-web corpus with a same-day
`lastmod`. Verification method for future doubt: check a response header or a
generated marker, not a byte-diff against git.

### 2. Repo hygiene (2026-08-08)

Owner-approved cleanup removed iteration bulk: one-shot `do-*-bump` /
`roll-macos-*` scripts, pre-2.6.2 installers under `website/downloads/`, unused
Vite/Tauri default assets, mobile/store icon packs, and marketing WIP
(`youtube-community*`, `video/`, `video_stills/`, `launch/`, generator scripts,
`goal/`). Keep only current release binaries + reusable scripts
(`bump-version.mjs`, `gen-mtgo-name-map.mjs`, `fix-website-mojibake.mjs`,
`capture-theme-screens.mjs`).

---

## Backlog for the next agent (pick with owner, or hygiene only)

**Do not cut a release unsolicited.** Batch product work; engineering hygiene
may proceed on judgment. Ask before product decisions.

| Priority | Item | Notes |
|----------|------|--------|
| ~~Optional smoke~~ | ~~In-app Update & restart~~ | ✅ Owner verified on v2.5.4, 2026-07-30 |
| P2 eng | Major dep bumps **one branch at a time** | typescript 7, vite 8, vitest 4, plugin-react 6 — never batch |
| P2 product-aware | Secondary-monitor toast/presence | Owner-aware; follow Arena’s display — real work |
| P1 gated | Phase 1 **A** — 252 card pages | Only after Search Console shows indexing. `docs/PLATFORM-STRATEGY.md` §3 |
| P3 owner-only | v3.0 accounts/sync (Phase 2, gated) · Scryfall attribution re-add · `.git` history purge | Ask first; attribution was a deliberate v2.2.1 trade |

**Good first resume prompts (owner should choose):**

1. “Check Search Console indexing and decide on card pages” (the real next step).
2. “Bump one dep on a branch” (e.g. vitest 4 alone).
3. “Start secondary-monitor presence/toast” (product-ish — confirm first).

---

## Release artifacts (current)

| Target | File |
|--------|------|
| Windows | `website/downloads/Filthy-Net-Deck-Setup-2.6.3.exe` + `.sig` |
| macOS | `website/downloads/Filthy-Net-Deck-2.6.2-universal.dmg` (2.6.3 via tag CI) |
| Updater | `website/updater/latest.json` → **2.6.3** |
| Soft | `website/version.json` + `public/version.json` → **2.6.3** |
| Tag | `v2.6.3` (macOS CI) |

**Sign only** with key id **67FCA9900F523D49**
(`%USERPROFILE%\.tauri\filthy-net-deck.key` + `filthy-net-deck-key-password.txt`).
Repo-root `filthy-net-deck.key` is abandoned (wrong pubkey — breaks auto-update).
Never commit keys; never echo password.

Full definition of done: **`AGENTS.md`**.

---

## Full local gate before every push

```
npm run lint && npx tsc --noEmit && npm test
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

## Verification without Arena

`npm run dev`, then seed:

```js
window.__fndStore.setState({ trackerMatches: [/* real grpIds e.g. Ethereal Armor 92065 */] })
```

Overlay/toast/presence demos: `/?demo#/overlay` (add `&phase=ended` for the
post-match card, `&fresh` for its day-one state).

## Architecture must-knows

- **Four webviews:** `main` · `overlay` · `toast` · `presence`. Every new
  window label MUST be in `src-tauri/capabilities/default.json` `windows`.
  `.transparent()` stays `#[cfg(not(macos))]` or dmg CI breaks.
- **Feed entry:** only `normalizeMetaBundle` in `src/services/deckHelpers.ts`.
- **Stats UI:** panels under `src/components/stats/`; page shell
  `src/pages/Stats.tsx`.
- **Meta pipeline:** `pipeline/build-meta.mjs`, `build-sets.mjs`,
  `build-meta-site.mjs` (`npm run meta:site` in daily cron).

## Owner preferences (non-negotiable)

- Desktop only — no mobile / Android WR promises.
- Distribution: website + signed in-app updater only (no winget/Homebrew/Store/Linux).
- Prefer **Update & restart** over browser `.exe` download.
- Formats: **Standard + Pioneer only**; real lists only. Brew Lab stays pure.
- Batch features per release; ask before product-scale decisions or unsolicited releases.

## Quick map

| Need | Where |
|------|--------|
| Version / What's New | `package.json`, `src/version.ts`, `src-tauri/{Cargo.toml,tauri.conf.json}`, `*/version.json` |
| My Stats | `src/components/stats/*`, `src/pages/Stats.tsx` |
| Tracker / ranks | `src-tauri/src/tracker.rs`, `src/types/tracker.ts` |
| Arena open watcher | `src-tauri/src/arena.rs`, `presence.rs` |
| Overlay / toast | `src/overlay/*`, `src/toast/*` |
| Meta pipeline | `pipeline/*` |
| Release rules | **`AGENTS.md`** |
| Self-maintenance | `docs/MAINTENANCE.md` |
| Audit + backlog detail | `docs/AUDIT-2026-07-22-v2.5.0.md` |

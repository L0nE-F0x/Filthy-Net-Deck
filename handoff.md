# Filthy Net Deck — handoff

**Read this first.** It's the live top-of-todo, kept current across model/agent
handoffs (Claude ↔ Opus ↔ Grok ↔ Kimi share it).

**Live product version: v2.5.1** · repo `L0nE-F0x/Filthy-Net-Deck` · branch **`main`**.

---

## v2.5.1 (2026-07-22, Opus 4.8) — maintenance release + meta-web edge fix

Shipped the two v2.5.0-audit fixes that could only reach users via a rebuild:
the **dependency patches** (dev-only vitest advisory + safe bumps) and the
**dead-CSS removal** — the v2.5.0 installer was built before those, so they were
in `main` but not in any distributed binary. v2.5.1 is a maintenance release with
**no user-facing change**; `WHATS_NEW` is intentionally empty (no post-update
banner), updater notes carry the honest summary. OG image left as the v2.5.0
focus-pass card (patch releases add no marketing copy). Full release train ran
clean (sig key 67FCA9900F523D49, mac dmg from tag CI).

**Two things confirmed/fixed while verifying #3 + #4 from the audit:**
- **#4 works in production:** the daily-meta cron (`3822115`) regenerated every
  meta-web page — proof the new `npm run meta:site` step is live. It regenerates
  meta-web daily now.
- **Prod↔git drift is real and was masking #3:** the live meta-web served a stale
  `/#download` (single-quote, older byte size) that matches **no git commit** —
  an out-of-band `netlify deploy` from the past, stuck at Netlify's edge across
  several git-based deploys. git + Netlify **origin** are correct
  (`index.html#download`, rot-free); only the HTML **edge cache** lagged. Root
  cause: `/meta-web/*` had no `Cache-Control` in `netlify.toml`, so it cached
  aggressively. **Fixed** — added `max-age=300, must-revalidate` for `/meta-web/*`
  so daily-regenerated pages stay fresh-on-deploy. If a future session sees the
  live site not matching git, this drift (documented in the
  `audit-2026-07-19-v1.1.1` memory) is the first thing to check: deploy via git
  push only, never manual `netlify deploy`.

---

## Prior wrap-up: 2026-07-22 (Claude, Fable 5 → Opus 4.8) — v2.5.0 + deep audit

**v2.5.0 "the focus pass"** — owner said the app felt cluttered/confusing; asked
for sleek/tight/tidy. UI declutter only, no data-model changes. Method that
worked well and is worth reusing: run the app populated in the browser (seed
`window.__fndStore.setState({ trackerMatches: [...] })` with fake matches), then
hunt on-screen duplication. Changes: Decks page leads with the deck board
(catch-up/coach strips moved below the grid, bottom meta-movement panel deleted —
chips + timeline already carry it); Stats status one-line + Best-10 tile removed
(dupe of insight chips) + share button folded into Season story; Climb intro
stops repeating the tiles below it + climb path previews 10 legs w/ Show-all;
Sets per-card date table → countdown strip + one prerelease line, 20 live sets →
compact rows w/ Show-all; daily "meta moved" banner cut; Settings plumbing moved
below behavior cards. Shipped full release train (exe+sig, universal dmg, updater
manifest, site, OG). Net −25 lines app code.

**Deep audit** (see **`docs/AUDIT-2026-07-22-v2.5.0.md`** for the full report and
prioritized backlog). Everything green — JS + Rust gates, 335 + 31 tests, 0 npm
vulns, no TODO debt, no orphan components, tight Tauri security. Fixed in the same
pass: **npm critical vitest advisory + safe dep bumps** (→ 0 vulns);
**`website/downloads/` 214 MB → 46 MB** (old installers mirrored to GitHub
Releases, pruned from tree); **meta-web deck pages** no longer link version-pinned
binaries that rot (now `index.html#download`); **daily cron now rebuilds meta-web**
(`npm run meta:site` step — it was staging those pages without regenerating them,
a real freshness bug); **8 dead CSS classes removed**.

**Top backlog for successor models** (full detail in the audit doc):
1. **`src/pages/Stats.tsx` is 1889 lines** — extract its ~8 sub-components into
   `src/components/stats/`. Pure mechanical refactor, great cheaper-model task.
2. Major dep bumps deferred (typescript 7, vite 8, vitest 4, plugin-react 6) —
   one at a time on a branch, not batched.
3. `arena.rs` process-watcher has thin test coverage; secondary-monitor limitation
   for toast/presence windows is owner-aware + unstarted.
4. **Owner-scoped, don't start without asking:** donations link, v3.0
   accounts+sync, Scryfall attribution (removed v2.2.1 as a deliberate trade),
   `.git` 1.1 GB history purge.

---

## Release artifacts (current)

| Target | File |
|--------|------|
| Windows | `website/downloads/Filthy-Net-Deck-Setup-2.5.1.exe` + `.sig` (sig key id 67FCA9900F523D49 byte-verified) |
| macOS | `website/downloads/Filthy-Net-Deck-2.5.1-universal.dmg` (rolled from tag CI) |
| Updater | `website/updater/latest.json` · soft channel `website/version.json` + `public/version.json` |
| Tag | `v2.5.1` |

Only 2.5.0 + 2.5.1 binaries live in the tree now; older versions are on GitHub
Releases (every past exe+sig+dmg mirrored there). Full release recipe is in the
`release-workflow` agent memory — follow it exactly. Sign ONLY with the
`67FCA9900F523D49` key; the repo-root `filthy-net-deck.key` is abandoned (wrong
pubkey) and silently breaks auto-update.

---

## Full local gate before every push

`npm run lint && npx tsc --noEmit && npm test`
then `cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test`

## Verification without Arena

`npm run dev`, then in the browser console seed `window.__fndStore.setState(...)`
with real Arena grpIds (e.g. Ethereal Armor 92065). Overlay/toast/presence windows
have demo routes: `/?demo#/overlay`. Browser-pane screenshots work; DOM /
`get_page_text` is the reliable check for content.

## Architecture must-knows

- **Four webviews:** `main` · `overlay` (match HUD) · `toast` (fullscreen-proof
  alerts) · `presence` (corner badge). **Every new window label MUST be in
  `src-tauri/capabilities/default.json` `windows`** or it gets no core
  permissions. `.transparent()` stays `#[cfg(not(macos))]` or the dmg CI breaks.
- **Single feed entry point:** `normalizeMetaBundle` in `src/services/deckHelpers.ts`
  (source sanitization, listNote stripping, normalization). Don't scatter it.
- A non-click-through always-on-top window must never own more pixels than it
  paints (dead zones over Arena) — the webview measures its content box, Rust
  matches exactly.

## Owner preferences (non-negotiable)

- Desktop only — no mobile / Android WR promises.
- Distribution: **website + signed in-app updater only** — no winget / Homebrew /
  Chocolatey / Store / Linux.
- Prefer **Update & restart** over browser download.
- Signing key `%USERPROFILE%\.tauri\filthy-net-deck.key` + password file next to
  it — **never commit, never echo**. Never sign with the repo-root key.
- Formats: **Standard + Pioneer only**; real lists only. Brew Lab stays pure (no
  AI, no invented cards).
- Batch several features per release; ask before product-scale decisions or
  releases; engineering hygiene may proceed.

## Do NOT touch without asking

- Owner WIP (dirty/untracked): `website/assets/youtube*`,
  `website/assets/video/`, `website/assets/_gen_youtube.py`,
  `website/assets/_compose_youtube_community.py`, `website/assets/launch/`,
  `website/assets/app-screenshot-decks.png`, `goal/`.
- Private signing keys · `.git` history rewrite (`docs/GIT-HISTORY-BLOAT.md`) ·
  cancelled tracks (packages, Store, Linux, cloud LLM).

## Quick map

| Need | Where |
|------|--------|
| Version / What's New | `package.json`, `src/version.ts`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `*/version.json` |
| Tracker / ranks / mulligans | `src-tauri/src/tracker.rs`, `src/types/tracker.ts` |
| Arena-open watcher / corner badge | `src-tauri/src/arena.rs`, `src-tauri/src/presence.rs`, `src/presence/PresenceApp.tsx` |
| Overlay (HUD + post-match + demo) | `src/overlay/OverlayApp.tsx`, `PostMatchSummary.tsx`, `demoLive.ts`, `src-tauri/src/overlay.rs` |
| Fullscreen-proof alerts | `src-tauri/src/toast.rs`, `src/toast/ToastApp.tsx` |
| Share cards | `src/services/shareKit.ts` + `deckShare / matchupShare / opponentShare / recapCard / shareCards.ts` |
| Brew Lab / grade | `src/services/brewLab.ts`, `src/pages/BrewLab.tsx` |
| Meta pipeline | `pipeline/build-meta.mjs`, `pipeline/build-sets.mjs`, `pipeline/build-meta-site.mjs`, `pipeline/sources/*` |
| Feed normalization (single entry) | `src/services/deckHelpers.ts` |
| Release rules | **`AGENTS.md`** (definition of done) + `release-workflow` agent memory |
| Marketing + OG | `website/index.html`, `website/assets/_gen_og.py` |
| Self-maintenance / freshness | `docs/MAINTENANCE.md` |
| This audit + backlog | `docs/AUDIT-2026-07-22-v2.5.0.md` |

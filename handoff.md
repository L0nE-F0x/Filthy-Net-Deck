# Filthy Net Deck — handoff

**Read this first.** Live top-of-todo across model/agent handoffs
(Claude ↔ Opus ↔ Grok ↔ Kimi).

**Live product version: v2.5.2** · repo `L0nE-F0x/Filthy-Net-Deck` · branch **`main`**.

**Session wrap (2026-07-22, Grok):** release train is **complete** (Windows +
macOS + updater + site). No open engineering work from this session. Resume by
picking from **Backlog** below; do not invent product work.

---

## Current state (as of wrap)

| Item | Status |
|------|--------|
| App version | **v2.5.2** (`package.json`, `src/version.ts`, Cargo, `tauri.conf.json`) |
| Branch | `main` synced with `origin/main` |
| Key commits | `68084aa` release hygiene · `8e8cb59` macOS dmg roll |
| Tag | `v2.5.2` (macOS CI already ran green) |
| Windows | `website/downloads/Filthy-Net-Deck-Setup-2.5.2.exe` + `.sig` |
| macOS | `website/downloads/Filthy-Net-Deck-2.5.2-universal.dmg` |
| Updater | `website/updater/latest.json` → 2.5.2 (key **67FCA9900F523D49**) |
| Soft channel | `website/version.json` + `public/version.json` → 2.5.2 |
| Site | Download buttons + OG `?v=2.5.2` |
| Live Netlify | version.json / updater / setup.exe / .sig / dmg all **200** @ 2.5.2 |
| Gates last green | **337** vitest · **33** cargo (2 ignored) · lint/tsc/clippy clean |
| `WHATS_NEW` | empty (hygiene release — no post-update banner) |

Tree keeps **current + previous** installers only (2.5.1 + 2.5.2). Older
binaries on GitHub Releases.

---

## What this session shipped (v2.5.2 hygiene)

1. **Stats extract** — `src/pages/Stats.tsx` ~1889 → ~457 lines. Panels in
   `src/components/stats/` (`StatusPanel`, `SummaryTiles`, `FormTiles`,
   `SplitsPanel`, `StatsArsenal`, `DeckBreakdown`, `MatchHistory`, `DeckDetail`,
   shared `statsUi.tsx`). Barrel guard: `statsExtract.test.ts`. Pure mechanical;
   browser seed via `window.__fndStore` confirmed home + deck detail.
2. **`docs/MAINTENANCE.md`** — fully-automatic table lists daily
   `npm run meta:site` / public `website/meta-web/` rebuild.
3. **`src-tauri/src/arena.rs`** — expanded lookalike negatives + pure
   `running_transition` edge-only helper (no AppHandle I/O theater).
4. **Full release train** — signed Windows (password file
   `%USERPROFILE%\.tauri\filthy-net-deck-key-password.txt` next to the key),
   updater + soft channels, OG regen, push `main`, tag `v2.5.2`, then roll
   macOS dmg from tag CI into downloads + fix site links.

Audit context: `docs/AUDIT-2026-07-22-v2.5.0.md` (P1/P2 hygiene items closed
in v2.5.2; major deps + owner P3 still open there).

---

## OPEN — needs owner (not agent-solo)

### 1. Netlify meta-web prod↔git drift (OPEN)

Live `/meta-web/deck/*.html` still serve a `/#download` HTML variant that
matches **no git commit**. Git has rot-free `index.html#download`.

- **User impact:** none (both hit homepage download; no version-pinned exes).
- **Why it didn’t self-heal:** v2.5.1 deploy + daily cron refreshed
  version/downloads to git, but meta-web HTML stayed old; `Cache-Control:
  max-age=300` for `/meta-web/*` in `netlify.toml` never showed up live
  (`max-age=0`). Suggests pinned deploy / auto-publish off / out-of-band
  `netlify deploy` for that path.
- **Owner action:** Netlify dashboard — is production locked? is auto-publish
  from git on? Clear cache + deploy. **Agents: git push only; never manual
  `netlify deploy`.**

### 2. Owner marketing WIP (dirty / untracked — DO NOT TOUCH)

Leave alone unless the owner explicitly asks:

- `website/assets/youtube*`, `video/`, `video_stills/`, `launch/`
- `website/assets/_gen_youtube.py`, `_compose_youtube_community.py`
- `website/assets/app-screenshot-decks.png`
- `scripts/capture-app-stills.mjs`, `generate_marketing_*.py`
- `goal/`

---

## Backlog for the next agent (pick with owner, or hygiene only)

**Do not cut a release unsolicited.** Batch product work; engineering hygiene
may proceed on judgment. Ask before product decisions.

| Priority | Item | Notes |
|----------|------|--------|
| Optional smoke | In-app **Update & restart** from an older build | Confirms signed path; not a code task |
| P2 eng | Major dep bumps **one branch at a time** | typescript 7, vite 8, vitest 4, plugin-react 6 — never batch |
| P2 product-aware | Secondary-monitor toast/presence | Owner-aware; follow Arena’s display — real work |
| P3 owner-only | Donations link · v3.0 accounts/sync · Scryfall attribution re-add · `.git` history purge | Ask first; attribution was a deliberate v2.2.1 trade |

**Good first resume prompts (owner should choose):**

1. “Check Netlify meta-web drift” (owner has dashboard).
2. “Bump one dep on a branch” (e.g. vitest 4 alone).
3. “Start secondary-monitor presence/toast” (product-ish — confirm first).
4. Marketing WIP finish (owner assets only).

---

## Release artifacts (current)

| Target | File |
|--------|------|
| Windows | `website/downloads/Filthy-Net-Deck-Setup-2.5.2.exe` + `.sig` |
| macOS | `website/downloads/Filthy-Net-Deck-2.5.2-universal.dmg` |
| Updater | `website/updater/latest.json` |
| Soft | `website/version.json` + `public/version.json` |
| Tag | `v2.5.2` |

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

Overlay/toast/presence demos: `/?demo#/overlay`.

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

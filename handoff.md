# Filthy Net Deck — handoff

**Read this first.** It's the live top-of-todo, kept current across model/agent
handoffs (Claude ↔ Opus ↔ Grok ↔ Kimi share it).

**Live product version: v2.5.2** · repo `L0nE-F0x/Filthy-Net-Deck` · branch **`main`**.

---

## v2.5.2 (2026-07-22, Grok) — hygiene batch release

Single version bump after the audit hygiene batch (no intermediate releases):

1. **Stats page extract** — `src/pages/Stats.tsx` (~1889 → ~457) split into
   `src/components/stats/` (`StatusPanel`, `SummaryTiles`, `FormTiles`,
   `SplitsPanel`, `StatsArsenal`, `DeckBreakdown`, `MatchHistory`, `DeckDetail`,
   shared `statsUi.tsx`). Pure mechanical; behavior-preserving. Barrel guard
   test: `src/components/stats/statsExtract.test.ts`.
2. **`docs/MAINTENANCE.md`** — fully-automatic table now lists public
   **meta-web** rebuild via daily `npm run meta:site`.
3. **`arena.rs` tests** — more lookalike negatives + pure
   `running_transition` edge-only helper (emit debounce without AppHandle I/O).
4. Gates: **337** vitest + **33** cargo tests (2 ignored). Signed Windows with
   key **67FCA9900F523D49**. macOS universal dmg still on **2.5.1** until tag CI
   produces 2.5.2 (site macOS buttons still point at 2.5.1 dmg honestly).

`WHATS_NEW` empty (no on-screen product change). Updater notes carry the summary.

**Still OPEN (owner Netlify dashboard):** live meta-web `/#download` drift vs
git `index.html#download` — not user-breaking; see v2.5.1 notes below.

---

## Prior: v2.5.1 (2026-07-22, Opus 4.8) — maintenance + meta-web edge note

Shipped the two v2.5.0-audit fixes that could only reach users via a rebuild:
dependency patches + dead-CSS removal. Prod↔git meta-web drift **OPEN** (needs
Netlify dashboard): live `/meta-web/deck/*.html` serve `/#download` variant not
in git; functionally fine (homepage download section). Rule: git push only,
never manual `netlify deploy`.

---

## Prior wrap-up: v2.5.0 focus pass + deep audit

See **`docs/AUDIT-2026-07-22-v2.5.0.md`**. UI declutter shipped; audit backlog
P1 Stats extract + MAINTENANCE meta-web row + arena tests closed in **v2.5.2**.

**Top backlog for successor models:**
1. ~~Stats.tsx extract~~ **DONE → v2.5.2**
2. Major dep bumps deferred (typescript 7, vite 8, vitest 4, plugin-react 6) —
   one at a time on a branch, not batched.
3. Secondary-monitor limitation for toast/presence — owner-aware, unstarted.
4. **Owner-scoped, don't start without asking:** donations link, v3.0
   accounts+sync, Scryfall attribution, `.git` 1.1 GB history purge.
5. Roll **macOS 2.5.2 dmg** from tag CI into `website/downloads/` + fix site links.

---

## Release artifacts (current)

| Target | File |
|--------|------|
| Windows | `website/downloads/Filthy-Net-Deck-Setup-2.5.2.exe` + `.sig` (sig key id 67FCA9900F523D49) |
| macOS | `website/downloads/Filthy-Net-Deck-2.5.1-universal.dmg` (2.5.2 pending tag CI) |
| Updater | `website/updater/latest.json` · soft channel `website/version.json` + `public/version.json` |
| Tag | `v2.5.2` |

Only 2.5.1 + 2.5.2 Windows binaries in tree (2.5.0 pruned; older on GitHub
Releases). Sign ONLY with the `67FCA9900F523D49` key; repo-root
`filthy-net-deck.key` is abandoned.

---

## Full local gate before every push

`npm run lint && npx tsc --noEmit && npm test`
then `cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test`

## Verification without Arena

`npm run dev`, then in the browser console seed `window.__fndStore.setState(...)`
with real Arena grpIds (e.g. Ethereal Armor 92065). Overlay/toast/presence windows
have demo routes: `/?demo#/overlay`.

## Architecture must-knows

- **Four webviews:** `main` · `overlay` · `toast` · `presence`. New window labels
  MUST be in `src-tauri/capabilities/default.json` `windows`.
- **Single feed entry point:** `normalizeMetaBundle` in `src/services/deckHelpers.ts`.
- Stats UI panels live under `src/components/stats/` (page shell in
  `src/pages/Stats.tsx`).

## Owner preferences (non-negotiable)

- Desktop only — no mobile / Android WR promises.
- Distribution: **website + signed in-app updater only**.
- Prefer **Update & restart** over browser download.
- Signing key `%USERPROFILE%\.tauri\filthy-net-deck.key` + password file —
  **never commit, never echo**.
- Formats: **Standard + Pioneer only**; real lists only.
- Batch features per release; ask before product-scale decisions or
  unsolicited releases; engineering hygiene may proceed.

## Do NOT touch without asking

- Owner WIP: `website/assets/youtube*`, `website/assets/video/`,
  `website/assets/_gen_youtube.py`, `website/assets/_compose_youtube_community.py`,
  `website/assets/launch/`, `website/assets/app-screenshot-decks.png`, `goal/`.
- Private signing keys · `.git` history rewrite · cancelled tracks.

## Quick map

| Need | Where |
|------|--------|
| Version / What's New | `package.json`, `src/version.ts`, `src-tauri/{Cargo.toml,tauri.conf.json}`, `*/version.json` |
| My Stats panels | `src/components/stats/*`, page `src/pages/Stats.tsx` |
| Arena process watcher | `src-tauri/src/arena.rs` |
| Meta pipeline | `pipeline/build-meta.mjs`, `pipeline/build-meta-site.mjs` |
| Release rules | **`AGENTS.md`** |
| This audit + backlog | `docs/AUDIT-2026-07-22-v2.5.0.md` |

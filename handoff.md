# Filthy Net Deck — handoff

**Last wrap-up:** 2026-07-20 (Grok) — session closed. **v1.9.0 fully released** (Win + macOS + signed updater + site + OG), live byte-verified on both hosts.  
**Next agent:** **Fable five / Claude Code** — owner has a **final pass** plus **a couple of tiny last-minute changes** they wrote down. Read this file + `AGENTS.md` + `100X-ROADMAP.md` before coding.

**Repo:** `L0nE-F0x/Filthy-Net-Deck` · branch **`main`** (tip should be `ccdca15` or later).  
**Live product version:** **v1.9.0**

| Artifact | Notes |
|----------|--------|
| Windows | `website/downloads/Filthy-Net-Deck-Setup-1.9.0.exe` (5,703,232 B) + `.sig` |
| macOS | `website/downloads/Filthy-Net-Deck-1.9.0-universal.dmg` (18,332,290 B) |
| Updater | `website/updater/latest.json` · soft channel `website/version.json` + `public/version.json` |
| Tag | `v1.9.0` (macOS CI already green; dmg rolled in `ccdca15`) |
| Marketing | OG / Twitter meta + `og-image.png?v=1.9.0` cache-bust |

**Live check (already done this session):**  
`https://filthy-net-deck.com/version.json` and legacy netlify host both return **1.9.0**; updater signature matches local `.sig`; exe + dmg Content-Length match local files; homepage shows 1.9.0.

---

## What this Grok session closed

### Release commits
- `39e227a` — C3 magic.gg lists + B2 mulligan/first-land + peels + git-bloat docs (source)  
- `14ca34c` — **Release v1.9.0** (signed Windows, updater, soft channel, site, OG)  
- `ccdca15` — **Roll v1.9.0 macOS** dmg + prune prior installers  

### Product that is now in the 1.9.0 binary / pipeline
| Area | Detail |
|------|--------|
| **B2** | Per-game `mulligans` + `firstLandTurn` in tracker (GRE); Game analytics + Splits keep-7; CSV columns |
| **C3** | magic.gg structured `<deck-list>` assignment; priority **MTGO → magic.gg → Goldfish**; Scryfall + listMatch gates; `pipeline/magic-gg.test.mjs` |
| **Earlier stack in same release** | B1 accept-tag, session wrap share, local coach chips, first-match toast, meta edge, field EV, queue WR, etc. (see 100X scoreboard) |
| **Peels** | `src/services/deckVersions.ts`, `climbChart.ts` (+ tests) |
| **Bloat** | Working tree downloads = current only; history still large — see `docs/GIT-HISTORY-BLOAT.md` (**no force-push without owner**) |

### Program status
100× active pillars are effectively **done** (cancelled: A1 packages, A2 Store, A3 Linux, B3 cloud LLM). Remaining is polish / owner nits / optional history rewrite — not a second roadmap.

---

## Your job (Fable / Claude Code)

1. **Owner’s final pass** — they have **tiny last-minute changes** written down; implement those first.  
2. Any extra polish they request; keep scope tight.  
3. If changes are **user-visible**, follow **`AGENTS.md` end-to-end release** (version bump + signed Windows + updater + site + OG + push + tag + macOS roll + live byte verify). Source-only is fine for pure docs/internal peels.  
4. Full local gate before every push:  
   `npm run lint && npx tsc --noEmit && npm test`  
   and `cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test`

---

## Owner preferences (non‑negotiable)

- Desktop only — no mobile / Android WR tracking promises.  
- Distribution: **website + signed in-app updater only** — no winget / Homebrew / Chocolatey / Store / Linux.  
- Prefer **Update & restart** over Chrome download for updates.  
- Signing key: `%USERPROFILE%\.tauri\filthy-net-deck.key` + password file next to it — **never commit, never echo**.  
- Formats: **Standard + Pioneer only**; real lists only.  

## Do **not** touch without asking

- Dirty / untracked owner WIP (leave alone unless they say otherwise):  
  `website/assets/youtube*`, `website/assets/video/`, `website/assets/_gen_youtube.py`, `website/assets/_compose_youtube_community.py`, `goal/`  
- Private signing keys.  
- Git history rewrite / force-push (document only: `docs/GIT-HISTORY-BLOAT.md`).  
- Cancelled product tracks (packages, Store, Linux, cloud LLM).

---

## Quick map for common edits

| Need | Where |
|------|--------|
| App version / What’s New | `package.json`, `src/version.ts`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` |
| Tracker / mulligans / first land | `src-tauri/src/tracker.rs`, `src/types/tracker.ts`, `src/services/gameAnalytics.ts` |
| Meta list sources | `pipeline/build-meta.mjs`, `pipeline/sources/magic-gg.mjs`, `listMatch.mjs`, `mtgo.mjs` |
| Marketing + OG | `website/index.html`, `website/assets/_gen_og.py` → `og-image.png` |
| Updater / soft channel | `website/updater/latest.json`, `website/version.json`, `public/version.json` |
| Release rules | **`AGENTS.md`** (definition of done table) |
| Program scoreboard | `100X-ROADMAP.md` |

---

## Suggested first steps for next agent

1. `git pull` · confirm `main` at/after `ccdca15` · `git status` clean except owner WIP above.  
2. Ask / read owner’s written tiny changes; implement those only first.  
3. Run the full gate; push; **only** version-bump if UI/product-visible.  
4. If releasing: full AGENTS checklist + independent live URL verify (not “push and assume”).

**Working tree note at handoff:** youtube asset WIP + `goal/` may be dirty/untracked — **owner’s**, not release residue.

Thanks — talk later.

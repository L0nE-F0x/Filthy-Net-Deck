# Filthy Net Deck — handoff for whichever agent picks this up next

**Audience:** Any coding agent continuing this project. The owner rotates between **Claude Code**, **Grok 4.5**, and **Kimi**.  
**Last wrap-up:** 2026-07-18 — Grok 4.5; shipped **v0.24.0** end-to-end (fullscreen topbar fix, Search label, full Standard Recently live, denser Settings).  
**Owner:** L0nE-F0x / ApexForge · [@MBrewlab](https://x.com/MBrewlab)  
**Repo:** https://github.com/L0nE-F0x/Filthy-Net-Deck  
**Live:** https://filthy-net-deck.netlify.app/

Read **`AGENTS.md`** first (release rules). Work queue: **`ROADMAP.md`**.

> **Release pacing:** Batch work. Do not ship many micro-versions in one day. Data-only (`npm run meta` / `npm run sets`) anytime. P0 hotfix may ship solo.

---

## Current ship status

| Item | Value |
|------|--------|
| **App version** | **0.24.0** |
| **Windows** | Signed `Filthy-Net-Deck-Setup-0.24.0.exe` + updater + version.json |
| **macOS** | Roll dmg after tag `v0.24.0` CI (site may still show prior dmg until then) |
| **Tests** | `npm test` — 73 pass |

### What 0.24 shipped

1. Fullscreen Exit / Close-to-tray moved into topbar (no overlap with theme + Search)
2. Top bar **Search** button (Ctrl+K remains shortcut)
3. Sets **Recently live** = full current Standard pool (Foundations → latest; slim previews for older)
4. **Settings** two-column denser layout + compact notification toggles

### Earlier (0.23)

Light mode, Arena `//` import fix, set trailers (Nauctis / Titanbreach / Zhalfir).

---

## Immediate next

1. Owner: verify Update & restart 0.23→0.24
2. Roll macOS dmg when CI finishes
3. Limited / Draft still **backburner** (owner deferred)
4. More trailers in `set-trailers.json` as WotC posts them
5. Next batch only when owner asks

---

## Key paths

| Concern | Files |
|---------|--------|
| Theme | `src/services/theme.ts`, `ThemeToggle.tsx`, `index.css` `data-theme` |
| Arena import | `src/services/arenaImport.ts`, pipeline `common.mjs` |
| Trailers | `set-trailers.json`, `setTrailers.ts`, `TrailerPlayer.tsx` |
| Settings layout | `src/pages/Settings.tsx`, `.settings-*` in `index.css` |
| Sets radar expand | `pipeline/sources/sets.mjs` (Standard pool + slim galleries) |
| Fullscreen chrome | `src/App.tsx` topbar-actions |

Signing: `%USERPROFILE%\.tauri\filthy-net-deck.key` + password file. Key id **67FCA9900F523D49**.

---

## Quick verify

```bash
npm test
npm run build
# Live: version.json + updater/latest.json → 0.24.0
```

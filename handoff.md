# Filthy Net Deck — handoff for whichever agent picks this up next

**Audience:** Any coding agent continuing this project. The owner rotates between **Claude Code** (Fable 5 / Sonnet), **Grok 4.5**, and **Kimi**. Nothing here is model-specific; follow it regardless of which model you are.  
**Last wrap-up:** 2026-07-18 — Grok 4.5; shipped **v0.23.0** end-to-end (light mode, Arena // import fix, set trailers — Windows signed live; macOS dmg via tag CI, roll when ready). 73 tests green.  
**Owner product voice:** L0nE-F0x / ApexForge; social: [@MBrewlab](https://x.com/MBrewlab) on X.  
**Repo:** https://github.com/L0nE-F0x/Filthy-Net-Deck  
**Live site / downloads / updater:** https://filthy-net-deck.netlify.app/  
**Studio:** https://ame-apexforge.org/

Read this file first, then **`AGENTS.md`** (authoritative release rules). Do not invent process that contradicts either.  
**Active work queue:** **`ROADMAP.md`** — milestones + open follow-ups. Work top to bottom; check items off as they ship.

> **⚠️ Release pacing (owner directive, 2026-07-17):** Do **not** ship four versions in a day again (0.14.1→0.17.0 happened once). **Batch** roadmap work into fewer, larger releases. Data-only (`npm run meta` / `npm run sets`) anytime without a version bump. Genuine P0 hotfix may ship solo.

---

## 1. What this product is

**Filthy Net Deck** is a **desktop-only** MTG Arena companion:

| Pillar | What it does |
|--------|----------------|
| **Daily meta** | Standard + Pioneer only — 8 ranked decks per format × Bo1/Bo3, real lists only |
| **Content engine (0.18)** | Daily archetype list diffs, meta-share timeline, you-vs-meta, week recap PNG, match-end toasts |
| **My Stats** | Local winrate tracker by tailing Arena `Player.log` (never leaves the PC) |
| **Matchup Lab** | Opponent tags / prep notes + WR vs tagged archetypes |
| **Climb Tracker** | Season rank graph, games-to-next-rank, win/loss streaks, season-vs-season (0.21) |
| **Set Radar** | Arena-first spoilers, galleries, legality, spoiler + B&R pulse banners, Arena-eve notify, **Future Standard** roadmap sets (0.22), **official trailers** in-app (0.23) |
| **Card watch (0.22)** | Ctrl+K palette — which meta decks play any card (copies/board), deck jump, page nav |
| **Appearance (0.23)** | Dark (default) / light theme — discreet top-bar + Settings toggle |
| **Arena import (0.23)** | Front-face-only for double-faced / adventure / room names (`//` stripped) |
| **Format hub (0.19/0.21)** | Standard rotation + ban lists, Pioneer pool; **rotation impact** per deck (0.21) |
| **Updates** | Signed in-app Update & restart (+ silent NSIS fallback on Windows) |

**Not:** mobile, Alchemy, seed/placeholder decks, cloud accounts, or “guessed” meta.

**Stack:** Tauri 2 + React 19 + TypeScript + Tailwind 4 + Zustand.  
**Rust side:** log tracker, silent installer, tray, plugins (opener, http, store, updater, process, notification, autostart).

**Brand:** “Built by ApexForge” → https://ame-apexforge.org/ (sidebar + Settings About + marketing footer). Keep on every release.

---

## 2. Current ship status (as of 2026-07-18 wrap-up)

| Item | Value |
|------|--------|
| **App version** | **0.23.0** — Light mode, Arena // import fix, official set trailers in-app |
| **Branch / HEAD** | `main` (after this release commit) |
| **Tag** | `v0.23.0` (push for macOS CI) |
| **Windows** | Signed installer + `.sig`: `website/downloads/Filthy-Net-Deck-Setup-0.23.0.exe` · updater `website/updater/latest.json` · soft channel `website/version.json` + `public/version.json`. Prefer **Update & restart**. |
| **macOS** | Still **0.22.0** dmg on site until tag CI + roll commit. |
| **Marketing** | Hero/OG lead with light mode + Arena fix + trailers; OG `?v=0.23.0` regenerated. |
| **Netlify** | Publish dir is **`website`**. Confirm live `version.json` / updater after push. |
| **Tests** | `npm test` — 73 pass (arenaImport 6, setTrailers 4 new). |

### Version arc (recent)

| Version | What shipped |
|---------|----------------|
| **0.22.0** | Future Standard + Ctrl+K card watch + Matchup Lab QoL |
| **0.23.0** | Light mode, Arena DFC import fix, set trailers in-app |

---

## 3. Immediate next tasks (for the next agent)

1. **Push + tag** if not done: `git push origin main` + `git tag v0.23.0 && git push origin v0.23.0` → macOS CI dmg → roll into `website/downloads/` + fix mac download labels.
2. **Owner:** verify in-app **Update & restart** 0.22→0.23 from an installed build.
3. **Owner marketing push** — post from [@MBrewlab](https://x.com/MBrewlab); OG card is `?v=0.23.0`.
4. **Trailers upkeep** — `pipeline/sources/set-trailers.json` (+ client `src/services/setTrailers.ts` fallback). When WotC drops a new announce trailer, add the YouTube id under `byName` / `byCode`. Never invent IDs. `npm run sets` attaches `trailer` on the feed.
5. **Future Standard upkeep** — `pipeline/sources/future-sets.json` (see `docs/MAINTENANCE.md`).
6. **Next product batch** — see `ROADMAP.md` "Suggested next".
7. **Do not** cut another app release unless the owner asks or a P0 appears — pacing policy.

---

## 4. Repo map (where to look)

```
Filthy Net Deck/
├── AGENTS.md                 # NON-NEGOTIABLE release / product rules
├── handoff.md                # this file
├── ROADMAP.md                # milestones + open follow-ups
├── docs/DATA-AND-UPDATES.md  # meta pipeline + updater overview
├── package.json              # version + scripts: meta, sets, test, tauri:build
├── vitest.config.ts          # unit tests for pure services
├── src/
│   ├── App.tsx               # shell, NAV, keyboard 1–7, splash, ThemeToggle
│   ├── version.ts            # APP_VERSION + WHATS_NEW
│   ├── pages/                # Daily, DeckView, Stats, Matchups, Climb, Sets, Settings, …
│   ├── components/           # TrailerPlayer, ThemeToggle, CommandPalette, …
│   ├── services/             # arenaImport, setTrailers, theme, …
│   └── store/useAppStore.ts  # prefs (theme, notify*, fullscreen, …)
├── src-tauri/                # Tauri + Rust tracker / tray / silent update
├── pipeline/                 # Node ESM builders (CI + local)
│   ├── sources/set-trailers.json  # curated WotC YouTube ids (0.23)
│   └── sources/future-sets.json
└── website/                  # Netlify publish root
```

### App navigation

| Key | Nav id | Label | Notes |
|-----|--------|--------|--------|
| `1` | `daily` | Decks | Meta + BanPulse + SpoilerPulse + timeline + you-vs-meta |
| `2` | `meta` | Events | Tournament links |
| `3` | `sets` | Sets | Set Radar + galleries + trailers (0.23) + Future Standard |
| `4` | `stats` | My Stats | Tracker + week recap PNG |
| `5` | `matchups` | Matchups | Matchup Lab |
| `6` | `climb` | Climb | Climb Tracker |
| `7` | `settings` | Settings | Theme (0.23), mode, alerts, autostart, updates |

---

## 5. Data architecture (critical)

**The desktop app does not scrape Goldfish/WotC for meta or spoilers.**  
It only downloads **published JSON** from Netlify:

| Feed | URL (prod) | Built by |
|------|------------|----------|
| Deck meta | `/meta/latest.json` | `npm run meta` (minified) |
| Dated archive | `/meta/YYYY-MM-DD.json` | same (pretty; used for list diffs) |
| Meta history | `/meta/history.json` | same |
| Set radar | `/meta/sets.json` | `npm run sets` (trailers + futureSets) |
| Soft updates | `/version.json` | app release |
| Hard updates | `/updater/latest.json` | app release (signed) |

**Local prefs key `bbi.prefs`:** `defaultMode`, `notifyArenaEve`, `notifyMatchEnd`, `notifyBanlist`, `fullscreen`, **`theme`** (`dark`|`light`, 0.23), `lastFormatId`.

---

## 6. Feature module map (don’t reimplement)

### v0.23.0 appearance + import + trailers (this session)

| Concern | Files |
|---------|--------|
| **Theme** | `src/services/theme.ts`, prefs `theme` in `useAppStore`, `ThemeToggle.tsx`, `html[data-theme="light"]` tokens in `index.css`, boot in `main.tsx` |
| **Arena // fix** | `src/services/arenaImport.ts` (`arenaCardName`, `sanitizeArenaImportText`) + tests; pipeline `sources/common.mjs`; DeckView rebuilds on copy (not raw pre-baked `arenaImport`) |
| **Trailers** | `pipeline/sources/set-trailers.json` → sets feed `trailer`; client fallback `setTrailers.ts`; `TrailerPlayer.tsx`; Sets cards + Future Standard; CSP allows youtube-nocookie frames |

### Earlier modules

See previous handoff sections in git history for 0.18–0.22 (content engine, format hub, B&R, card watch, Future Standard).

---

## 7. Workflow patterns

### Signing (Windows)

- Private key: `%USERPROFILE%\.tauri\filthy-net-deck.key` (**encrypted**) — minisign id **67FCA9900F523D49**
- Password file: `%USERPROFILE%\.tauri\filthy-net-deck-key-password.txt` (local only)
- Never use retired key id `65CB5BD2EA8C8ACB`

```powershell
$key = ([IO.File]::ReadAllText("$env:USERPROFILE\.tauri\filthy-net-deck.key") -replace '\s','').Trim()
$env:TAURI_SIGNING_PRIVATE_KEY = $key
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = (Get-Content "$env:USERPROFILE\.tauri\filthy-net-deck-key-password.txt" -Raw).Trim()
npm run tauri:build
```

### Release surfaces

```
website/downloads/Filthy-Net-Deck-Setup-<ver>.exe (+ .sig)
website/updater/latest.json
website/version.json + public/version.json
website/index.html + OG ?v=<ver>
```

---

## 8. Explicit non-goals

In-game overlay (ToS), price tracking, cloud sync, mobile/APK tracking promises, Alchemy/Historic, fabricated matchup/sideboard content.

**Deferred (needs owner assets):** marketing screenshot/GIF carousel at 1280×860.

---

## 9. Session notes (handoff out — 2026-07-18, Grok 4.5)

- Owner returned after Kimi’s v0.22.0 wrap with three product asks: light mode, Arena `//` import bug, set trailers. Shipped as **v0.23.0** batch end-to-end.
- Arena fix is client + pipeline: even old meta feeds with pre-baked `//` names sanitize on copy.
- Trailers: curated only (Nauctis `jPaHUxive30`, Titanbreach `cC6ebvZg-_Q` at ship). Add more via set-trailers.json when WotC posts them.
- Prefer **batched** product work; prefer **signed Update & restart**.
- When in doubt: **`AGENTS.md` > handoff > ROADMAP`.**

---

## 10. Quick verify commands

```bash
git status
git log -5 --oneline
npm test
npm run build
# Live after push:
# curl -s https://filthy-net-deck.netlify.app/version.json
# curl -s https://filthy-net-deck.netlify.app/updater/latest.json
```

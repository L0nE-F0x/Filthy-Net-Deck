# Filthy Net Deck — handoff

**Last wrap-up:** 2026-07-19 — **v1.3.0 fully live** (Windows signed installer + Netlify + tag `v1.3.0`).  
**Next agent charter:** **Polish the in-game overlay** (beauty + UX + density) without regressing perf or privacy. Owner may hand this to **Kimi K3** (frontend-focused).

Read **`AGENTS.md`** first. Any user-visible change is incomplete until the **full release checklist** ships (version bump, signed build, updater, site, OG). Source-only is not a release.

---

## Where we are

| Item | Value |
|------|--------|
| Version | **1.3.0** (Windows) |
| Commit / tag | `8bd7fac` / `v1.3.0` |
| macOS | **1.1.1** dmg still on site until tag CI dmg is rolled |
| Windows | `website/downloads/Filthy-Net-Deck-Setup-1.3.0.exe` (+ `.sig`) |
| Soft / updater | `website/version.json` + `public/version.json` + `website/updater/latest.json` → **1.3.0** |
| Live site | https://filthy-net-deck.netlify.app/ |

Signing: `%USERPROFILE%\.tauri\filthy-net-deck.key` (encrypted). Password is local-only — never commit.

---

## What just shipped (v1.3.0) — context for the next model

### Product

Desktop MTG Arena companion (Tauri 2 + React + TypeScript). **Desktop only.** Formats: **Standard + Pioneer** only. Tracker is **local `Player.log` tail** — nothing leaves the machine.

### Headline feature: **in-game overlay deck tracker**

Always-on-top transparent window during ranked/play matches:

| Capability | Behavior |
|------------|----------|
| Show / hide | Auto on match start (`Playing`), brief result flash on end, then hide |
| Default UI | **Collapsed slim bar** (less invasive); expand with ▾ |
| Library list | Remaining mainboard cards, mini Scryfall art, **next-draw %**, land rows sorted first |
| Lands | Bar badge e.g. `14L` + % of library |
| Geometry | Drag top bar, resize edges, **edge-snap**, persist to app-data `overlay-geometry.json` |
| Control | Settings toggle + tray “In-game overlay” |
| Privacy | Local GRE parse only; no Arena injection |

### Also in 1.3.0

- **Match-end desktop toasts** default **ON** (were OFF — why users never saw them)
- Settings: **Send test notification** + OS permission status
- Overlay **perf work**: dirty-only `tracker:live` emits, skip full GRE JSON unless `gameObjects` / library zones, **no CSS backdrop-filter blur**, rAF-coalesced React updates, Scryfall meta cached in `localStorage`

### Owner feedback trail (why polish still matters)

1. First HUD was “premium but invasive” and low-info → added deck tracker + collapse.
2. Still not Untapped-level (art, odds, lands) → added those; default collapsed; denser column.
3. Arena lag with `tauri:dev` ± Untapped → perf passes above; **always judge FPS on release build**, not dev.
4. Owner was happy enough to **ship 1.3.0 live** — next step is **visual/UX refinement**, not a greenfield rewrite.

**Untapped bar to chase (inspiration, not clone):** denser mini-art column, clearer odds, land stats, low visual noise, zero Arena focus steal.

---

## Architecture (overlay)

```
Player.log ──tail──► LogParser (Rust tracker.rs)
                        │
                        ├─ tracker:match      → main UI + match-end notify
                        ├─ tracker:status
                        └─ tracker:live       → overlay webview (show/hide owned by Rust)
```

| Layer | Path | Role |
|-------|------|------|
| Rust window | `src-tauri/src/overlay.rs` | Create/show/hide overlay webview; enable flag; geometry persist |
| Rust live data | `src-tauri/src/tracker.rs` | `LiveMatch`, `LiveCardCount`, `DeckTracker` (library remaining from GRE) |
| App wiring | `src-tauri/src/lib.rs` | Commands + tray check item |
| Capabilities | `src-tauri/capabilities/default.json` | `main` + `overlay` window perms |
| Entry | `src/main.tsx` | `#/overlay` → `OverlayApp` (not full `App`) |
| UI | `src/overlay/OverlayApp.tsx` | Bar, list, art, %, snap/resize handlers |
| Styles | `src/index.css` (section `In-game overlay HUD`) | No blur; solid-ish dark glass |
| Card meta | `src/services/arenaMeta.ts` | Arena grpId → Scryfall name/type/land/art; disk cache |
| Pref bridge | `src/services/overlay.ts` + `useAppStore` `overlayEnabled` | Settings ↔ Rust |
| Notify | `src/services/notify.ts` | Test toast + permission helpers |
| Types | `src/types/tracker.ts` | `LiveMatch`, `LiveCardCount` |

### Key behaviors to preserve when polishing

- **Never `set_focus` on overlay** (Arena input).
- **Rust owns show/hide** so tray-hidden main WebView can miss events.
- **Emit `tracker:live` only when dirty** (`live_dirty` / library change) — do not reintroduce per-GRE-line WebView thrash.
- **No backdrop-filter / heavy blur** on always-on-top HWND (GPU cost).
- Prefer **borderless windowed** Arena if exclusive fullscreen covers the panel (document in Settings if you touch copy).
- **Draft overlay stays out of scope** (ToS risk). Constructed library tracker is in.

### Dev commands

```bash
npm install
npm run tauri:dev    # heavy — not for FPS judgment
npm run tauri:build  # set TAURI_SIGNING_* for updater artifacts
npm test
```

Arena: enable **Detailed Logs (Plugin Support)**. Overlay needs a finished GRE `deckMessage` + hand/library zone diffs.

---

## Next work (for Kimi / frontend polish)

**Primary goal:** Make the overlay **more beautiful and more usable** while staying **discreet** and **cheap**.

Suggested direction (owner-aligned):

1. **Visual system** — typography, spacing, art framing, qty/% columns, land vs spell hierarchy; match Filthy Net Deck acid/gold brand without loud chrome.
2. **Information design** — clearer next-draw %, optional land line, maybe CMC grouping or mana pips if free/local; avoid clutter.
3. **Collapsed bar** — even smarter one-line status (opp · library · lands) when collapsed.
4. **Motion** — subtle only; no continuous animations that burn GPU mid-match.
5. **Settings** — opacity slider, default expanded/collapsed, optional click-through later (only if solid).
6. **Do not** rebuild the GRE parser unless a real tracking bug is found; fix bugs with fixtures in `tracker.rs` tests.

### Explicit non-goals this pass

- Cloud sync, mobile, Alchemy/Historic, price tracking, draft helper  
- Fabricated matchup/sideboard advice  
- Claiming ship complete without AGENTS.md full release if UI changes ship  

### When polish is ready to ship

Full checklist in **`AGENTS.md`**: bump `package.json` / `src/version.ts` / `src-tauri/{Cargo.toml,tauri.conf.json}`, signed Windows build, `website/downloads/*`, `updater/latest.json`, both `version.json`, `website/index.html` + OG image `?v=`, push `main` (+ tag if macOS).

---

## Session leftovers (ignore unless needed)

- Untracked: `goal/`, `website/_raw_git.bin` — not part of release; do not commit junk.
- macOS: after GH Actions dmg for `v1.3.0`, roll into `website/downloads/` and fix macOS links (pattern from past “Roll vX out to macOS” commits).

---

## Branding

ApexForge credit (“Built by ApexForge” → https://ame-apexforge.org/) on marketing footer and in-app sidebar/Settings About — keep on every release.

---

## One-liner for the next agent

> **v1.3.0 is live with a working in-game overlay deck tracker (Rust GRE + Tauri second window + React `#/overlay`). Your job is frontend refinement: make it as beautiful and information-dense as Untapped’s bar, without invasiveness or FPS regressions. Start at `src/overlay/OverlayApp.tsx` + overlay CSS in `src/index.css`; respect AGENTS.md release rules before claiming shipped.**

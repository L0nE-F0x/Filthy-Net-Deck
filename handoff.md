# Filthy Net Deck — handoff

**Last wrap-up:** 2026-07-19 — **v1.3.5 fully live** (Windows signed installer + Netlify + tag `v1.3.5`).  
**Next agent charter:** **macOS roll** (pull `v1.3.5` CI dmg into `website/downloads/` + site links), then further overlay/UX polish only if owner asks.

Read **`AGENTS.md`** first. Any user-visible change is incomplete until the **full release checklist** ships (version bump, signed build, updater, site, OG). Source-only is not a release.

---

## Where we are

| Item | Value |
|------|--------|
| Version | **1.3.5** (Windows) |
| Windows | `website/downloads/Filthy-Net-Deck-Setup-1.3.5.exe` (+ `.sig`) |
| macOS | **1.1.1** dmg still on site until tag CI dmg is rolled |
| Soft / updater | `website/version.json` + `public/version.json` + `website/updater/latest.json` → **1.3.5** |
| Live site | https://filthy-net-deck.netlify.app/ |

Signing: `%USERPROFILE%\.tauri\filthy-net-deck.key` (encrypted; password in `filthy-net-deck-key-password.txt` next to it — local only, never commit).

---

## What just shipped (v1.3.5) — overlay polish pass (Kimi)

Frontend refinement of the v1.3.0 in-game overlay, per this handoff's charter:

| Area | Change |
|------|--------|
| **Information design** | Library now groups into **Lands / Creatures / Spells** sections (type-line driven), sorted by cmc; each row shows **mana pips** + next-draw % with a subtle heat wash. |
| **Art** | Rows use Scryfall **art_crop** (was full-card `small` — looked like unreadable shrunken cards). `arenaMeta` cache bumped to `bbi.arenaMeta.v2` and now also stores `cmc` + `manaCost`. |
| **Collapsed bar** | **Real slim strip** — window shrinks to 34px (Rust `MIN_H` 120→32); expanding restores the remembered height and clamps on-screen. N/S/SE resize handles hidden while collapsed. |
| **Bar content** | `vs` micro-label, opp, library chip, land chip (`16L 45.7%`), expand chevron. Ended: **Victory/Defeat/Draw pill**. |
| **Sub row** | Deck name, season record, Bo1/Bo3 chip, **match clock** (1 Hz text tick only while playing — no continuous animation). |
| **Settings** | New **opacity slider** (55–100%) + **Start expanded** toggle (prefs `overlayOpacity` / `overlayStartExpanded` in `bbi.prefs`, read live by overlay webview via `storage` events). Copy de-dev-ified (no more `tauri:dev` mention). |
| **Pure logic** | `src/overlay/overlayModel.ts` (group/sort/pips/clock/opacity) + `overlayModel.test.ts` (112 vitest tests total, 16 Rust tests — all green). |

Perf/privacy invariants kept: no backdrop-filter, dirty-only `tracker:live` emits, rAF-coalesced updates, Rust owns show/hide, never `set_focus`, memoized rows.

---

## What shipped before (v1.3.0) — context

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

## Next work

1. **macOS roll** — after GH Actions builds the `v1.3.5` dmg, pull it into `website/downloads/` and fix macOS download links (pattern from past "Roll vX out to macOS" commits).
2. **Further overlay ideas (only if owner asks):** click-through mode, per-deck art size, sideboard view between Bo3 games, WUBRG deck-color pips. Keep the perf/privacy invariants.
3. **Deferred** stays deferred (draft hub, cloud, Alchemy, prices, Events overhaul).

### When the next UI change ships

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

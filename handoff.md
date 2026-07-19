# Filthy Net Deck — handoff

**Last wrap-up:** 2026-07-19 — **Grok review of Kimi’s v1.3.5 overlay polish** (already live on Windows + Netlify).  
**Next agent:** **v1.4.0 "Bells & Whistles" batch is IN PROGRESS on branch `release/v1.4.0`.**
➡️ **Read [`HANDOFF-v1.4.0.md`](HANDOFF-v1.4.0.md) first** — it has exactly what to do next (**#2** overlay hardening → **#3** a11y/reduced-motion → **#4** empty states). #1 share cards + overlay theme sync are already done & committed on that branch.

Read **`AGENTS.md`** first. User-visible changes still need the full release checklist if you fix anything that ships. The v1.3.5 audit note below stays valid for the overlay invariants.

---

## ✅ Claude Code audit — v1.3.5 (2026-07-19)

**Verdict: ship-clean. No blockers.** Audited at HEAD `66ff2cf` (post macOS roll).

- **Gates green:** `npm test` **112/112** · `npx tsc --noEmit` clean · `cargo check --lib` clean.
- **Surfaces consistent at 1.3.5, Windows + macOS at parity:** app binary (4 files), `version.json` ×2, `updater/latest.json` (**signature present**), Windows `.exe`+`.sig` and macOS `1.3.5-universal.dmg` in `downloads/`, `index.html` (**19× 1.3.5, 0 stale `1.1.1`**; 2 links → the real dmg), OG/Twitter `?v=1.3.5`. No secrets tracked (only the correct `.exe.sig`).
- **macOS `transparent()` fix (`b131aa6`) reviewed — correct:** `#[cfg(not(target_os = "macos"))]` gate + shadowing bindings (no `mut`) + `.overlay-macos` CSS (`index.css`) + `navigator.userAgent` detection (`OverlayApp.tsx`). See memory `tauri-transparent-macos-gotcha`.
- **Grok P1 re-confirmed:** the 1 Hz clock re-render is **mitigated by existing memoization** (`groups`/`metaMap`/`maxPct` stable, `GroupSection`/`CardRow` `memo`'d → only the shell + clock span repaint) — not a bug. Opacity + `startExpanded` cross-webview are **graceful-degradation only** (persistent overlay webview); confirm live opacity update on a real Windows build.
- **Hygiene:** removed 0-byte `website/_raw_git.bin` stray.

**Staged for the NEXT version (do not ship source-only):** null-Scryfall-cache fix on branch **`fix/arena-meta-null-cache`** (`b1e760b`). A transient offline Scryfall hit was persisted as `null`, poisoning that card (`Card {grpId}`) until a cache-key bump; the fix makes nulls a session-only negative cache (skipped on load + persist) so it self-heals next session. User-visible → fold into the next release via the full AGENTS checklist.

---

## Where we are

| Item | Value |
|------|--------|
| Version | **1.3.5** (Windows + macOS at parity) |
| Release commit | `5868c34` — *Release v1.3.5: in-game overlay, refined* (+ `b131aa6` macOS build fix) |
| Tag | **`v1.3.5`** → `b131aa6` (moved once to pick up the macOS fix) |
| Windows | `website/downloads/Filthy-Net-Deck-Setup-1.3.5.exe` (+ `.sig`) |
| macOS | `website/downloads/Filthy-Net-Deck-1.3.5-universal.dmg` (CI on re-tag; `transparent()` was the build-breaker) |
| Soft / updater | `version.json` + `updater/latest.json` → **1.3.5** (live verified) |
| Live site | https://filthy-net-deck.netlify.app/ |

Signing: `%USERPROFILE%\.tauri\filthy-net-deck.key` (encrypted). Password is **local only** — never commit. (If a `filthy-net-deck-key-password.txt` sits next to the key, keep it gitignored.)

---

## Lineage (session stack)

| Step | Who | Outcome |
|------|-----|---------|
| **v1.3.0** | Grok | Overlay MVP: GRE library tracker, live window, art/odds/lands, notify defaults, perf invariants, full AGENTS ship |
| Polish charter | Grok | `handoff.md` pointed Kimi at beauty + density without FPS regression |
| **v1.3.5** | Kimi | Frontend refinement + full release ship (already on Netlify) |
| **This note** | Grok | Code review + audit checklist for Claude Code |

---

## What Kimi shipped in v1.3.5 (summary)

| Area | Change |
|------|--------|
| **Information design** | Library grouped **Lands / Creatures / Spells** (type-line), sorted by CMC; rows show **mana pips** + next-draw % with heat wash (`--int`) |
| **Art** | Scryfall **`art_crop`** (was full-card `small`); cache key `bbi.arenaMeta.v2` + `cmc` / `manaCost` |
| **Collapsed bar** | Real slim strip — window → **34px** (`MIN_H` 32 in Rust); expand restores remembered height; N/S/SE resize hidden when collapsed |
| **Bar / end state** | vs + opp, library chip, land chip; **Victory/Defeat/Draw** pills |
| **Sub row** | Deck, season record, Bo chip, **match clock** (1 Hz while playing) |
| **Settings** | **Opacity 55–100%**, **Start expanded**; prefs in `bbi.prefs`; overlay reads via `storage` events |
| **Pure logic** | `src/overlay/overlayModel.ts` + `overlayModel.test.ts` |

Grok verification (this review): **`tsc` clean**, **112 vitest tests green** (incl. 14 overlay model), live **version.json / updater = 1.3.5**.

---

## Grok review (for Claude Code)

### Verdict

**Approve with notes — not a rewrite.** Kimi delivered a coherent polish pass that matches the charter: denser Untapped-adjacent information design, true collapse, Settings affordances, pure logic extracted + tested, release path completed. Safe for Claude to **audit for bugs/hygiene** rather than redesign.

### What looks solid

1. **`overlayModel.ts` split** — group/sort/pips/clock/opacity are unit-tested; right place for pure functions.
2. **Collapse geometry** — `programmaticResize` guard + `expandedH` + not persisting collapsed height as “real” geometry is thoughtful.
3. **art_crop** — correct call for mini row art; v2 cache bump avoids stale small-card thumbs.
4. **Perf invariants mostly held** — no backdrop-filter; rAF live coalesce; dirty GRE path from 1.3.0 still in Rust (Kimi didn’t reintroduce per-line spam in tracker).
5. **Ship discipline** — installer + updater + site + OG bumped (version jump 1.3.0 → **1.3.5** is a bit odd numbering-wise, but consistent end-to-end).

### Issues / audit targets (priority order)

#### P1 — worth confirming or fixing

1. **1 Hz match clock re-renders the whole `OverlayApp`**  
   `setNow` every second while `playing` re-renders groups + all rows. Prefer extracting a tiny `MatchClock` child so only the clock node updates, or drive clock from a ref/DOM text update.

2. **`storage` event for opacity may not fire in all Tauri setups**  
   Overlay listens to `window.storage` for main-window prefs. Same-origin multi-webview usually works; if opacity slider doesn’t live-update the open overlay, add a Tauri event (`prefs:overlay`) or re-read prefs on focus/visibility. Verify on real Windows build.

3. **`startExpanded` only applies at overlay mount**  
   Changing Settings mid-session won’t re-expand an already-open overlay until next match window create. Acceptable if documented; otherwise re-read on `tracker:live` playing transition.

4. **Layering: `useAppStore` imports `overlay/overlayModel`**  
   Store → overlay presentation util couples main app to overlay module. Fine short-term; if you move files, consider `src/services/overlayPrefs.ts` for `normalizeOpacity` only.

5. **Null Scryfall meta cached permanently**  
   Failed resolves store `null` in v2 cache → card stays “Card {grpId}” until cache clear. Consider TTL or not persisting nulls (retry next session).

#### P2 — polish / edge cases

6. **Hybrid mana** — `pipTone("W/U")` uses first letter only; `pipText` → `"WU"`. Acceptable; dual-color pip styling optional.
7. **Pips dropped when >5 symbols** — intentional to avoid clutter; rare (e.g. huge green stompy costs).
8. **Heat wash (`--int`)** — verify CSS doesn’t look like a loud bar under gold theme; should stay subtle mid-match.
9. **Collapsed 34px vs Windows min window chrome** — if some OS builds clamp taller than 34, bar may clip; smoke-test on owner machine.
10. **Version skip 1.3.1–1.3.4** — cosmetic; next patch can be 1.3.6 or 1.4.0.

#### P3 — out of scope unless owner asks

- Click-through, sideboard between Bo3 games, WUBRG deck pips  
- GRE parser changes (only if tracking wrong mid-match)  
- Draft overlay  

### Must not regress

- Never `set_focus` overlay  
- Rust owns show/hide  
- Dirty-only `tracker:live`  
- No backdrop-filter / heavy blur  
- Local-only tracking; no draft helper  
- ApexForge credit stays  

### Suggested Claude Code pass

```
1. Read AGENTS.md + this handoff.
2. Smoke-read: OverlayApp.tsx, overlayModel.ts, arenaMeta.ts, overlay.rs, Settings overlay section, useAppStore prefs.
3. Run: npm test && npx tsc --noEmit  (and cargo test --lib if touching Rust).
4. Fix only P1 items that reproduce, or clear ship-hygiene gaps (gitignore password file, tag check, macOS note).
5. If UI changes ship → full AGENTS checklist (do not claim live after source-only).
6. Leave a short audit note in handoff.md when done.
```

---

## Architecture map (current)

| Layer | Path |
|-------|------|
| Rust window | `src-tauri/src/overlay.rs` |
| GRE + live | `src-tauri/src/tracker.rs` (`LiveMatch`, `DeckTracker`) |
| UI | `src/overlay/OverlayApp.tsx` |
| Pure model + tests | `src/overlay/overlayModel.ts`, `overlayModel.test.ts` |
| Styles | `src/index.css` (`In-game overlay HUD`) |
| Meta/art | `src/services/arenaMeta.ts` (`bbi.arenaMeta.v2`) |
| Prefs | `useAppStore` + Settings; overlay reads `bbi.prefs` |
| Entry | `src/main.tsx` → `#/overlay` |

### Dev

```bash
npm install
npm run tauri:dev    # not for FPS judgment
npm run tauri:build  # TAURI_SIGNING_* for real updater artifacts
npm test
```

Arena: **Detailed Logs (Plugin Support)** on.

---

## Next product work (after audit)

1. ~~**macOS roll**~~ — done: v1.3.5 universal dmg on site (tag CI after `transparent()` fix)  
2. Owner ladder feedback only  
3. Deferred: draft hub, cloud, Alchemy, prices  

---

## Branding

ApexForge (“Built by ApexForge” → https://ame-apexforge.org/) on footer + sidebar/Settings About.

---

## One-liner for Claude Code

> **v1.3.5 is already live** (Kimi polish of Grok’s v1.3.0 overlay). **Audit, don’t redesign.** Confirm P1 items (clock re-render, opacity cross-webview prefs, null Scryfall cache); keep perf/privacy invariants; full AGENTS ship only if you change user-visible behavior.

# Filthy Net Deck — handoff

**Last wrap-up:** 2026-07-19 — **Grok 4.5 shipped v1.4.0 "Bells & Whistles"** (#5 sound + full AGENTS Windows release). Prior: Kimi #1–#4 on `release/v1.4.0`.
**Next agent:** Smoke-test Update & restart + sound prefs on Windows; macOS dmg already rolled. Owner ladder feedback / deferred work only.

➡️ Canonical batch detail: [`HANDOFF-v1.4.0.md`](HANDOFF-v1.4.0.md). Read **`AGENTS.md`** before any user-visible change.

---

## Where we are

| Item | Value |
|------|--------|
| Version | **1.4.0** (Windows signed + macOS universal dmg at parity) |
| Theme | Bells & Whistles — share cards, overlay harden, a11y, opt-in sound |
| Windows | `website/downloads/Filthy-Net-Deck-Setup-1.4.0.exe` (+ `.sig`) |
| macOS | `website/downloads/Filthy-Net-Deck-1.4.0-universal.dmg` (CI on `v1.4.0`) |
| Soft / updater | `version.json` + `updater/latest.json` → **1.4.0** |
| Live site | https://filthy-net-deck.netlify.app/ |

Signing: `%USERPROFILE%\.tauri\filthy-net-deck.key` (encrypted). Password local only — never commit.

---

## What shipped in v1.4.0

| Area | Change |
|------|--------|
| **Share cards (#1)** | Branded deck PNG from My Stats (list + WR + scopes) |
| **Overlay theme** | Planeswalker skin accents live on HUD |
| **Overlay harden (#2)** | MatchClock split, `prefs:overlay`, click-through |
| **A11y / empties (#3–4)** | Reduced motion, live regions, DeckView first-run coach |
| **Sound (#5)** | Opt-in OFF default, 3 cue sets, win/loss/draw/rank-up; not in overlay |
| **Micro** | Count-up stats, toast slide-in, rank-up banner |
| **Fix** | Null Scryfall cache no longer poisons cards across sessions |

---

## Must not regress

- Never `set_focus` overlay · Rust owns show/hide · dirty-only `tracker:live`
- No backdrop-filter · local-only tracking · no draft helper · ApexForge credit

---

## Next product work

1. macOS roll for **1.4.0** after tag CI  
2. Owner ladder feedback only  
3. Deferred: draft hub, cloud, Alchemy, prices  

---

## One-liner for the next agent

> **v1.4.0 is the Bells & Whistles cut** (Windows signed path completed in-session). Verify Netlify + tag macOS; do not re-litigate #5 sound unless the owner rejects a cue set.

# Filthy Net Deck — handoff

**Last wrap-up:** 2026-07-19 — **Grok 4.5 shipped v1.4.1** (Events freshness, share redesign, Soundscape, Ugin & Garruk) on top of v1.4.0 Bells & Whistles.
**Next agent:** Smoke-test share menus + Soundscape + new themes on Windows; roll **1.4.1** macOS dmg when tag CI finishes. Owner ladder feedback / deferred work only.

Read **`AGENTS.md`** before any user-visible change.

---

## Where we are

| Item | Value |
|------|--------|
| Version | **1.4.1** (Windows signed; macOS dmg via tag CI — site may still serve 1.4.0 dmg interim) |
| Windows | `website/downloads/Filthy-Net-Deck-Setup-1.4.1.exe` (+ `.sig`) |
| Soft / updater | `version.json` + `updater/latest.json` → **1.4.1** |
| Live site | https://filthy-net-deck.netlify.app/ |

Signing: `%USERPROFILE%\.tauri\filthy-net-deck.key` (encrypted). Password local only — never commit.

---

## What shipped in v1.4.1

| Area | Change |
|------|--------|
| **Events** | Client + pipeline drop tournaments older than ~120 days (no more 2020 Melee test rows) |
| **Share** | `ShareMenu` popover (readable dark mode) for deck cards; consistent share chrome for climb / recap / theme |
| **Soundscape** | Pack cards + per-cue previews (Victory / Defeat / Draw / Rank up / Soft click) + pack demo |
| **Themes** | **Ugin** (slate) + **Garruk** (forest) — CSS tokens retint overlay accents like other skins |

---

## Must not regress

- Never `set_focus` overlay · Rust owns show/hide · dirty-only `tracker:live`
- No backdrop-filter · local-only tracking · no draft helper · ApexForge credit
- Sound remains **opt-in / OFF by default** · never in overlay

---

## One-liner

> **v1.4.1 is the polish cut** on Bells & Whistles. Verify Netlify + macOS roll after tag CI.

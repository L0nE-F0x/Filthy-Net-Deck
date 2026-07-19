# Filthy Net Deck — handoff

**Last wrap-up:** 2026-07-20 — **Grok 4.5 shipped through v1.4.4** (tooltips + Events/Stats polish on the v1.4.0 Bells & Whistles line).
**Next agent:** Confirm live Netlify + macOS **1.4.4** dmg at parity if CI was rolled; owner feedback / deferred only. Read **`AGENTS.md`** first.

---

## Where we are

| Item | Value |
|------|--------|
| Version | **1.4.4** (Windows signed + macOS universal dmg at parity) |
| Windows | `website/downloads/Filthy-Net-Deck-Setup-1.4.4.exe` (+ `.sig`) |
| macOS | `website/downloads/Filthy-Net-Deck-1.4.4-universal.dmg` |
| Soft / updater | `version.json` + `updater/latest.json` → **1.4.4** |
| Live site | https://filthy-net-deck.netlify.app/ |
| Tag | `v1.4.4` |

Signing: `%USERPROFILE%\.tauri\filthy-net-deck.key` (encrypted). Password local only — never commit.

---

## Line since v1.4.0 (condensed)

| Ver | Theme |
|-----|--------|
| **1.4.0** | Bells & Whistles: share, overlay harden, a11y, opt-in sound |
| **1.4.1** | Events freshness, share UX, Soundscape, Ugin & Garruk |
| **1.4.2** | Events: allow magic.gg + MTGO hosts (empty list fix) |
| **1.4.3** | Drop Meta Trackers; deck table last-played sort + tooltips |
| **1.4.4** | Tooltip pass: Climb, Matchups, Decks, Deck detail |

---

## Must not regress

- Never `set_focus` overlay · Rust owns show/hide · dirty-only `tracker:live`
- No backdrop-filter · local-only tracking · no draft helper · ApexForge credit
- Sound **opt-in / OFF by default** · never in overlay
- Events: freshness ~120d + allowlist includes **magic.gg** and **mtgo.com**

---

## Housekeeping / uncommitted local noise

Owner YouTube marketing assets + optional marketing-video work may sit uncommitted — **do not delete**. Ship product via AGENTS checklist only.

---

## One-liner

> **v1.4.4 is current** at full Win + macOS parity. AGENTS release surfaces aligned (OG, site, updater, dmg).

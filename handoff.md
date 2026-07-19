# Filthy Net Deck — handoff

**Last wrap-up:** 2026-07-20 — **Grok 4.5 shipped v1.5.0 Brew Lab** (pure meta list clinic, no AI).
**Next agent:** Smoke Brew Lab on a real tracked deck with a list; roll **1.5.0** macOS dmg after tag CI if not already. Read **`AGENTS.md`** first.

---

## Where we are

| Item | Value |
|------|--------|
| Version | **1.5.0** (Windows signed; macOS via tag CI) |
| Headline | **Brew Lab** — shape/staples clinic vs ranked Bo1/Bo3 peers |
| Soft / updater | `version.json` + `updater/latest.json` → **1.5.0** |
| Live site | https://filthy-net-deck.netlify.app/ |

Signing: `%USERPROFILE%\.tauri\filthy-net-deck.key` (encrypted). Password local only — never commit.

---

## Brew Lab (v1.5.0)

| Piece | Path |
|-------|------|
| Pure logic | `src/services/brewLab.ts` (+ tests) |
| UI | `src/components/BrewLabPanel.tsx` |
| Entry | My Stats → deck detail (below tracked list) |

**Rules:** no LLM, no invented cards. Staples only from today’s ranked meta mains/sides. Uses existing Arena id → name resolve (same as Stats art). Mode toggle Bo1/Bo3; format Auto/Standard/Pioneer.

---

## Must not regress

- Never `set_focus` overlay · Rust owns show/hide · dirty-only `tracker:live`
- No backdrop-filter · local-only · ApexForge credit
- Sound opt-in OFF · never in overlay
- Events: freshness + magic.gg/mtgo allowlist
- Brew Lab: **no AI / no hallucinated card names**

---

## One-liner

> **v1.5.0 = Brew Lab** (deterministic peer-shape clinic on My Stats deck detail). Full AGENTS ship.

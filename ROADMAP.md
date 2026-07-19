# Filthy Net Deck — Production Roadmap

**Current release:** **v1.1.1** (Planeswalker themes + sidebar Themes fix; Windows + macOS on site).  
**How to use:** Work top to bottom. Check items off as they ship. Any user-visible change ships via the **full AGENTS.md release checklist**. Source-only pushes are not releases.  
**Handoff:** Read `handoff.md` + `AGENTS.md` first. Signing: `%USERPROFILE%\.tauri\filthy-net-deck.key` (password local only — never commit).

> **RELEASE PACING:** Fewer, bigger releases. Finish meaningful work on `main`, then cut **one** version. `npm run meta` / `npm run sets` anytime without a bump. P0 hotfix may ship solo.

---

## Next chapter — post-v1 (owner 2026-07-19)

Canonical checklist: **`handoff.md` → Next chapter**. Themes (not a second 25-ticket bomb):

1. **Reliability theater** — tracker edge cases, Arena parse resilience, update UX honesty  
2. **Onboarding** — first 5 minutes: log found → first match → first opponent tag  
3. **Shareable moments** — climb / week recap / theme skins for social  
4. **Listen** — ship only real user gaps that fit Climb bar + SKIP list  

**Target product version:** **v1.2.x** when this batch ships end-to-end (installer + updater + site).

### Explicitly deferred

Limited/Draft hub · in-game overlay · cloud sync · Alchemy · prices · Events overhaul · AI without grounded local data · monetization (tip jar / Pro until usage justifies).

### 10× SKIP (still closed)

D1, D4, D5 · M3, M5 · Z1 · all E\* · X3, X4 — see `docs/PAGE-10X.md`.

---

## Low-urgency backlog

- After each app tag: roll macOS dmg from GH release into `website/downloads/` + site links  
- Marketing screenshot/GIF carousel (owner 1280×860 assets with real tracker data)  
- Full macOS signed auto-update in CI (owner decision: key as repo secret); soft dmg CTA already works  
- `whatsinstandard` v7 when v6 is fully dead (`fetchStandardRotation` in `pipeline/sources/sets.mjs`)  
- More set trailers in `set-trailers.json` as WotC posts them  
- Downloads hygiene: only current release in `website/downloads/` (`docs/MAINTENANCE.md`)  
- Optional: upload Windows `.exe`s to GitHub Releases; history rewrite to reclaim `.git` size  

---

## Shipped milestones (condensed)

| Version | Theme |
|---------|--------|
| **v1.1.1** | Themes accordion sidebar-only |
| **v1.1.0** | Planeswalker accent skins |
| **v1.0.0** | 10× batches 1–4 (deep links, personal loop, Format Hub, Sets/compare) |
| **0.26** | Climb path by deck (Climb bar reference) |
| **0.25** | Nav reorder + Format Hub page |
| **0.24–0.23** | Polish, trailers, light mode, Arena import // fix |
| **0.22–0.18** | Card watch, Future Standard, B&R pulse, rotation impact, recap, content engine |
| **0.17–0.14** | Matchups, tray/autostart, live meta origin, Set Radar UX |

Detail lives in git history. Older “roll v0.23 macOS / verify 0.22→0.23” follow-ups are **superseded** by the 1.x line.

---

## Non-goals (do not add)

In-game overlay (ToS), price tracking, cloud sync, mobile/APK tracking promises, Alchemy/Historic, fabricated matchup/sideboard content.

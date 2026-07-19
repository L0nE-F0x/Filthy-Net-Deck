# Filthy Net Deck — Production Roadmap

**Current release:** **v1.3.5** (in-game overlay polish: grouped list, art crops, mana pips, true slim bar; Windows signed + macOS universal dmg at parity on site).  
**How to use:** Work top to bottom. Check items off as they ship. Any user-visible change ships via the **full AGENTS.md release checklist**. Source-only pushes are not releases.  
**Handoff:** Read `handoff.md` + `AGENTS.md` first. Signing: `%USERPROFILE%\.tauri\filthy-net-deck.key` (password local only — never commit).

> **RELEASE PACING:** Fewer, bigger releases. Finish meaningful work on `main`, then cut **one** version. `npm run meta` / `npm run sets` anytime without a bump. P0 hotfix may ship solo.

---

## Next chapter — post-v1.3.5 (owner 2026-07-19)

Canonical checklist: **`handoff.md`**.

1. ~~**Overlay polish**~~ — **shipped in v1.3.5** (grouped sections, art crops, mana pips, true slim bar, opacity + start-expanded settings)  
2. ~~**macOS roll**~~ — **done**: `v1.3.5` universal dmg in `website/downloads/` + site links (fixed CI: `transparent()` is Windows/Linux-only)  
3. **Deferred** stays deferred (draft hub, cloud, Alchemy, prices)  

**Shipped:** **v1.3.5** overlay refinement + macOS parity (installer + dmg + updater + site + OG).

### Explicitly deferred

Limited/Draft hub · **in-draft** overlay · cloud sync · Alchemy · prices · Events overhaul · AI without grounded local data · monetization (tip jar / Pro until usage justifies).

### 10× SKIP (still closed)

D1, D4, D5 · M3, M5 · Z1 · all E\* · X3 — see `docs/PAGE-10X.md`. (X4 test toast ships with v1.3.)

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
| **v1.3.5** | Overlay polish: grouped list, art crops, mana pips, slim bar, settings |
| **v1.3.0** | In-game overlay deck tracker + notify defaults |
| **v1.2.0** | First-session coach, share cards, update UX |
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

In-draft overlay (ToS), price tracking, cloud sync, mobile/APK tracking promises, Alchemy/Historic, fabricated matchup/sideboard content.

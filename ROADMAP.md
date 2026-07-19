# Filthy Net Deck — Production Roadmap

**Current release:** **v1.4.4** (tooltips + Events/Stats polish; Windows signed + macOS universal dmg at parity).  
**How to use:** Work top to bottom. Check items off as they ship. Any user-visible change ships via the **full AGENTS.md release checklist**. Source-only pushes are not releases.  
**Handoff:** Read `handoff.md` + `AGENTS.md` first. Signing: `%USERPROFILE%\.tauri\filthy-net-deck.key` (password local only — never commit).

> **RELEASE PACING:** Fewer, bigger releases. Finish meaningful work on `main`, then cut **one** version. `npm run meta` / `npm run sets` anytime without a bump. P0 hotfix may ship solo.

---

## Next chapter — post-v1.4.4 (owner 2026-07-20)

Canonical checklist: **`handoff.md`**.

1. ~~**v1.4.0 "Bells & Whistles"**~~ — shipped  
2. ~~**v1.4.1–1.4.4 polish**~~ — Events, share, Soundscape, themes, tooltips, last-played  
3. **Deferred** stays deferred (draft hub, cloud, Alchemy, prices)  
4. Owner ladder feedback only  

**Shipped:** **v1.4.4** on the Bells & Whistles line.

### Explicitly deferred

Limited/Draft hub · **in-draft** overlay · cloud sync · Alchemy · prices · Events overhaul · AI without grounded local data · monetization (tip jar / Pro until usage justifies).

### 10× SKIP (still closed)

D1, D4, D5 · M3, M5 · Z1 · all E\* · X3 — see `docs/PAGE-10X.md`. (X4 test toast ships with v1.3.)

---

## Low-urgency backlog

- After each app tag: roll macOS dmg from GH release into `website/downloads/` + site links  
- Marketing screenshot/GIF carousel (owner 1280×860 assets with real tracker data)  
- Full macOS signed auto-update in CI (owner decision: key as repo secret); soft dmg CTA already works  
- `whatsinstandard` v7 when v6 is fully dead  
- More set trailers in `set-trailers.json` as WotC posts them  
- Downloads hygiene: only current release in `website/downloads/`  

---

## Shipped milestones (condensed)

| Version | Theme |
|---------|--------|
| **v1.4.4** | Tooltip polish: Climb, Matchups, Decks, Deck detail |
| **v1.4.3** | Drop Meta Trackers; deck table last-played + tooltips |
| **v1.4.2** | Events fix: magic.gg + MTGO allowlist |
| **v1.4.1** | Events freshness, share UX, Soundscape, Ugin & Garruk |
| **v1.4.0** | Bells & Whistles: share cards, overlay harden, a11y, opt-in sound |
| **v1.3.5** | Overlay polish: grouped list, art crops, mana pips, slim bar, settings |
| **v1.3.0** | In-game overlay deck tracker + notify defaults |
| **v1.2.0** | First-session coach, share cards, update UX |
| **v1.1.1** | Themes accordion sidebar-only |
| **v1.1.0** | Planeswalker accent skins |
| **v1.0.0** | 10× batches 1–4 |

Detail lives in git history.

---

## Non-goals (do not add)

In-draft overlay (ToS), price tracking, cloud sync, mobile/APK tracking promises, Alchemy/Historic, fabricated matchup/sideboard content.

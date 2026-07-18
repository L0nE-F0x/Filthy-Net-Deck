# Filthy Net Deck — handoff

**Last wrap-up:** 2026-07-19 — Grok; **v0.26.0** Climb Tracker overhaul (path by deck + click-through to My Stats).

## Climb (0.26)
- `buildClimbLegs` / `deckClimbSummaries` in `climbStats.ts`
- Chart segments colored by deck; hover = rank + deck name
- **Climb path** chronological diary of deck stretches
- Click stretch / deck row / chart point → `openStatsDeck` → My Stats deck detail
- Store: `statsFocusDeckKey`, `openStatsDeck`, `clearStatsFocusDeck`

## Nav (0.25)
1 Decks · 2 My Stats · 3 Climb · 4 Matchups · 5 Sets · 6 Events · 7 Format Hub · 8 Settings

## Ship
| Item | Value |
|------|--------|
| Version | **0.26.0** |
| Tag | v0.26.0 |

## Next
- **10× page program:** `docs/PAGE-10X.md` (Climb is the bar). Default next batch = **deep-link lattice** (Decks/Stats/Matchups/Events click-through).
- Owner: verify Climb 0.26; pick Batch A / B / C from PAGE-10X
- Limited still backburner

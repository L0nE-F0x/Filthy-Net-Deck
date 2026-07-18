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
- **10× program locked** (`docs/PAGE-10X.md` Approved queue, 2026-07-19).
- **WANT:** I1–I4, D2–D3, S1–S5, M1/M2/M4, Z2–Z5, F1–F5, X1–X2.
- **SKIP:** D1/D4/D5, M3/M5, Z1, all E*, X3/X4. Events stay as-is.
- **Next build:** Ship batch **1 — Lattice** (I1, I2, I3, D2, S1, S3, M1, M4) when owner says go.
- Limited still backburner

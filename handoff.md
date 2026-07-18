# Filthy Net Deck — handoff

**Last wrap-up:** 2026-07-19 — Grok; **v0.25.0** Format Hub standalone + nav reorder shipped end-to-end.

## Nav (keys 1-8)
1 Decks · 2 My Stats · 3 Climb · 4 Matchups · 5 Sets · 6 Events · 7 Format Hub · 8 Settings

## Format Hub
- Page id: `formats` (not `format` — that is still FormatView for a format's deck grid)
- File: `src/pages/FormatHub.tsx`
- Data: sets feed `formats` (same as before)
- B&R pulse → Format Hub; visiting hub marks bans seen

## Ship
| Item | Value |
|------|--------|
| Version | **0.25.0** |
| Tag | v0.25.0 |
| Windows | signed installer + updater |

## Next
- Owner: Update & restart; spot-check Format Hub + key 7
- Limited still backburner
- Roll macOS dmg when CI finishes

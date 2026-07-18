# Filthy Net Deck — handoff

**Last wrap-up:** 2026-07-18 — Grok; **v0.24.1** P0 tracker tray-sync hotfix shipped end-to-end.

## What was wrong
Rust **was** recording matches to disk (verified: 10 matches today in `tracker-matches.jsonl`, parser replay found all of them). Detailed logs ENABLED. The UI did not re-pull after tray hide — WebView can miss live `tracker:match` events while hidden, and `initTracker` only loaded once per session.

## Fix (0.24.1)
- `refreshTracker()` reloads status + matches from Rust (source of truth)
- Re-sync on window focus / visibility / Tauri focus + 20s poll
- Re-sync when opening My Stats / Matchups / Climb
- Status handler re-pulls if `matchesRecorded` > local UI count
- Defensive parser: JSON on same line as UnityCrossThreadLogger header

## Your matches
Already on disk — after updating to 0.24.1 and opening My Stats they should appear (no re-play needed for already-recorded games).

## Ship status
| Item | Value |
|------|--------|
| Version | **0.24.1** |
| Tag | v0.24.1 |
| Windows | signed + updater live |

## Next
- Owner: Update & restart 0.24.0→0.24.1, play one match in tray, open My Stats
- Limited still backburner

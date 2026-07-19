# Filthy Net Deck — handoff

**Last wrap-up:** 2026-07-19 — Grok session close. Product at **v1.1.1**, shipped end-to-end.

## Where we are

| Item | Value |
|------|--------|
| Version | **1.1.1** |
| Git | `main` @ `f06dad7` (synced with `origin`) |
| Tags | `v1.0.0`, `v1.1.0`, `v1.1.1` |
| Windows installer | `website/downloads/Filthy-Net-Deck-Setup-1.1.1.exe` (+ `.sig`) |
| Soft channel | `website/version.json` + `public/version.json` → 1.1.1 |
| Updater | `website/updater/latest.json` → 1.1.1 + signature |
| Live site | https://filthy-net-deck.netlify.app/ (confirmed 1.1.1) |

## This session (summary)

1. **v1.0.0** — 10× page program batches 1–4 (deep links, Stats/Matchups/DeckView, Format Hub war room, Sets drop/rotation, Settings health/shortcuts). F2 near-rotation only with exact date ≤45d.
2. **v1.1.0** — Planeswalker themes (Classic, Chandra, Teferi, Liliana, Ajani, Elspeth); orthogonal to dark/light.
3. **v1.1.1** — Themes UI fix: accordion stays **inside the sidebar** (no overlap on main content).
4. Marketing copy drafted for X (v1 announcement); not posted by the agent.
5. Goal “build all 4 batches” completed earlier; no active watchers.

## Product posture

Owner intent: **maintenance + periodical health checks** after this. No new feature batches planned unless reopened.

## SKIP still closed

D1/D4/D5, M3/M5, Z1, all E*, X3/X4 (see `docs/PAGE-10X.md`).

## Optional follow-ups (not open work)

- Roll macOS dmg for 1.1.x into `website/downloads/` when CI produces it; update site macOS link if still on older dmg.
- Local uncommitted only (ignore unless intentional): `marketing-video/` edits, `goal/` folder.
- Periodic: `npm run meta` / sets pipeline, Netlify version spot-check, signing key stays on dev machine only.

## Branding

ApexForge credit on sidebar + Settings + marketing footer → https://ame-apexforge.org/

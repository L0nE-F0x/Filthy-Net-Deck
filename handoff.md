# Filthy Net Deck — handoff

**Last wrap-up:** 2026-07-19 — **v1.3.0 shipped** (Windows signed + site). macOS dmg still 1.1.1 until GH tag CI rolls.

## Where we are

| Item | Value |
|------|--------|
| Version | **1.3.0** (Windows) |
| macOS | **1.1.1** dmg on site until rolled |
| Windows | `website/downloads/Filthy-Net-Deck-Setup-1.3.0.exe` (+ `.sig`) |
| Soft / updater | `version.json` + `updater/latest.json` → 1.3.0 |
| Live | https://filthy-net-deck.netlify.app/ (after Netlify deploy) |

## v1.3.0 (shipped)

- In-game overlay deck tracker: mini card art, draw odds, land count
- Slim collapsible HUD, resize + edge-snap, position persistence
- GRE library tracking (local Player.log only)
- Match-end desktop toasts default ON + Settings test notification
- Overlay perf: dirty-only live emits, no backdrop blur, rAF coalesce

## Next

1. Tag `v1.3.0` for macOS CI (`macos-build.yml`) and roll dmg into downloads + site links
2. Verify in-app **Update & restart** from 1.2.0 → 1.3.0
3. Overlay polish from live ladder feedback (odds UX, art density)

## Maintenance

See `docs/MAINTENANCE.md`. Downloads: current Windows + current macOS only.

## Branding

ApexForge credit on sidebar + Settings + marketing footer → https://ame-apexforge.org/

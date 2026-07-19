# Filthy Net Deck — handoff

**Last wrap-up:** 2026-07-19 — **v1.2.0 shipped** (Windows signed + site). macOS dmg still 1.1.1 until GH tag CI rolls.

## Where we are

| Item | Value |
|------|--------|
| Version | **1.2.0** (Windows) |
| macOS | **1.1.1** dmg on site until rolled |
| Windows | `website/downloads/Filthy-Net-Deck-Setup-1.2.0.exe` (+ `.sig`) |
| Soft / updater | `version.json` + `updater/latest.json` → 1.2.0 |
| Live | https://filthy-net-deck.netlify.app/ (after Netlify deploy) |

## v1.2.0 Next chapter (shipped)

- First-session coach: log found → first match → first opponent tag
- Deeper tracker health + Arena parse warnings
- Share cards: week recap, climb story PNG, theme skin PNG
- Update UX: signed Update & restart primary; download is fallback
- Tray/focus recovery poll while visible

## Next

1. Roll macOS dmg for 1.2.0 after tag CI (`macos-build.yml`) into downloads + site links
2. Verify in-app **Update & restart** from 1.1.1 → 1.2.0
3. Listen / small polish only unless owner opens new batch

## Maintenance

See `docs/MAINTENANCE.md`. Downloads: current Windows + current macOS only.

## Branding

ApexForge credit on sidebar + Settings + marketing footer → https://ame-apexforge.org/

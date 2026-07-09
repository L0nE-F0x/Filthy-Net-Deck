# Filthy Net Deck

Desktop companion for **Magic: The Gathering Arena** — **8 ranked decks × 8 constructed formats every day**, Standard featured first, Bo1/Bo3 modes, tiers, matchups, sideboard guides, card art, and tournament pulse.

**Download:** https://filthy-net-deck.netlify.app/  
**Repo:** https://github.com/L0nE-F0x/Filthy-Net-Deck

Built with **Tauri 2 + React + TypeScript + Tailwind**.

> Not affiliated with Wizards of the Coast. MTG and MTG Arena are trademarks of Wizards of the Coast LLC.

## Develop

```bash
npm install
npm run tauri:dev
```

```bash
npm run meta         # export seed + live pipeline
npm run tauri:build  # Windows/macOS installers
```

## Meta pipeline

| Source | Role |
|--------|------|
| Built-in offline pack | Always present — 8 decks × format × mode |
| MTGGoldfish | Metagame % re-rank |
| Melee.gg | Tournament discovery |
| Untapped.gg | Arena ladder link-outs |
| Scryfall | Card images (CDN URLs resolved in-app) |

```bash
npm run export-meta
npm run pipeline:live
```

## Netlify

- Site: `https://filthy-net-deck.netlify.app/`
- Publish directory: `website`
- Commit `website/meta/latest.json` and `website/downloads/*.exe`

## License / IP

Fan project. Card images via Scryfall.

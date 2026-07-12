# Filthy Net Deck

Desktop meta companion for **Magic: The Gathering** — the daily **Standard** and **Pioneer** metagame, 8 ranked decks per format, Bo1/Bo3 modes, tiers, card art, Arena import, and tournament pulse.

**Data promise:** only real, live, verified lists ship. There is no seed pack, no placeholder decks, and no fuzzy guessing anywhere in the chain. If live data can't be verified, the previously published real data stays up.

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
npm run meta         # build today's live meta (Standard + Pioneer)
npm run tauri:build  # Windows/macOS installers
```

## Meta pipeline

Formats: **Standard** and **Pioneer** only. Design rules:

1. Only real data ships — the pipeline **aborts without writing** when live data
   is unavailable, so the previously published real data stays live.
2. A deck's identity, rank, list, colors, and key cards all come from **one
   source**. No fuzzy cross-source matching.
3. Every card name is validated on Scryfall before it ships.

| Source | Role |
|--------|------|
| MTGGoldfish metagame tiles | Archetype name, colors, meta %, key cards, rank |
| MTGGoldfish archetype pages | Representative decklist (embedded `deck_input`, not the CF-blocked `arena_download`) |
| Scryfall `/cards/collection` | Validation gate — canonical names, per-format legality, `scryfallId` per card (client builds exact CDN image URLs from these; no fuzzy lookups) |
| magic.gg / MTGO / Melee.gg / Untapped.gg | Standard/Pioneer tournament links only — never deck lists |

## Netlify

- Site: `https://filthy-net-deck.netlify.app/`
- Publish directory: `website`
- Commit `website/meta/latest.json` and `website/downloads/*.exe`

## License / IP

Fan project. Card images via Scryfall.

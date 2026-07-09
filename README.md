# Ban Basic Island

Desktop companion for **Magic: The Gathering Arena** — **8 ranked decks × 8 constructed formats every day**, Standard featured first, Bo1/Bo3 modes, tiers, matchups, sideboard guides, and a meta tournament pulse.

Built with **Tauri 2 + React + TypeScript + Tailwind**. Site + meta CDN on **Netlify**.

Repo: https://github.com/L0nE-F0x/Ban-Basic-Island

> Not affiliated with Wizards of the Coast. MTG and MTG Arena are trademarks of Wizards of the Coast LLC.

## Features

- **8 decks per format per day** (Standard, Alchemy, Historic, Pioneer, Timeless, Brawl, Standard Brawl, Historic Brawl)
- Separate **Bo1 / Bo3** ranked lists
- Tier boards, matchups, sideboard guides, **Copy Arena import**
- **Meta Pulse** — paper (Melee.gg), MTGO, Arena signals
- Offline **seed meta** when the feed is unavailable

## Develop

```bash
npm install
npm run tauri:dev
```

```bash
npm run dev          # browser UI only
npm run meta         # export seed + live pipeline (Goldfish + Melee)
npm run tauri:build  # Windows/macOS installers
```

## Meta pipeline (Phase 2)

| Source | Role |
|--------|------|
| **Seed archetypes** | Always present — guarantees 8 decks × format × mode |
| **MTGGoldfish** | Public metagame pages → re-rank / update meta % |
| **Melee.gg** | Public tournament search → paper/RCQ event links in Meta Pulse |
| **Scryfall** | Card images (client) |

**Spicerack:** was LGS/RCQ tournament software with a public decklist export API. **It has shut down**, so this project does **not** depend on Spicerack. **Melee.gg** is the primary paper tournament platform we integrate instead.

```bash
npm run export-meta     # TS seed → pipeline/seed-export.json
npm run pipeline:seed   # copy export → website/meta + public/meta
npm run pipeline:live   # re-rank with Goldfish + merge Melee tournaments
```

Desktop app only downloads `meta/latest.json` — no client-side scraping.

## Netlify

- Publish directory: `website`
- Commit `website/meta/latest.json` and `website/downloads/*.exe` so deploys stay useful even if live fetch fails
- Optional: schedule `npm run meta` via GitHub Action daily and push updated JSON

## License / IP

Fan project. Card images via Scryfall. Always verify legality in the official Arena client.

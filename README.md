# Filthy Net Deck

[![CI](https://github.com/L0nE-F0x/Filthy-Net-Deck/actions/workflows/ci.yml/badge.svg)](https://github.com/L0nE-F0x/Filthy-Net-Deck/actions/workflows/ci.yml)

Desktop meta companion for **Magic: The Gathering** — the daily **Standard** and **Pioneer** metagame, 8 ranked decks per format, Bo1/Bo3 modes, tiers, card art, Arena import, tournament pulse, and a **local winrate tracker** for your own Arena matches.

**Data promise:** only real, live, verified lists ship. There is no seed pack, no placeholder decks, and no fuzzy guessing anywhere in the chain. If live data can't be verified, the previously published real data stays up.

**Download:** https://filthy-net-deck.com/  
**Repo:** https://github.com/L0nE-F0x/Filthy-Net-Deck  
**Suggest a feature / report a bug:** https://filthy-net-deck.com/feedback.html

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

## Winrate tracker (My Stats)

The desktop app tails MTG Arena's own `Player.log` and records your matches —
result, opponent, deck, queue, play/draw, rank, and the cards the opponent
revealed (and how many of each). Click a match in My Stats to see that list. **Local by default: nothing
leaves your PC unless you turn it on.**

- Requires **Detailed Logs (Plugin Support)** enabled in Arena
  (Options → Account); the app walks you through it if it's off.
- Matches are stored as JSONL in the app data dir (`tracker-matches.jsonl`).
- The log format is unofficial; if an Arena update changes it, the My Stats
  page says so instead of recording garbage. To debug against a real log:
  `FND_REPLAY_LOG=path/to/Player.log cargo test replay_real_log -- --nocapture --ignored`

## Accounts and cloud features (all optional, all off by default)

The app is fully functional with **no account** — that is not going to change.
A free account unlocks features that need a server, and each is opt-in:

| Feature | What it does |
|---|---|
| Community matchup rates | Your record vs. an archetype, joined to the field's |
| Public profile `/u/<handle>` | Your season climb, shared on your terms |
| Published decklists `/u/<handle>/<deck>` | Publish one deck and anyone with the link can copy it into Arena |
| Cloud deck sync | Backs up the lists Arena registers, which local log rotation destroys |
| Friend codes | Compare stat lines and race a season with people you play |

Two rules hold regardless of any toggle:

- **Another player's identity never leaves your machine.** `opponentName` and
  `opponentSeen` are not uploaded — not hashed, not "anonymised". The opponent's
  archetype is inferred locally and only the *label* is sent.
- **The upload payload is an explicit allowlist**, not a serialised object, so a
  field added to the tracker later cannot silently start being uploaded. A test
  asserts the exact key set.

The full field list is published verbatim at
[filthy-net-deck.com/privacy](https://filthy-net-deck.com/privacy.html).

## Netlify

- Site: `https://filthy-net-deck.com/` (legacy: `https://filthy-net-deck.netlify.app/`)
- Publish directory: `website`
- Commit `website/meta/latest.json` and `website/downloads/*.exe`

## License / IP

**Code is [MIT](LICENSE).** Fork it, learn from it, build on it.

Three things the licence does *not* cover, because they are not the project's to
give away:

- **The name and branding.** "Filthy Net Deck", the logo, `app-icon.png`, and the
  OG/marketing art are not part of the MIT grant. A fork is welcome — just ship
  it under your own name so users can tell the two apart. (Trademark is separate
  from copyright; MIT licenses the code, never the brand.)
- **The meta data.** Everything under `meta/` is derived from third parties
  (MTGGoldfish, MTGO, magic.gg, Melee, Untapped) and is republished under their
  terms, not relicensable here.
- **Card names, text and images** come from **Scryfall**, subject to Scryfall's
  API terms. Card art and card design remain © Wizards of the Coast.

Fan project. Not affiliated with Wizards of the Coast.

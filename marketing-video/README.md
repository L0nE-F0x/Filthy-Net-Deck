# Filthy Net Deck — marketing video (Remotion)

Final launch spot (~44s, 1920×1080 @ 30fps): product-cinema UI tour + acid-climax soundtrack.

Self-contained subproject — deps do not touch the main app.

## Commands

```bash
cd marketing-video
npm install
npm run soundtrack   # regenerate public/soundtrack-*.wav (optional)
npm run studio       # live preview
npm run render       # → out/filthy-net-deck-final.mp4
```

## Layout

| Path | Purpose |
|------|---------|
| `src/Video.tsx` | Timeline / sequences / audio |
| `src/scenes.tsx` | Feature beats (intro → meta → format hub → … → outro) |
| `src/Background.tsx` | Atmosphere |
| `src/bits.tsx` | Shared UI primitives (panels, chips, app chrome) |
| `src/theme.ts` | Brand palette |
| `public/app-icon.png` | Logo asset |
| `public/soundtrack-acid-climax.wav` | Final bed (also regenerable via script) |
| `scripts/generate_soundtracks.py` | Procedural beds A/B/C |

## Release notes for next cut

1. Bump version strings in intro/outro kickers.
2. Update meta board names / feature copy in `scenes.tsx` if the product changed.
3. `npm run render` and publish the MP4 (X / site). `out/` is git-ignored.

Stylized mock UI only — no Scryfall card scans, network-free renders.

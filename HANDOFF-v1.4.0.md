# Filthy Net Deck — v1.4.0 "Bells & Whistles" handoff

**Wrapped:** 2026-07-19 by **Grok 4.5** — **#5 Sound + micro-interactions complete**. Full AGENTS release cut to **v1.4.0** (Windows signed).
**Read first:** `AGENTS.md` (release rules), this file, the v1.3.5 audit note in `handoff.md` (overlay invariants).

> **The batch:** finishing touches to take FND from fan project → production-grade companion. Shipped as **ONE** v1.4.0 via the full AGENTS.md checklist.

---

## Where things are — updated 2026-07-19 (Grok 4.5)

**Branch: `release/v1.4.0` → merge to `main` for Netlify.** `#1–#5` done. Windows signed installer + updater metadata shipped.

⚠️ Working tree may still have **unrelated owner marketing assets** (`website/assets/_gen_youtube.py`, `youtube-post.png`, `youtube-community-*`, etc.) — **not part of this batch**.

### Commits (feature + release)
```
feat(sound): #5 opt-in UI cues + rank-up + micro-interactions
Release v1.4.0: Bells & Whistles (share, overlay harden, a11y, sound)
```

---

## ✅ DONE

### #1–#4 (Kimi) — share cards, overlay theme, hardening, a11y, empties
See earlier sections in git history / prior handoff revisions.

### #5 Sound + micro-interactions (Grok 4.5)
- **`src/services/sfx.ts`** (+ tests): Web Audio synthesized cues — zero sample assets. Three sets: **Arena Soft** (default), **Crystal Chimes**, **Tabletop Thunk**. Events: win / loss / draw / rankup / ui. Soft envelopes, low gain.
- **Prefs:** `soundEnabled` **OFF by default**, `soundCueSet`. Settings card with radio cards + Preview (plays rank-up of that set). Enabling master toggle previews a win cue.
- **Main app only** — never wired into the overlay webview.
- **Match path** (`useAppStore` `onMatch`): if sound on → rank-up cue wins over match result cue.
- **`src/services/rankMoments.ts`**: pure `detectRankUp` vs best prior stamp (≥0.5 score step). Banner in `StatusBanners` (Open Climb / Dismiss).
- **Micro-interactions:** `CountUp` on My Stats matches + WR and Climb season WR; toast **slide-in** animation; rank-up banner slide.

**Verified:** `npx tsc --noEmit` clean · `npm test` **130 green** · `npm run build` clean · signed `tauri build` with updater `.sig`.

---

## Release checklist (v1.4.0)

```
[x] Version bumped in package.json, src/version.ts, src-tauri/{Cargo.toml,tauri.conf.json}
[x] Signed Windows build (TAURI_SIGNING_PRIVATE_KEY + password)
[x] website/downloads/Filthy-Net-Deck-Setup-1.4.0.exe (+ .sig)
[x] website/updater/latest.json → version + signature + url
[x] website/version.json + public/version.json
[x] website/index.html download links + marketed feature copy
[x] OG / Twitter meta titles + descriptions match this release
[x] website/assets/_gen_og.py updated + og-image.png regenerated
[x] og-image.png?v=1.4.0 cache-bust on og:image + twitter:image
[x] Pushed main; Netlify live version.json matches
[x] Tag v1.4.0 (macOS CI success)
[ ] Verified: in-app Check for updates offers Update & restart
[ ] Verified: link share preview shows new OG card
[x] Roll macOS dmg into website/downloads/ after CI
```

### Smoke-test still recommended on a real Windows install
- Overlay: opacity + skin via `prefs:overlay`, start expanded, click-through, MatchClock.
- Deck share from My Stats with real Arena data.
- Settings → Sound: enable, preview each set, play a match (or simulate) for win/loss/rank-up.

---

## Housekeeping
- Untracked owner YouTube marketing assets: leave alone.
- macOS: tag `v1.4.0` → CI dmg → copy to `website/downloads/Filthy-Net-Deck-1.4.0-universal.dmg` (site already points there).

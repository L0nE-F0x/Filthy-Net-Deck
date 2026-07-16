# Filthy Net Deck — project rules

Desktop-only MTG Arena meta companion (Tauri 2 + React + TypeScript).  
**Not** a mobile product. Do not invent Android/iOS tracking promises.

## Non‑negotiable: end-to-end rollouts

Any **user-visible feature, fix, branding change, or version bump** is incomplete until it is shipped **everywhere users look**. Source-only commits are not a release.

### Definition of done for a product change

Before saying “done” / “shipped” / “users can see it”, complete **all** applicable items:

| Surface | What must be updated |
|--------|----------------------|
| **App binary** | Bump `package.json`, `src/version.ts`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` (and `Cargo.lock` after build). Build a real installer. |
| **Windows installer** | `npm run tauri:build` with updater signing keys set → copy NSIS setup to `website/downloads/Filthy-Net-Deck-Setup-<ver>.exe` **and** the `.sig` next to it. |
| **Signed in-app updater** | Update `website/updater/latest.json` with new `version`, `notes`, `pub_date`, `platforms.windows-x86_64.url` + **signature** from the build. Prefer **Update & restart** over browser download. |
| **Soft version channel** | Update `website/version.json` **and** `public/version.json` (`version`, `downloadUrl`, `notes`) so Settings / soft fallback see the new build. |
| **Marketing site** | `website/index.html` download buttons, version labels, hero/mock version strings, feature copy. |
| **Share card / SEO (mandatory every version bump)** | Refresh Open Graph + Twitter meta in `website/index.html` (`title`, `description`, `og:*`, `twitter:*`) to market the **current** release. Regenerate `website/assets/og-image.png` via `website/assets/_gen_og.py` (version badge + feature lines). **Cache-bust** image URLs with `?v=<version>` so X/Discord/Slack pick up the new card (e.g. `og-image.png?v=0.12.4`). |
| **Netlify** | Push to `main` so the site, `version.json`, `updater/latest.json`, `downloads/*`, and `assets/og-image.png` go live. Confirm live URLs return the new version (not just local files). Spot-check the homepage meta and OG image in a private/incognito share preview if possible. |
| **macOS (when shipping a tagged release)** | Tag `vX.Y.Z` so `.github/workflows/macos-build.yml` can produce a dmg; roll the dmg into `website/downloads/` and fix macOS download links (same pattern as past “Roll vX out to macOS” commits). |
| **Git** | Commit installer + metadata + OG assets, push `origin/main`, push the version tag when cutting a release. |

### Release checklist (copy into the PR / commit message)

```
[ ] Version bumped in package.json, src/version.ts, src-tauri/{Cargo.toml,tauri.conf.json}
[ ] Signed Windows build (TAURI_SIGNING_PRIVATE_KEY + password)
[ ] website/downloads/Filthy-Net-Deck-Setup-<ver>.exe (+ .sig)
[ ] website/updater/latest.json → version + signature + url
[ ] website/version.json + public/version.json
[ ] website/index.html download links + marketed feature copy
[ ] OG / Twitter meta titles + descriptions match this release
[ ] website/assets/_gen_og.py updated + og-image.png regenerated
[ ] og-image.png?v=<version> cache-bust on og:image + twitter:image
[ ] Pushed main; Netlify live version.json matches
[ ] Tag vX.Y.Z (macOS CI) when appropriate
[ ] Verified: in-app Check for updates offers Update & restart (not only Chrome download)
[ ] Verified: link share preview shows new OG card (not a stale X cache)
```

### Hard rules

1. **Never claim an app UI change is live** after only editing React/HTML and pushing git. Users run installers; they need a **new version** + **published updater metadata**.
2. **Prefer signed one-click updates** (`plugin-updater` + `updater/latest.json`). Opening Chrome for an `.exe` is a **fallback**, not the primary path.
3. **Signing keys** live only on the dev machine (`%USERPROFILE%\.tauri\filthy-net-deck.key`). Do not commit private keys. Password is required for encrypted keys — prompt the user if missing; do not skip signed publish and call the release finished.
4. **Meta pipeline** (`npm run meta`) is separate from app releases: daily meta can ship without an app bump; app features never ship without the table above.
5. **Desktop only** for Arena log tracking / winrate. Do not add Android APK promises for auto WR tracking.
6. **Share previews are part of the product.** A version bump without fresh `og:title` / `og:description` / `og-image` (+ `?v=` cache-bust) is an incomplete release — X marketing depends on it.

## Product constraints

- **Formats:** Standard + Pioneer only. Real, verified lists only (no seed/placeholder decks).
- **Tracker:** Local `Player.log` tail; data stays on the PC.
- **Branding:** ApexForge credit (“Built by ApexForge” → https://ame-apexforge.org/) on marketing footer and in-app sidebar/Settings About — keep on every release.

## Dev commands

```bash
npm install
npm run tauri:dev
npm run meta          # live meta pipeline
npm run tauri:build   # installers (set TAURI_SIGNING_* for updater artifacts)
```

## Docs

- Data sources + updater overview: `docs/DATA-AND-UPDATES.md` (keep in sync when release process changes).

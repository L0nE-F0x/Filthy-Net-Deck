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
| **Marketing site** | `website/index.html` download buttons, version labels, hero/mock version strings, feature copy. **Marketed copy is translated** — English lives inline in `index.html`, the other seven Arena locales in `website/i18n/*.json`. New or reworded feature copy means a new `data-i18n` key in all eight, or `pipeline/site-i18n.test.mjs` fails CI. Version strings stay out of the catalogs (`{version}` placeholder); bump them in `index.html` only. |
| **Upload claims (only when the payload changed)** | If this release adds, removes or changes an uploaded field, update **all three**: `README.md`, `website/index.html`, and `website/privacy.html` (bump `PRIVACY_LASTMOD` in `pipeline/build-meta-site.mjs`). Say it in the release notes — existing users installed on the old promise. This was missed for three releases; see `docs/PLATFORM-STRATEGY.md` §1.2 rule 4. |
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
[ ] Reworded/new homepage copy mirrored into website/i18n/*.json (8 locales)
[ ] OG / Twitter meta titles + descriptions match this release
[ ] website/assets/_gen_og.py updated + og-image.png regenerated
[ ] og-image.png?v=<version> cache-bust on og:image + twitter:image
[ ] If the upload payload changed: README + index.html + privacy.html all updated
[ ] Pushed main; Netlify live version.json matches
[ ] Tag vX.Y.Z (macOS CI) when appropriate
[ ] macOS dmg rolled from the GH Release into website/downloads/ AND index.html
    links updated — v2.8.2's dmg was built but never rolled, leaving macOS
    visitors on 2.8.1
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
- **Tracker:** Local `Player.log` tail. Match data stays on the PC **unless the user opts in** — see the cloud rules below.
- **Branding:** ApexForge credit (“Built by ApexForge” → https://ame-apexforge.org/) on marketing footer and in-app sidebar/Settings About — keep on every release.

### Cloud rules (since v2.7.5 the app can upload — these are binding)

1. **The app stays fully functional with no account.** Not negotiable. Never put an existing local feature behind sign-in, and never treat sign-in as a monetization step.
2. **Never upload another player's identity.** `opponentName` and `opponentSeen` do not leave the machine — not hashed, not "anonymised". Infer the archetype locally, upload the *label*.
3. **Build every payload from an explicit allowlist**, never by serialising a `TrackedMatch`. A test asserts the exact key set; keep it that way.
4. **Public copy must match reality.** `README.md`, `website/index.html` and `website/privacy.html` describe what is uploaded. A change to the payload is incomplete until all three say so. (The README promised "nothing is uploaded anywhere" for three releases after that stopped being true — do not repeat it.)
5. **Never paywall anything that runs locally.** The repo is public and a Tauri binary ships to the user's machine, so client-side gates are unenforceable. Server-side value only — this holds even though Phase 4 is deferred.
6. **Honest aggregates.** Suppress cells under 30 games, show `n` everywhere, Wilson intervals not raw proportions. Ship nothing rather than ship noise.

### Non-goals — do not add

In-draft overlay (WotC ToS) · price tracking · mobile / APK tracking promises · Alchemy & Historic · fabricated matchup or sideboard content · in-app chat relay (cost + moderation liability; Discord is the chat) · client-side paywalls · competing with Untapped on data breadth.

### Deferred (not cancelled — revisit deliberately)

Limited/Draft hub · Events overhaul · free-form LLM coach without grounded local data · **Pro tier and paywalls** (deferred indefinitely, owner 2026-08-10 — monetization is donation-only via Ko-fi). Reviving the paid tier requires the WotC Fan Content Policy and Scryfall commercial-terms checks in `docs/PLATFORM-STRATEGY.md` §2.6 **first**, not after.

## Dev commands

```bash
npm install
npm run tauri:dev
npm run meta          # live meta pipeline
npm run tauri:build   # installers (set TAURI_SIGNING_* for updater artifacts)
```

## Docs

- **Live session state / top-of-todo: `handoff.md` — read it first.**
- Data sources + updater overview: `docs/DATA-AND-UPDATES.md` (keep in sync when release process changes).
- Self-maintenance vs. monthly manual checklist: `docs/MAINTENANCE.md` (keep in sync when pipeline automation changes).
- Growth phases and the reasoning behind them: `docs/PLATFORM-STRATEGY.md` (all buildable phases shipped).
- The backend as designed *and as built*: `docs/BACKEND-PHASE-2.md`.
- Install counting post-mortem (right machinery, wrong endpoint): `docs/INSTALL-COUNTING.md`.
- The optional `.git` history rewrite, and why never to automate it: `docs/GIT-HISTORY-BLOAT.md`.
- Published upload allowlist: `website/privacy.html` — must match `matchSync.ts` + `healthPing.ts` + `backupSync.ts`.
- Site-as-destination (not a second app): `docs/WEB-PLATFORM.md`. Public matchup pages wait on crowd `n ≥ 30`.

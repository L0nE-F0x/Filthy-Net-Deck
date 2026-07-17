# Filthy Net Deck — handoff for whichever agent picks this up next

**Audience:** Any coding agent continuing this project — this session was run by Claude (Fable 5, then Sonnet 5); the owner alternates between Claude Code and Grok 4.5 sessions on this repo. Nothing here is Claude-specific; follow it regardless of which model you are.
**Owner product voice:** L0nE-F0x / ApexForge; social: [@MBrewlab](https://x.com/MBrewlab) on X.
**Repo:** https://github.com/L0nE-F0x/Filthy-Net-Deck
**Live site / downloads / updater:** https://filthy-net-deck.netlify.app/
**Studio:** https://ame-apexforge.org/

Read this file first, then **`AGENTS.md`** (authoritative release rules). Do not invent process that contradicts either.
**Active work queue:** **`ROADMAP.md`** — the prioritized milestone list from the 2026-07 preproduction audit, kept up to date as work ships. Work it top to bottom; check items off (`[x]`) as they ship.

> **⚠️ Release pacing changed 2026-07-17 (owner directive):** the previous session shipped four versions in one day (0.14.1 → 0.17.0). The owner asked for this to stop. **From now on, batch multiple roadmap items into fewer, larger releases.** Finish a full milestone (or a meaningful chunk of one) before bumping the version and running the release checklist — do not cut a release per individual checkbox. See `ROADMAP.md` for the exact policy note and current milestone.

---

## 1. What this product is

**Filthy Net Deck** is a **desktop-only** MTG Arena companion:

| Pillar | What it does |
|--------|----------------|
| **Daily meta** | Standard + Pioneer only — 8 ranked decks per format × Bo1/Bo3, real lists only |
| **My Stats** | Local winrate tracker by tailing Arena `Player.log` (never leaves the PC) |
| **Matchup Lab** | Opponent tags / prep notes |
| **Climb Tracker** | Season rank graph, games-to-next-rank |
| **Set Radar** | Arena-first spoilers, full card galleries, legality, pulse banner, Arena-eve notify |
| **Updates** | Signed in-app Update & restart (+ silent NSIS fallback) |

**Not:** mobile, Alchemy, seed/placeholder decks, cloud accounts, or “guessed” meta.

**Stack:** Tauri 2 + React 19 + TypeScript + Tailwind 4 + Zustand.  
**Rust side:** log tracker, silent installer, tray, plugins (opener, http, store, updater, process, notification).

**Brand:** “Built by ApexForge” → https://ame-apexforge.org/ (sidebar + Settings About + marketing footer). Keep on every release.

---

## 2. Current ship status (as of 2026-07-17, end of session)

| Item | Value |
|------|--------|
| **App version** | **0.17.0** (live on Windows + macOS) |
| **Branch** | `main` (releases ship on `main`, not long-lived feature branches) |
| **Latest release commit** | `Release v0.17.0 — Set Radar spoiler browser, deck movement, hover-art lists.` |
| **Windows** | Signed installer + updater `latest.json` published under `website/downloads/` and `website/updater/`. Verified live and matches the signed `.sig`. |
| **macOS** | dmg on the site is **v0.16.0** (one version behind Windows) — the v0.17.0 tag's macOS CI was still running when this session ended. **First task for the next session:** check `https://api.github.com/repos/L0nE-F0x/Filthy-Net-Deck/actions/runs` for the `v0.17.0` macOS build; once it's `completed`/`success`, pull the dmg from the GitHub release and roll it in (same pattern as prior "Roll vX out to macOS" commits — see §5.3 of this doc). This is a **source-only follow-up commit**, not a new version bump. |
| **Netlify** | Publish dir is **`website`** (not `dist`). Auto-deploys on push to `main`. |
| **Daily data** | GitHub Action `.github/workflows/daily-meta.yml` runs `npm run meta` + `npm run sets`, commits `website/meta` + `public/meta`. Confirmed live meta feed is current (`2026-07-17`) as of this session. |

### Recent feature arc (context for whoever picks this up)

- **0.12.x** — Matchup Lab, Climb Tracker, signed updates restored, ApexForge credit, launch splash, simplified Settings
- **0.13.x** — Set Radar (Arena-first, no Alchemy), full Scryfall set galleries
- **0.14.0** — Spoiler Pulse: Std/Pio legality, gallery filters/sort, new-since-last-visit, Decks home banner, Arena-eve desktop notifications
- **0.14.1** (2026-07-17) — **P0 hotfix** from a full preproduction audit: installed Windows apps were reading the meta snapshot baked into the installer instead of the live daily feed (Tauri's `http://tauri.localhost` production origin tripped a dev/prod URL check). Also fixed: new-spoiler badges surviving background syncs, "Later" on the update banner not sticking, no keyboard support on the Set Radar card viewer, Arena-eve notifications stating estimated dates as fact. macOS rolled forward from a stale 0.12.0.
- **0.15.0** (2026-07-17) — Tray autostart ("Start with your PC"), window size/position memory, first-close tray explainer notification, one-time "what's new" banner after updates, CSP hardening, Scryfall calls routed through the Tauri HTTP plugin for a real User-Agent.
- **0.16.0** (2026-07-17) — Matchup Lab tag-aggregated winrate table, "you 4–0 vs Izzet Prowess" chips on the Decks board (bridges tracker data to the meta), My Stats today/streak/rolling-winrate tiles, one-click CSV export of match history, opponent search.
- **0.17.0** (2026-07-17) — Set Radar arrow-key spoiler browsing, mana-cost pips, honest "at release" legality copy for unreleased sets, Arena-drop countdown badge on the Sets nav item, Decks rising/falling movement chips, multi-select color filters, deck view grouped by card type with average mana value and hover-art previews, Events format/platform filters + relative dates.

**Full details, findings, and the reasoning behind every fix above are in `ROADMAP.md`** (Milestones 1–4, all checked off) — read it before touching anything, so you don't redo work or reintroduce a fixed bug.

---

## 3. Repo map (where to look)

```
Filthy Net Deck/
├── AGENTS.md                 # NON-NEGOTIABLE release / product rules
├── handoff.md                # this file
├── docs/DATA-AND-UPDATES.md  # meta pipeline + updater overview
├── package.json              # version + scripts: meta, sets, tauri:build
├── src/                      # React app
│   ├── App.tsx               # shell, nav, splash, boot
│   ├── version.ts            # APP_VERSION (must match release)
│   ├── pages/                # Daily, DeckView, Stats, Matchups, Climb, Sets, Settings, …
│   ├── components/           # SplashScreen, SpoilerPulse, StatusBanners, CardArt, …
│   ├── services/             # metaFeed, setsFeed, setPulse, appUpdater, tracker, scryfall, notify
│   ├── store/useAppStore.ts  # Zustand: meta, sets, prefs, updates, tracker
│   └── types/                # meta.ts, sets.ts, tracker.ts
├── src-tauri/                # Tauri + Rust
│   ├── tauri.conf.json       # version, updater pubkey, CSP, bundle
│   ├── capabilities/default.json
│   └── src/                  # lib.rs (tray), tracker.rs, silent_update.rs
├── pipeline/                 # Node ESM data builders (server/CI, not client scrape)
│   ├── build-meta.mjs        # decks → website/meta/latest.json
│   ├── build-sets.mjs        # sets → website/meta/sets.json
│   └── sources/              # goldfish, scryfall, sets.mjs, set-calendar-overrides.json, …
├── website/                  # Netlify publish root
│   ├── index.html            # marketing + OG/Twitter meta
│   ├── assets/og-image.png   # share card (regenerate via _gen_og.py)
│   ├── assets/_gen_og.py
│   ├── downloads/            # .exe / .dmg / .sig
│   ├── updater/latest.json   # signed auto-update feed
│   ├── version.json          # soft update channel
│   └── meta/                 # latest.json (decks), sets.json (radar)
└── public/                   # mirrored meta/version for Vite/dev (keep in sync when publishing feeds)
```

### App navigation (pages)

| Nav id | Label | Notes |
|--------|--------|--------|
| `daily` | Decks | Meta lists + **SpoilerPulse** banner |
| `meta` | Events | Tournament links |
| `sets` | Sets | Set Radar + full galleries |
| `stats` | My Stats | Local tracker |
| `matchups` | Matchups | Matchup Lab |
| `climb` | Climb | Climb Tracker |
| `settings` | Settings | Mode, Arena-eve notify, updates, About |

---

## 4. Data architecture (critical)

**The desktop app does not scrape Goldfish/WotC for meta or spoilers.**  
It only downloads **published JSON** from Netlify:

| Feed | URL (prod) | Built by |
|------|------------|----------|
| Deck meta | `/meta/latest.json` | `npm run meta` |
| Set radar | `/meta/sets.json` | `npm run sets` |
| Soft updates | `/version.json` | manual on app release |
| Hard updates | `/updater/latest.json` | manual on app release (signed) |

**Pipeline rules (meta):**

1. Only real, Scryfall-validated lists ship.  
2. If live data fails, pipeline **aborts without writing** — previous good JSON stays live.  
3. Formats: **Standard + Pioneer only.**  

**Set radar rules:**

1. Arena-first; **no Alchemy** (type/name/Y## filters in `pipeline/sources/sets.mjs`).  
2. Paper dates from Scryfall; Arena dates from `set-calendar-overrides.json` (**official**) or paper−3d (**estimated**, labeled in UI).  
3. Full card galleries paginated from Scryfall into `sets.json` (oracle, colors, cmc, Std/Pio legalities).  

**Local-only client state:**

- Tracker matches (JSONL via Rust)  
- Prefs (`bbi.prefs` in localStorage): `defaultMode`, `notifyArenaEve`  
- Set card snapshot for “new since last visit” (`bbi.sets.cardSnap`)  
- Last-good meta/sets caches for offline  

---

## 5. Workflow patterns (how we work)

### 5.1 Day-to-day development

```bash
npm install
npm run tauri:dev          # desktop shell + Vite
# or browser-only UI:
npm run dev
```

- Prefer **small, product-focused changes**; match existing dark gold UI.  
- Typecheck: `npx tsc --noEmit`.  
- Do **not** commit secrets or private signing keys.  
- Settings copy should stay **player-facing** (no pipeline jargon).

### 5.2 Data-only refresh (no app version bump)

```bash
npm run meta    # may abort if Goldfish/live fails — OK
npm run sets    # Set Radar gallery feed
# commit website/meta + public/meta if changed
# push main → Netlify serves new JSON; apps auto-sync
```

Daily CI already does this. Manual runs are fine for hotfixes.

### 5.3 App feature → version bump → **full end-to-end ship**

**Source-only push is NOT a release.** Users run installers; X previews use OG tags.
Follow **`AGENTS.md`** checklist every time.

> **Pacing (owner directive, 2026-07-17):** batch several roadmap items into one release rather than bumping the version per item. Work through `ROADMAP.md` and only run this whole section once a milestone (or a substantial chunk of one) is done. A genuine P0 bug is the one exception — ship that alone immediately.

#### Version files to bump together

1. `package.json` → `version`  
2. `src/version.ts` → `APP_VERSION`  
3. `src-tauri/Cargo.toml` → `version`  
4. `src-tauri/tauri.conf.json` → `version`  
5. `Cargo.lock` updates when you build  

#### Signing (Windows updater)

- Private key: `%USERPROFILE%\.tauri\filthy-net-deck.key` (encrypted)  
- Public key: baked into `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`  
- **Password is local-only** (known to owner; not in repo). If missing, **stop and ask** — do not ship unsigned “done.”  
- Build:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$env:USERPROFILE\.tauri\filthy-net-deck.key" -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<ask owner>"
npm run tauri:build
```

- Artifacts:  
  `src-tauri/target/release/bundle/nsis/Filthy Net Deck_<ver>_x64-setup.exe`  
  + `.sig`

#### Publish artifacts into website/

```
website/downloads/Filthy-Net-Deck-Setup-<ver>.exe
website/downloads/Filthy-Net-Deck-Setup-<ver>.exe.sig
website/updater/latest.json   # version, notes, pub_date, platforms.windows-x86_64.{url,signature}
website/version.json
public/version.json           # keep twin in sync
website/index.html            # download links + version labels + feature marketing
```

#### Share card / SEO (mandatory every app release)

1. Update `website/assets/_gen_og.py` badge/lines/footer version.  
2. `python website/assets/_gen_og.py` → writes `website/assets/og-image.png`.  
3. Update `website/index.html`:  
   - `<title>`, `meta description`  
   - `og:title`, `og:description`, `og:image`  
   - `twitter:*` equivalents  
4. **Cache-bust:** `og-image.png?v=<version>` on both og and twitter image URLs.

#### Ship

```bash
git add -A
git commit -m "Release vX.Y.Z — <user-facing summary>."
git push origin main
git tag vX.Y.Z
git push origin vX.Y.Z
```

#### Verify live

- `https://filthy-net-deck.netlify.app/version.json` → new version  
- `https://filthy-net-deck.netlify.app/updater/latest.json` → same + signature  
- In installed app: Settings → Check for updates → **Update & restart** (not only Chrome download)  
- Optional: share link preview (X) shows new OG card  

#### macOS

- Tag triggers `.github/workflows/macos-build.yml`.  
- Pull dmg into `website/downloads/`, fix index.html mac links, commit (pattern: “Roll vX out to macOS”).  
- Updater signing for mac is **not** fully wired in CI (key stays local); Windows is the primary auto-update path.

### 5.4 Dual update paths (know both when auditing)

| Path | When | UX |
|------|------|-----|
| **Signed** (`plugin-updater` + `updater/latest.json`) | Preferred | “Update & restart” |
| **Silent NSIS** (`install_update_silent`) | Fallback if signed missing but `version.json` has downloadUrl | Still in-app, no Chrome |
| **Browser open** | Dev / non-Tauri only | Last resort |

Implementation: `src/services/appUpdater.ts`, `src/store/useAppStore.ts` (`checkForUpdates` / `installUpdate`), `src-tauri/src/silent_update.rs`.

### 5.5 Commit / PR style

- Complete sentences; explain **what users get**.  
- Release commits: `Release vX.Y.Z — <short product headline>.`  
- Meta-only: `chore: daily meta refresh YYYY-MM-DD`  
- Prefer not to dump pipeline/debug jargon into Settings UI copy.

---

## 6. Product / quality bar (reusable — not just for the original audit)

The 2026-07-17 preproduction audit that produced `ROADMAP.md` is done and its findings are either shipped (Milestones 1–4) or queued (Milestones 5–6). This section's *rules* stay evergreen — re-check them any time you touch a related area, not just during a formal audit pass.

### 6.1 Must not regress

- Real-data-only meta (no fabricated lists).  
- Tracker fully local; clear UX when Detailed Logs off.  
- Standard + Pioneer only.  
- No Alchemy in Set Radar.  
- ApexForge credit present.  
- E2E release discipline (installer + updater + OG).  
- Desktop-only for WR tracking (do not “add Android APK” as full tracker).  

### 6.2 High-value audit areas

| Area | Paths / focus |
|------|----------------|
| **Release completeness** | Diff last release vs checklist in AGENTS.md; macOS lag; OG staleness |
| **Updater** | Signature/pubkey match; fallback paths; wrong Settings copy |
| **Meta pipeline** | Abort-without-write; Scryfall validation; Goldfish fragility |
| **Set Radar** | Alchemy leak; wrong Arena dates presented as official; gallery size / perf; legalities accuracy (Scryfall may say not_legal pre-release — expected) |
| **Spoiler pulse / new cards** | First-visit baseline (should not flood “new”); localStorage keys |
| **Tracker** | Log format break detection; privacy claims vs code |
| **Security** | CSP in tauri.conf; http allowlist; silent update URL host check (must stay Netlify) |
| **UX consistency** | Loading splash; empty/error states; Settings non-techy |
| **Perf** | Large `sets.json` (~400KB+ with oracle text); lazy images; boot time |
| **a11y / polish** | Focus traps on drawers/lightbox; keyboard escape |
| **Marketing site** | Download links match latest exe/dmg; broken macOS links |
| **CI** | daily-meta continue-on-error; sets + meta both commit |

### 6.3 Known intentional tradeoffs

- Arena dates often **estimated** (labeled) until overrides updated.  
- macOS auto-update secondary to Windows.  
- Installers may SmartScreen/Gatekeeper warn (unsigned code-signing cert).  
- Tracker depends on unofficial Arena log format.  
- Meta accuracy depends on Goldfish + daily pipeline success.  

### 6.4 Explicit non-goals (unless product owner expands scope)

- Mobile APK with auto WR tracking  
- Alchemy / Historic anthologies  
- Cloud sync of match history  
- Full Scryfall clone / price tracking  
- Inventing missing tournament lists  

---

## 7. Commands cheat sheet

```bash
# Dev
npm install
npm run tauri:dev
npx tsc --noEmit

# Data feeds
npm run meta
npm run sets

# Production Windows build (with signing env vars set)
npm run tauri:build

# OG card
python website/assets/_gen_og.py
```

**PowerShell note:** chain with `;` not `&&` in some agent shells. Paths may contain spaces (`Coding with Grok\Filthy Net Deck`).

---

## 8. Secrets & local-only files (do not commit)

| Item | Location |
|------|----------|
| Updater private key | `%USERPROFILE%\.tauri\filthy-net-deck.key` |
| Key password | Owner memory / local secret manager only |
| Arena Player.log | User machine (tracker) |

If a build needs signing and password is unavailable → **ask human**, do not fake a release.

---

## 9. Suggested audit report format (for future full audits only)

Not needed for normal roadmap work — `ROADMAP.md` already tracks the open items. Use this format only if the owner asks for a fresh full audit later:

1. **Executive summary** — ship readiness (green / yellow / red) for public marketing of 0.14.x.  
2. **Findings** — severity (blocker / major / minor / nit), file paths, repro steps.  
3. **Release process audit** — last 3 releases vs AGENTS checklist gaps.  
4. **Security & privacy** — CSP, updater URL allowlist, local data paths, notification permissions.  
5. **Data integrity** — meta + sets pipeline failure modes.  
6. **UX / product** — empty states, wrong confidence labels, Settings clarity.  
7. **Prioritized fix list** — P0 before next social post; P1 before “1.0”; P2 backlog.  
8. **Optional PR plan** — small patches only; any user-visible fix still needs full E2E version bump per AGENTS.md.

**Do not** ship a half-version (code on main without installer/updater/OG) and call the audit “fixed.”

---

## 10. Owner preferences (session memory)

- Desktop only; keep iterating features that photograph well for **@MBrewlab**.  
- Prefer **in-app** update UX over browser downloads.  
- Marketing site + OG + installers must stay in lockstep with features.  
- Settings should stay simple; deep pipeline docs belong in `docs/` / this handoff, not the Settings UI.  
- ApexForge branding is intentional client acquisition, not optional footer fluff.

---

## 11. Quick “are we healthy?” smoke checklist

After any change batch:

- [ ] `npx tsc --noEmit` clean
- [ ] `cd src-tauri && cargo test` clean (tracker has a real test suite — keep it green)
- [ ] `npm run tauri:dev` boots splash → Decks
- [ ] Meta loads (or clear offline error)
- [ ] Sets page loads galleries; no Alchemy sets
- [ ] Spoiler pulse appears when applicable
- [ ] Settings: update check + Arena-eve toggle + "Start with your PC" toggle
- [ ] `ROADMAP.md` reflects what you actually shipped (check off items, don't let it drift)
- [ ] If releasing: full AGENTS.md checklist + live Netlify verification — but see the pacing note in §5.3 before deciding to cut a release at all

---

*Handoff generated for preproduction audit. When process changes, update `AGENTS.md` first, then this file.*

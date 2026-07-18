# Filthy Net Deck — handoff for whichever agent picks this up next

**Audience:** Any coding agent continuing this project. The owner rotates between **Claude Code** (Fable 5 / Sonnet), **Grok 4.5**, and **Kimi**. Nothing here is model-specific; follow it regardless of which model you are.  
**Last wrap-up:** 2026-07-18 — Claude Fable 5; shipped **v0.21.0** end-to-end (current-events batch: B&R pulse, rotation impact, Climb streaks + season-vs-season — Windows signed + macOS dmg rolled, both live). Also hardened the set-radar pipeline: first-look spoilers now ship, 4×/day refresh, `docs/MAINTENANCE.md` added.  
**Owner product voice:** L0nE-F0x / ApexForge; social: [@MBrewlab](https://x.com/MBrewlab) on X.  
**Repo:** https://github.com/L0nE-F0x/Filthy-Net-Deck  
**Live site / downloads / updater:** https://filthy-net-deck.netlify.app/  
**Studio:** https://ame-apexforge.org/

Read this file first, then **`AGENTS.md`** (authoritative release rules). Do not invent process that contradicts either.  
**Active work queue:** **`ROADMAP.md`** — milestones + open follow-ups. Work top to bottom; check items off as they ship.

> **⚠️ Release pacing (owner directive, 2026-07-17):** Do **not** ship four versions in a day again (0.14.1→0.17.0 happened once). **Batch** roadmap work into fewer, larger releases. Data-only (`npm run meta` / `npm run sets`) anytime without a version bump. Genuine P0 hotfix may ship solo.

---

## 1. What this product is

**Filthy Net Deck** is a **desktop-only** MTG Arena companion:

| Pillar | What it does |
|--------|----------------|
| **Daily meta** | Standard + Pioneer only — 8 ranked decks per format × Bo1/Bo3, real lists only |
| **Content engine (0.18)** | Daily archetype list diffs, meta-share timeline, you-vs-meta, week recap PNG, match-end toasts |
| **My Stats** | Local winrate tracker by tailing Arena `Player.log` (never leaves the PC) |
| **Matchup Lab** | Opponent tags / prep notes + WR vs tagged archetypes |
| **Climb Tracker** | Season rank graph, games-to-next-rank, win/loss streaks, season-vs-season (0.21) |
| **Set Radar** | Arena-first spoilers, galleries, legality, spoiler + B&R pulse banners, Arena-eve notify |
| **Format hub (0.19/0.21)** | Standard rotation + ban lists, Pioneer pool; **rotation impact** per deck (0.21) |
| **Updates** | Signed in-app Update & restart (+ silent NSIS fallback on Windows) |

**Not:** mobile, Alchemy, seed/placeholder decks, cloud accounts, or “guessed” meta.

**Stack:** Tauri 2 + React 19 + TypeScript + Tailwind 4 + Zustand.  
**Rust side:** log tracker, silent installer, tray, plugins (opener, http, store, updater, process, notification, autostart).

**Brand:** “Built by ApexForge” → https://ame-apexforge.org/ (sidebar + Settings About + marketing footer). Keep on every release.

---

## 2. Current ship status (as of 2026-07-18 wrap-up)

| Item | Value |
|------|--------|
| **App version** | **0.21.0** — B&R pulse, rotation impact, Climb streaks + season compare (0.20.0 shipped the Climb chart redesign / fullscreen tray / single-instance) |
| **Branch / HEAD** | `main` @ `Release v0.21.0` |
| **Tag** | `v0.21.0` pushed (macOS CI) |
| **Windows** | Signed installer + `.sig`: `website/downloads/Filthy-Net-Deck-Setup-0.21.0.exe` · updater `website/updater/latest.json` (sig key id **67FCA9900F523D49** verified) · soft channel `website/version.json` + `public/version.json`. In-app path is the signed plugin-updater. **Owner: verify Update & restart 0.20→0.21.** |
| **macOS** | **0.21.0** universal dmg on site (tag CI succeeded; rolled into `website/downloads/`, both `index.html` mac links → 0.21.0). |
| **Marketing** | Hero/OG lead with B&R alerts + rotation impact; OG `?v=0.21.0` regenerated. |
| **Netlify** | Publish dir is **`website`**. Verify live `version.json` / `updater/latest.json` → **0.21.0** after push. |
| **Tests** | `npm test` (vitest) — 47 pass; new suites banPulse/rotationImpact/climbStats. |

### Version arc this audit day (do not repeat cadence)

| Version | What shipped |
|---------|----------------|
| **0.14.1** | P0 live-meta feed origin fix (Tauri prod origin was baking stale installer meta) + polish |
| **0.15.0** | Autostart, tray polish, window memory, what's-new, CSP, Tauri HTTP User-Agent |
| **0.16.0** | Matchup intel vs tags, Decks “you X–Y” chips, streaks, CSV |
| **0.17.0** | Set Radar binder UX, movement chips, hover-art lists, Events filters |
| **0.18.0** | **Content engine** (diffs, history timeline, you-vs-meta, recap PNG, match toasts) + **infra** (CI alerts, 429 caps, slim feeds, vitest, nav keys 1–7) |
| **0.19.0** | **Owner refinement batch** (one batched release, per pacing policy): fullscreen (Settings/F11), Decks "Deck to beat" hero, Sets Format hub (rotation + bans), My Stats full decklists + copy |
| **0.20.0** | Climb chart redesign (smooth curve, peak marker, hover), fullscreen tray controls, single-instance guard |
| **0.21.0** | **Current-events batch**: B&R pulse (ban-list diff → banner + toast), rotation impact (per-deck cards leaving Standard), Climb streaks + season-vs-season; pipeline 4×/day set radar + `MAINTENANCE.md` |

---

## 3. Immediate next tasks (for the next agent)

1. **Nothing blocking.** v0.21.0 shipped end-to-end on 2026-07-18: signed Windows publish (sig key id verified), macOS dmg built by tag CI + rolled, marketing + OG live. All live endpoints confirmed 0.21.0.
2. **One unverified check (owner):** the in-app **Update & restart** path from an *installed* 0.20.0 → 0.21.0 could not be exercised from the dev environment (needs a running installed 0.20.0 build). Everything it depends on is live and correctly signed. Worth a manual click when convenient.
3. **Owner marketing push** — a v0.21 X post draft was delivered; owner posts from [@MBrewlab](https://x.com/MBrewlab). Link unfurls the fresh OG card; no image attachment needed.
4. **B&R pulse will go live for real** the next time WotC issues a Banned & Restricted update — the app diffs the feed's ban lists automatically. No code action needed; just be aware that's the first real-world firing.
5. **Next product batch** — see `ROADMAP.md` "Suggested next" (Card watch / Ctrl+K palette was scoped but not built this batch; screenshot carousel still needs owner assets; signed mac auto-update still an owner decision).
6. **Do not** cut another app release unless the owner asks or a P0 appears — pacing policy.

---

## 4. Repo map (where to look)

```
Filthy Net Deck/
├── AGENTS.md                 # NON-NEGOTIABLE release / product rules
├── handoff.md                # this file
├── ROADMAP.md                # milestones + open follow-ups
├── docs/DATA-AND-UPDATES.md  # meta pipeline + updater overview
├── package.json              # version + scripts: meta, sets, test, tauri:build
├── vitest.config.ts          # unit tests for pure services
├── src/
│   ├── App.tsx               # shell, NAV, keyboard 1–7, splash
│   ├── version.ts            # APP_VERSION + WHATS_NEW
│   ├── pages/                # Daily, DeckView, Stats, Matchups, Climb, Sets, Settings, …
│   ├── components/           # ArchetypeDiffPanel, MetaShareTimeline, SpoilerPulse, BanPulse (0.21), …
│   ├── services/             # pure logic + I/O (see §6 for feature-module map)
│   └── store/useAppStore.ts  # prefs (notifyArenaEve, notifyMatchEnd, notifyBanlist), tracker, meta, sets, banChanges
├── src-tauri/                # Tauri + Rust tracker / tray / silent update
├── pipeline/                 # Node ESM builders (CI + local)
│   ├── build-meta.mjs        # latest.json + dated archives + history.json
│   ├── build-sets.mjs        # sets.json (slimmed) — formats hub incl. rotation impact (0.21)
│   └── sources/              # goldfish, scryfall (429 caps), sets.mjs (buildRotationImpact), …
├── .github/workflows/        # daily-meta.yml (06:00 UTC) + sets-refresh.yml (00/12/18 UTC, 0.21)
├── website/                  # Netlify publish root
│   ├── index.html            # marketing + OG
│   ├── downloads/            # .exe / .dmg / .sig
│   ├── updater/latest.json
│   ├── version.json
│   └── meta/                 # latest.json, history.json, sets.json, YYYY-MM-DD.json
└── public/                   # mirror meta + version.json for Vite/dev
```

### App navigation

| Key | Nav id | Label | Notes |
|-----|--------|--------|--------|
| `1` | `daily` | Decks | Meta + BanPulse (0.21) + SpoilerPulse + timeline + you-vs-meta |
| `2` | `meta` | Events | Tournament links |
| `3` | `sets` | Sets | Set Radar + galleries (+ drop badge) |
| `4` | `stats` | My Stats | Tracker + week recap PNG |
| `5` | `matchups` | Matchups | Matchup Lab |
| `6` | `climb` | Climb | Climb Tracker |
| `7` | `settings` | Settings | Mode, Arena-eve, match-end toasts, **B&R alerts** (0.21), autostart, updates |

---

## 5. Data architecture (critical)

**The desktop app does not scrape Goldfish/WotC for meta or spoilers.**  
It only downloads **published JSON** from Netlify:

| Feed | URL (prod) | Built by |
|------|------------|----------|
| Deck meta | `/meta/latest.json` | `npm run meta` (minified) |
| Dated archive | `/meta/YYYY-MM-DD.json` | same (pretty; used for list diffs) |
| Meta history | `/meta/history.json` | same (`updateHistory` in build-meta) |
| Set radar | `/meta/sets.json` | `npm run sets` (minified; `formats` hub carries `standard.rotation` + `bans`, 0.21) |
| Soft updates | `/version.json` | app release |
| Hard updates | `/updater/latest.json` | app release (signed) |

**Pipeline rules:** real Scryfall-validated lists only; abort without write on failure; Standard + Pioneer only; **no Alchemy** on set radar.

**Local-only client state (prefs key `bbi.prefs`):**

- `defaultMode`, `notifyArenaEve`, `notifyMatchEnd` (0.18, default off), **`notifyBanlist`** (0.21, default **on**), `fullscreen`, `lastFormatId`
- Tracker matches (JSONL via Rust)
- Set card snapshot for “new since last visit” (`bbi.sets.cardSnap`)
- Ban-list snapshot for the B&R pulse (`bbi.bans.snap`, 0.21) — first sight is a baseline, not an alert
- Last-good meta/sets caches

---

## 6. Feature module map (don’t reimplement)

### v0.18.0 content engine + infra

| Concern | Files |
|---------|--------|
| Card / archetype list diff | `src/services/archetypeDiff.ts` + `ArchetypeDiffPanel.tsx` on DeckView; `fetchDatedMeta` in `metaFeed.ts` |
| Meta share history | `src/services/metaHistory.ts` + `MetaShareTimeline.tsx` on Daily; pipeline `history.json` |
| You vs meta | `src/services/personalMeta.ts` + `PersonalMetaPanel.tsx` on Daily |
| Week recap PNG | `src/services/recapStats.ts` + `recapCard.ts`; button on Stats |
| Match-end toast | `useAppStore` `notifyMatchEnd` + `onMatch` → `notifyDesktop`; Settings checkbox |
| 429 policy | `src/services/retryPolicy.ts` (tests) + pipeline `scryfall.mjs` / `sets.mjs` (max 8) |
| CI failure issues | `.github/workflows/daily-meta.yml` — **title-only** match (no `pipeline-failure` label; label would 422) |
| Unit tests | `npm test` → `src/services/*.test.ts` |

### v0.19.0 owner refinement batch (shipped)

| Concern | Files |
|---------|--------|
| Fullscreen (Settings → Display + F11) | `src/services/windowMode.ts`, prefs `fullscreen` in `useAppStore`, `src-tauri/capabilities/default.json` (`allow-set-fullscreen`) |
| Decks home hero ("Deck to beat") | `src/pages/Daily.tsx` + `.daily-hero*` in `index.css` — hero first, top-8 grid, insights demoted below |
| Format hub (legality/rotation/bans) | pipeline `sources/sets.mjs` (`buildFormatHub`, whatsinstandard v6 + Scryfall `banned:` searches, fails soft to `formats: null`), `types/sets.ts` `FormatHub`, `FormatHubSection` in `src/pages/Sets.tsx` |
| My Stats decklist + copy | `src/components/TrackedDecklist.tsx` (full list, curve, SB, Arena-format copy), `arenaCards.ts` caches `typeLine`/`manaCost`/`cmc` (`{ full: true }` re-fetches old entries), arsenal fans clickable (`Stats.tsx`) |
| Shared mana pips | `src/components/ManaCost.tsx` (extracted from Sets) |

### v0.21.0 current-events batch (shipped — this session)

| Concern | Files |
|---------|--------|
| **B&R pulse** | `src/services/banPulse.ts` (+ test) diffs feed `formats.*.bans` vs localStorage `bbi.bans.snap`; `src/components/BanPulse.tsx` banner on Daily; `useAppStore` `banChanges` + `markBansSeen` + `notifyBanlist`; Settings checkbox. Baseline-not-alert on first sight; toast fires once per change signature (`bbi.bans.notifiedSig`). |
| **Rotation impact** | Pipeline `sources/sets.mjs` `buildRotationImpact` (Scryfall `f:standard` rotating-vs-staying set diff, whatsinstandard exit dates) → `formats.standard.rotation` `{nextDate, roughLabel, setCodes, cardNames}`; `types/sets.ts` `RotationImpact`; `src/services/rotationImpact.ts` (+ test) `deckRotationImpact`; DeckView panel + per-card ⟳ markers; Sets hub card count. Basic lands excluded. |
| **Climb polish** | `src/services/climbStats.ts` (+ test) `currentStreak` / `longestStreak` / `seasonSummaries` / `previousSeasonSummary`; `src/pages/Climb.tsx` streak chips + loss-streak note + `SeasonCompareCell` row; `.climb-streak` / `.season-compare*` in `index.css`. |
| **Pipeline hardening** | `sources/sets.mjs`: ship future sets with <5 spoiled cards (first-looks) + undated Scryfall rows; `.github/workflows/sets-refresh.yml` (00/12/18 UTC, own failure issue); `daily-meta.yml` rebase-before-push. `docs/MAINTENANCE.md` = self-maintains vs. monthly checklist. |

> **Data feeds vs. app releases:** `formats.standard.rotation` and the ban lists ride the **sets pipeline** (`npm run sets`, 4×/day CI) — they refresh with no app bump. The app just reads them. New sets/spoilers/bans appear automatically once Scryfall catalogs them; see `docs/MAINTENANCE.md`.

---

## 7. Workflow patterns

### 7.1 Day-to-day

```bash
npm install
npm run tauri:dev
npm test                 # vitest pure logic
npx tsc --noEmit         # or npm run build
```

### 7.2 Data-only (no version bump)

```bash
npm run meta
npm run sets
# commit website/meta + public/meta if changed; push main
```

### 7.3 App release (full AGENTS.md checklist)

**Source-only is not a release.** Bump together: `package.json`, `package-lock.json` root version, `src/version.ts` (+ `WHATS_NEW`), `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, then signed build.

#### Signing (Windows)

- Private key: `%USERPROFILE%\.tauri\filthy-net-deck.key` (**encrypted**) — the ONLY valid signing key (minisign id `67FCA9900F523D49`, matches `tauri.conf.json` pubkey)
- Password file (local only, **never commit**): `%USERPROFILE%\.tauri\filthy-net-deck-key-password.txt`  
  (Owner also knows the passphrase; if file missing, **ask** — do not ship unsigned and call it done.)
- Public key already in `tauri.conf.json` → `plugins.updater.pubkey`
- A **retired** key pair (id `65CB5BD2EA8C8ACB`) that used to sit in the repo root was moved to
  `%USERPROFILE%\.tauri\retired-keys\` on 2026-07-18. It does NOT match the shipped pubkey —
  signatures from it look valid but break auto-update. Never sign with it. After signing, sanity-check
  the `.sig`'s key id equals `67FCA9900F523D49`.

```powershell
$key = ([IO.File]::ReadAllText("$env:USERPROFILE\.tauri\filthy-net-deck.key") -replace '\s','').Trim()
$env:TAURI_SIGNING_PRIVATE_KEY = $key
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = (Get-Content "$env:USERPROFILE\.tauri\filthy-net-deck-key-password.txt" -Raw).Trim()
# or ask owner for passphrase
npm run tauri:build
```

Copy:

```
website/downloads/Filthy-Net-Deck-Setup-<ver>.exe
website/downloads/Filthy-Net-Deck-Setup-<ver>.exe.sig
website/updater/latest.json   # version, notes, pub_date, platforms.windows-x86_64.{url,signature}
website/version.json + public/version.json
website/index.html            # links + marketing
website/assets/_gen_og.py → og-image.png + ?v=<ver> cache-bust
```

```bash
git push origin main
git tag vX.Y.Z && git push origin vX.Y.Z   # macOS CI
# later: Roll vX.Y.Z out to macOS. (dmg only, no version bump)
```

#### Verify live

- `https://filthy-net-deck.netlify.app/version.json`
- `https://filthy-net-deck.netlify.app/updater/latest.json`
- In-app **Update & restart** (not only browser download)
- Optional: OG share preview

#### macOS

- Tag → `.github/workflows/macos-build.yml` → GitHub Release asset  
- Pull dmg → `website/downloads/` → fix index.html → commit `Roll vX out to macOS.`  
- Full signed **mac auto-update** still an owner decision (repo secret vs soft dmg CTA — soft path already in Settings when URL ends in `.dmg`)

### 7.4 Marketing mock must match app nav

Real nav order: **Decks · Events · Sets · My Stats · Matchups · Climb · Settings**.  
Do not ship a hero mock that is Matchup-Lab-only without Sets (fixed in 0.18 marketing pass).

---

## 8. Explicit non-goals

In-game overlay (ToS), price tracking, cloud sync, mobile/APK tracking promises, Alchemy/Historic, fabricated matchup/sideboard content.

**Deferred (needs owner assets):** marketing screenshot/GIF carousel at 1280×860.

---

## 9. Session notes (handoff out — 2026-07-18, Claude Fable 5)

- Owner may pick this up next with **Grok or Kimi** later today. This file + `AGENTS.md` are model-agnostic — follow them as written.
- **`main` is clean** after wrap-up commits (`HEAD = Roll v0.21.0 out to macOS`). Nothing staged or half-done. 47 tests pass, `tsc` clean, `npm run build` clean.
- This session (started from the "will new Magicon cards auto-appear?" question): hardened the set pipeline (first-look spoilers, 4×/day), then built + shipped the **v0.21.0** batch (B&R pulse, rotation impact, Climb polish) end-to-end.
- **Watch for the cron push-race:** `sets-refresh.yml` (00/12/18 UTC) + `daily-meta.yml` (06:00 UTC) both commit `sets.json` to `main`. If your release also regenerated the feed, rebase will conflict on `website/meta/sets.json` + `public/meta/sets.json` — resolve by re-running `npm run sets`, `git add` both, `git rebase --continue`.
- Prefer **batched** product work over micro-releases; prefer **signed Update & restart** over browser `.exe`.
- When in doubt: **`AGENTS.md` > handoff > ROADMAP`.**
- Do not commit signing keys or passphrases. Password lives only under `%USERPROFILE%\.tauri\`. Verify any `.sig`'s key id = `67FCA9900F523D49` (not the retired `65CB5BD2EA8C8ACB`).

---

## 10. Quick verify commands

```bash
git status
git log -5 --oneline
npm test
npm run build
# Live:
# curl -s https://filthy-net-deck.netlify.app/version.json
# curl -s https://filthy-net-deck.netlify.app/updater/latest.json
```

# Filthy Net Deck — handoff for whichever agent picks this up next

**Audience:** Any coding agent continuing this project. The owner rotates between **Claude Code** (Fable 5 / Sonnet), **Grok 4.5**, and **Kimi**. Nothing here is model-specific; follow it regardless of which model you are.  
**Last wrap-up:** 2026-07-18 — Kimi; shipped **v0.22.0** end-to-end (Future Standard roadmap sets + Ctrl+K card watch + Matchup Lab QoL — Windows signed live, macOS dmg via tag CI). Also: sets feed v1.2.0 (`futureSets`), 63 tests green.  
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
| **Set Radar** | Arena-first spoilers, galleries, legality, spoiler + B&R pulse banners, Arena-eve notify, **Future Standard** roadmap sets (0.22) |
| **Card watch (0.22)** | Ctrl+K palette — which meta decks play any card (copies/board), deck jump, page nav |
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
| **App version** | **0.22.0** — Future Standard roadmap sets, Ctrl+K card watch, Matchup Lab save-as-you-type (0.21.0 shipped B&R pulse / rotation impact / Climb compare) |
| **Branch / HEAD** | `main` @ `Release v0.22.0` |
| **Tag** | `v0.22.0` pushed (macOS CI) |
| **Windows** | Signed installer + `.sig`: `website/downloads/Filthy-Net-Deck-Setup-0.22.0.exe` · updater `website/updater/latest.json` (sig key id **67FCA9900F523D49** verified) · soft channel `website/version.json` + `public/version.json`. In-app path is the signed plugin-updater. **Owner: verify Update & restart 0.21→0.22.** |
| **macOS** | **0.22.0** universal dmg on site (tag CI succeeded; rolled into `website/downloads/`, both `index.html` mac links → 0.22.0). |
| **Marketing** | Hero/OG lead with Future Standard + Ctrl+K card watch; OG `?v=0.22.0` regenerated. |
| **Netlify** | Publish dir is **`website`**. Live `version.json` / `updater/latest.json` / `meta/sets.json` (feed v1.2.0, `futureSets` ×6) / og-image / installer all confirmed **0.22.0** on 2026-07-18. |
| **Tests** | `npm test` (vitest) — 63 pass; new suite cardWatch (14), personalMeta +2. |

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
| **0.22.0** | **Roadmap + card watch batch**: Future Standard (curated source-linked roadmap sets, auto-reconciled vs Scryfall), Ctrl+K card watch palette, Matchup Lab save-on-type + helper dedupe |

---

## 3. Immediate next tasks (for the next agent)

1. **Nothing blocking.** v0.22.0 shipped end-to-end on 2026-07-18: signed Windows publish (sig key id verified), macOS dmg built by tag CI + rolled, marketing + OG live. All live endpoints confirmed 0.22.0 (version.json, updater, sets.json `futureSets` ×6, og-image 200, installer 200).
2. **One unverified check (owner):** the in-app **Update & restart** path from an *installed* 0.21.0 → 0.22.0 could not be exercised from the dev environment. Everything it depends on is live and correctly signed. Worth a manual click when convenient.
3. **Owner marketing push** — post from [@MBrewlab](https://x.com/MBrewlab); the link unfurls the fresh OG card (`?v=0.22.0`), no image attachment needed.
4. **Future Standard upkeep** — `pipeline/sources/future-sets.json` is the one curated input: after each WotC roadmap reveal, add/replace entries (they auto-drop once Scryfall catalogs the set or an exact date passes). `docs/MAINTENANCE.md` monthly item 3.
5. **Next product batch** — see `ROADMAP.md` "Suggested next" (rotation badges as the date nears; screenshot carousel still needs owner assets; signed mac auto-update still an owner decision).
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
│   ├── build-sets.mjs        # sets.json (slimmed) — formats hub incl. rotation impact (0.21) + futureSets (0.22)
│   └── sources/              # goldfish, scryfall (429 caps), sets.mjs (buildRotationImpact, buildFutureSets), future-sets.json (0.22), …
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

### v0.22.0 roadmap + card watch batch (shipped — Kimi session)

| Concern | Files |
|---------|--------|
| **Future Standard** | `pipeline/sources/future-sets.json` (curated, every entry source-linked); `sources/sets.mjs` `buildFutureSets` (drops entries on normalized-name match vs Scryfall rows, or when an exact date passes) → `SetsBundle.futureSets`; `types/sets.ts` `FutureSet`; `FutureStandardSection` in `src/pages/Sets.tsx`; `.future-set-*` in `index.css`. Feed `sets.json` version 1.2.0. |
| **Card watch / Ctrl+K** | `src/services/cardWatch.ts` (+ 14 tests) — indexes every meta decklist (format × mode × main/side); `src/components/CommandPalette.tsx` (self-managed open via Ctrl/Cmd+K, Escape, arrow nav, occurrence cap); mounted in `App.tsx` + topbar `.palette-hint` button (dispatches a synthetic Ctrl+K); `.cp-*` in `index.css`. |
| **Matchup Lab QoL** | `src/pages/Matchups.tsx` — tag/notes save on every keystroke (no blur-loss); `winrateFavor` deduped into `ranks.ts` (was ×3); `currentStreak` deduped into `climbStats.ts` (`Stats.tsx` call-site adapted to `{type,length}`); `personalMeta.ts` substring join now longest-key-wins (+ 2 tests). |

> **Data feeds vs. app releases:** `formats.standard.rotation` and the ban lists ride the **sets pipeline** (`npm run sets`, 4×/day CI) — they refresh with no app bump. The app just reads them. New sets/spoilers/bans appear automatically once Scryfall catalogs them; see `docs/MAINTENANCE.md`. `futureSets` rides the same feed — but its *entries* are curated by hand in `future-sets.json` (no API exists for roadmap-only announcements).

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

## 9. Session notes (handoff out — 2026-07-18, Kimi)

- Owner picked this up with **Kimi** after the Claude wrap-up: built + shipped the **v0.22.0** batch (Future Standard roadmap sets, Ctrl+K card watch, Matchup Lab QoL) end-to-end the same day. 63 tests pass, `tsc` clean, `npm run build` clean, signed build key id verified.
- **`main` is clean** after wrap-up commits. Two coder subagents built the palette + Matchup Lab fixes in parallel (zero-context briefings, verified reports); pipeline, UI, integration, and release by the main agent.
- **Feed v1.2.0:** sets.json now carries `futureSets` — curated in `pipeline/sources/future-sets.json` (the only hand-maintained roadmap input; WotC's 2027 announcement + Variety are the current sources). Self-heals: entries drop on Scryfall name-match or when an exact date passes. New reveals need a human entry — `docs/MAINTENANCE.md` monthly item 3.
- **2027 roadmap data (verified 2026-07-18):** Nauctis: The Sunken Realm 2027-02-05, Kamigawa: Titanbreach 2027-06-04, Zhalfir 2027-10-01 (all official, magic.wizards.com), + three unannounced Universes Beyond slots ~Apr/Aug/Nov (Variety). Already on the Scryfall radar and *not* in future-sets: `hob` 2026-08-11, `fra` (Reality Fracture) ~2026-09-29, `sds`/`trk` ~2026-11-10.
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

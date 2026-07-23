# Filthy Net Deck — what self-maintains vs. monthly hands-on

Goal: the app tracks real-world MTG events with as little lag as possible.
This page says exactly which parts run themselves and which need a human.

## Fully automatic (no action needed)

| Surface | Mechanism | Lag |
|---------|-----------|-----|
| New sets & spoiled cards (incl. panel first-looks) | Scryfall catalogs official spoilers → `sets-refresh.yml` (every 4h) + daily meta job (06:00 UTC) rebuild `sets.json` → Netlify → apps auto-sync | Hours (Scryfall) + ≤4h (CI) + ≤90min (app) |
| **Fresh spoilers (ahead of Scryfall)** | `pipeline/sources/mythicspoiler.mjs` scrapes MythicSpoiler new-spoilers → cards Scryfall hasn't cataloged attach as `freshSpoilers[]` on upcoming/spoiling sets → gallery "Just spoiled · unconfirmed" strip. Self-heals: each card drops the moment Scryfall catalogs it (normalized-name match). Fail-soft | ≤4h (CI) + ≤90min (app) |
| Deck meta (Standard + Pioneer 8×8) | `daily-meta.yml` scrapes magic.gg / MTGO / Goldfish / Melee / Untapped, Scryfall-validates, commits `latest.json` | ≤24h |
| **Public meta-web deck pages** | Same daily cron runs `npm run meta:site` after `npm run meta`, regenerating every static page under `website/meta-web/` from the fresh feed, then commits `website/meta-web/` + sitemap. Without this step the HTML was staged but never rebuilt (audit 2026-07-22). | ≤24h |
| Bans / restrictions | Scryfall `banned:` searches in the sets build — the moment Scryfall applies a B&R update, the next radar run ships it | Hours–1 day |
| **B&R announcement alerts** (0.21) | The app diffs each feed's ban lists against a local snapshot; a real Banned & Restricted update raises a banner on Decks + an opt-in desktop toast. No code change per announcement | Feed lag + ≤90 min app sync |
| **Rotation impact** (0.21) | The sets build computes which Standard cards leave at the next rotation (Scryfall `f:standard` set-diff + whatsinstandard exit dates). Every Standard deck shows what it loses; the card list refreshes itself as sets rotate in/out | Automatic |
| Standard rotation calendar | whatsinstandard.com v6 API | Automatic |
| New-card legality in decklists | Scryfall `/cards/collection` at pipeline time — new cards are on Scryfall well before they're tournament-playable, so validation never lags reality | None |
| Pipeline failures | Both workflows auto-open/refresh a GitHub issue on failure (**"Daily meta pipeline failure"** / **"Set radar refresh failure"**) — silent rot is impossible | Immediate |
| App-side freshness | No refresh button: re-sync on launch, on regained connectivity, on focus/hourly when >90 min stale | ≤90 min |

Fail-safe everywhere: every builder **aborts without writing** when live data is
unavailable, so the previously published real data stays up (never fabricated,
never silently stale-as-fresh).

## Monthly hands-on checklist (~15 min)

1. **GitHub issues** — open the repo's Issues tab. If "Daily meta pipeline
   failure" or "Set radar refresh failure" is open, that's the priority: open the
   linked run, fix the source module in `pipeline/sources/`, close the issue.
   (Turn on GitHub email notifications for the repo so you hear about these the
   day they happen, not at month-end.)
2. **Arena dates** — `pipeline/sources/set-calendar-overrides.json`: for each
   upcoming set on the Sets page showing an *estimated* Arena date, check WotC /
   magic.gg announcements and add the official date + source URL. This is the
   only data with no API. Also fill `spoilerStart` when preview seasons are
   announced.
3. **Roadmap sets** — `pipeline/sources/future-sets.json` (Future Standard
   section): after any WotC preview panel / roadmap announcement, add newly
   revealed sets with `sourceUrl` links (magic.wizards.com preferred).
   Entries **drop out automatically** once Scryfall catalogs the set or an
   exact date passes — but if WotC *changes* a date or name, edit the entry by
   hand. When an unannounced Universes Beyond slot gets its name, replace it
   (new name + `official` confidence + WotC source).
3b. **Set announce trailers** — `pipeline/sources/set-trailers.json` (+ client
   fallback `src/services/setTrailers.ts`): when WotC drops an official
   YouTube announce trailer, add the 11-char `youtubeId` under `byName`
   (and `byCode` once Scryfall has a code). Never invent IDs. Prefer the
   Magic: The Gathering channel. Run `npm run sets` so the feed attaches
   `trailer` on set cards / Future Standard rows.
4. **Winrate tracker vs. Arena updates** — after any Arena client update, open
   My Stats; if the parse-error warning shows, run the replay harness
   (`FND_REPLAY_LOG=<Player.log> cargo test replay_real_log -- --nocapture
   --ignored` in `src-tauri`) and fix `tracker.rs`.
5. **Source quality spot-check** — in the app, glance at deck `listQuality`
   badges / Settings sources. If everything degraded to Goldfish-only or
   `partial`, a scraper (magic.gg / MTGO) probably changed its HTML — check the
   latest CI run logs even if it "succeeded".
5c. **Standard Bo1 board (Untapped)** — the Bo1 board is ranked by Untapped's
   free public ladder analytics (`pipeline/sources/untapped.mjs
   fetchStandardBo1Ladder` → `archetypes_by_event_scope_and_rank_v2/free`,
   decoded by `buildBo1BoardFromArchetypes`); Bo3 stays MTGGoldfish tournament
   data. Requests must send browser-like `Origin`/`Referer` for
   `mtga.untapped.gg` — without them Untapped returns a 6-row stub that
   fails the ≥4-archetype gate and the pipeline silently mirrors Bo3
   (regression 2026-07-23). Ladder archetypes with no tournament list
   (e.g. Mono-White Auras) get their most-played ladder list from the free
   decks endpoint — deckstring decoded by `decodeUntappedDeckString` (varint
   format, version 4; layout documented in the function), names via mtgajson
   `loc_en.json`, then normal Scryfall validation. If either API drifts, the
   pipeline soft-falls back (board → Bo3 mirror; lists → archetype skipped)
   and logs diagnostics — symptom in-app: Bo1 and Bo3 Decks boards identical
   again, or ladder-only decks missing. Fixture net: `pipeline/untapped.test.mjs`
   (legacy trend decoder + free-archetypes decoder + two real deckstrings).
   Pioneer/Explorer Bo1 stats are premium-walled — Pioneer intentionally
   mirrors Bo3.
5b. **MTGO alias map** — when a new Universes Beyond set with dual-identity
   printings (printed alias ≠ canonical name, like OM1 Marvel) enters
   Standard/Pioneer, rerun `node scripts/gen-mtgo-name-map.mjs om1 <newset>`
   so MTGO decklists keep validating whole. Symptom if stale: pipeline
   diagnostics show `MTGO cleaned (unknown=<alias name>)` and a deck ships
   short (e.g. 58/60).
6. **whatsinstandard API** — the build warns if v6 reports itself deprecated;
   check the CI log for `check for v7` and migrate `fetchStandardRotation` in
   `pipeline/sources/sets.mjs` if so.
7. **Netlify + updater** — confirm `https://filthy-net-deck.com/version.json` (and legacy `https://filthy-net-deck.netlify.app/version.json`)
   and `updater/latest.json` are live and match the shipped version (critical if
   a custom domain migration happens — installed apps pin the netlify URL).
8. **MythicSpoiler fresh spoilers** — fail-soft, so a MythicSpoiler outage or
   redesign silently yields zero fresh cards (never a CI failure). Symptom if the
   page structure drifts: the sets-build log stops printing `+N fresh
   (mythicspoiler)` during an active spoiler season. Fix: reparse
   `pipeline/sources/mythicspoiler.mjs` against the new HTML (parser keys on
   `<code>/cards/<slug>.jpg` image paths) and update `mythicspoiler.test.mjs`.

## Known structural limits (can't be automated)

- **Roadmap-only announcements** (a set *name* revealed with zero cards and no
  Scryfall row) appear only once Scryfall creates the set — historically within
  a day of official announcements. Nothing to do; it self-heals.
- **Arena release dates** have no official API — overrides file, see item 2.
- **Arena `Player.log` format** is unofficial; only a human with a live log can
  verify a parser fix — see item 3.
- **Scraper HTML drift** (Goldfish/Melee/magic.gg redesigns) needs a human once
  detected — but detection itself is automatic via the failure issues.
- **`.git` pack bloat** from historical installers — working tree is pruned each
  release; shrinking history requires a coordinated filter-repo force-push.
  See `docs/GIT-HISTORY-BLOAT.md`. Do **not** force-push from CI/agents.

## Release download hygiene

After every app release:

1. `website/downloads/` should contain only the **current** (optionally +1 prior)
   Windows `.exe` + `.sig` and macOS `.dmg`.
2. Confirm `public/downloads/` is empty / gitignored.
3. Optional: schedule the history rewrite in `docs/GIT-HISTORY-BLOAT.md` when
   clone times become painful.

## Downloads hygiene (avoid repo bloat over time)

`website/downloads/` is served verbatim by Netlify, so **only the current
release needs to live there** — that is the URL the updater
(`updater/latest.json`) and the site buttons point at. Historical installers
just grow the tree and every Netlify deploy.

- **Policy:** when cutting a release, the new installer set (exe/sig/dmg)
  replaces the old one in `website/downloads/`; don't accumulate. As of the
  2026-07-19 audit the dir was trimmed to **1.1.1-only** (383 MB → 23 MB).
- **Archive:** macOS dmgs are attached to each GitHub Release automatically
  (`macos-build.yml`). Old installers also remain in git history.
- **Deferred — Windows-exe archival:** Releases currently have **only the dmg**,
  not the Windows `.exe` (built on the dev box, never uploaded). If a full
  public Windows archive is wanted, `gh release upload vX.Y.Z <exe> <sig>` for
  the old versions. Otherwise old Windows exes are recoverable only from git
  history.
- **Deferred — reclaim `.git` size:** pruning the working tree does **not**
  shrink history (~500 MB of old binaries remain in past commits). Reclaiming it
  needs a history rewrite (`git filter-repo` / BFG) + force-push. Risky because
  CI and releases push to `main` — coordinate a quiet window, rewrite, then have
  every clone re-clone. Low priority; the working tree + deploy are already lean.

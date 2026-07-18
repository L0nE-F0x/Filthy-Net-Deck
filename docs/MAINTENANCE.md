# Filthy Net Deck — what self-maintains vs. monthly hands-on

Goal: the app tracks real-world MTG events with as little lag as possible.
This page says exactly which parts run themselves and which need a human.

## Fully automatic (no action needed)

| Surface | Mechanism | Lag |
|---------|-----------|-----|
| New sets & spoiled cards (incl. panel first-looks) | Scryfall catalogs official spoilers → `sets-refresh.yml` (00/12/18 UTC) + daily meta job (06:00 UTC) rebuild `sets.json` → Netlify → apps auto-sync | Hours (Scryfall) + ≤6h (CI) + ≤90min (app) |
| Deck meta (Standard + Pioneer 8×8) | `daily-meta.yml` scrapes magic.gg / MTGO / Goldfish / Melee / Untapped, Scryfall-validates, commits `latest.json` | ≤24h |
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
4. **Winrate tracker vs. Arena updates** — after any Arena client update, open
   My Stats; if the parse-error warning shows, run the replay harness
   (`FND_REPLAY_LOG=<Player.log> cargo test replay_real_log -- --nocapture
   --ignored` in `src-tauri`) and fix `tracker.rs`.
5. **Source quality spot-check** — in the app, glance at deck `listQuality`
   badges / Settings sources. If everything degraded to Goldfish-only or
   `partial`, a scraper (magic.gg / MTGO) probably changed its HTML — check the
   latest CI run logs even if it "succeeded".
6. **whatsinstandard API** — the build warns if v6 reports itself deprecated;
   check the CI log for `check for v7` and migrate `fetchStandardRotation` in
   `pipeline/sources/sets.mjs` if so.
7. **Netlify + updater** — confirm `https://filthy-net-deck.netlify.app/version.json`
   and `updater/latest.json` are live and match the shipped version (critical if
   a custom domain migration happens — installed apps pin the netlify URL).

## Known structural limits (can't be automated)

- **Roadmap-only announcements** (a set *name* revealed with zero cards and no
  Scryfall row) appear only once Scryfall creates the set — historically within
  a day of official announcements. Nothing to do; it self-heals.
- **Arena release dates** have no official API — overrides file, see item 2.
- **Arena `Player.log` format** is unofficial; only a human with a live log can
  verify a parser fix — see item 3.
- **Scraper HTML drift** (Goldfish/Melee/magic.gg redesigns) needs a human once
  detected — but detection itself is automatic via the failure issues.

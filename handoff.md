# Filthy Net Deck — handoff

**Read this first.** Live top-of-todo across model/agent handoffs
(Claude / Opus / Grok / Kimi).

**Live product version: v3.3.0** (Windows signed updater + macOS dmg)
· repo `L0nE-F0x/Filthy-Net-Deck`

Windows signed updater is the ship path. macOS is a homepage dmg roll from
the GitHub Release — do not leave visitors on the previous dmg after CI
attaches the new one.

This Omarchy box **can** produce the signed NSIS + updater `.sig` (key in
`~/.tauri`, cargo-xwin, local NSIS). Authenticode is skipped on Linux;
that is expected and does not block auto-update.

---

# ▶ START HERE — next session

0. **v3.3.0 is live. Session closed. Do not rebuild.**

   Verified 2026-08-31 after `aa26eefc` Netlify deploy:
   - `https://filthy-net-deck.com/version.json` → `3.3.0`
   - `https://filthy-net-deck.com/updater/latest.json` → `3.3.0` (sig 428 bytes matches the `.sig`)
   - Setup-3.3.0.exe → 200, 7 804 141 bytes
   - Filthy-Net-Deck-3.3.0-universal.dmg → 200, 22 583 281 bytes
     (sha256 `5b36f7c9…70f0`, GH Release + Netlify)
   - homepage buttons + `og-image.png?v=3.3.0` (no leftover 3.2.0 installer links)
   - downloads = current + 1 (3.3.0 + 3.2.0)

   Overlay companion + quiet HUD + autostart ask + Arena-language i18n
   shipped as **3.3.0**. Tag `v3.3.0` already exists (source cut). Do not
   bump. Do not rebuild the Windows NSIS unless the updater signature is
   wrong on the live `latest.json`.

   Ticket + implementation log:
   **`docs/FRIEND-FEEDBACK-OVERLAY-IA.md`**.

   ### What shipped
   - Overlay vs **companion window** — same webview, not a fourth renderer.
     Companion: not always-on-top, on the taskbar, opaque, close button,
     survives match end and Arena quit until the user closes it.
   - Quiet collapsed HUD: clock · turn · **session** W–L · **Land n%**
     (next-draw) · archetype + **confidence**. Lists stay behind ▾.
   - First overlay appearance: “HUD over Arena” vs “Normal window”.
     Default stays overlay.
   - Set Radar pulse persist-dismiss; Update **Later** persists;
     deck-to-beat `{format} meta · BO1`.
   - P2 autostart ask (one-shot after Help tour — not silent-on).
   - i18n: en, es, fr, de, it, pt-BR, ja, ko. Remaining English: long
     Help bodies, some Settings paragraphs, Climb/Stats inner copy.
     Marketing site not translated.

   ### Signed Windows build on this Linux box (keep)
   Key id `67FCA9900F523D49` — `~/.tauri/filthy-net-deck.key` (copied from
   Temple 1TB `Users/Temple Lodge/.tauri/`, mode 600). Never commit it.
   Password file is `~/.tauri/filthy-net-deck-key-password.txt`.

   ```bash
   export PATH="$HOME/bin:/home/lonefox/tools/llvm-mingw/bin:$HOME/.cargo/bin:$PATH"
   export NSISDIR=/home/lonefox/tools/nsis/usr/share/nsis
   export XWIN_CACHE_DIR=$HOME/.xwin
   export TAURI_SIGNING_PRIVATE_KEY=$HOME/.tauri/filthy-net-deck.key
   export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(cat $HOME/.tauri/filthy-net-deck-key-password.txt)"
   npm run tauri:build -- --bundles nsis --runner cargo-xwin --target x86_64-pc-windows-msvc
   ```

   Output: `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/Filthy Net Deck_<ver>_x64-setup.exe` + `.sig`.
   Tauri will warn that **Authenticode** signing is Windows-only — ignore
   that; the updater minisign `.sig` is what `latest.json` needs.
   `~/bin/makensis` wraps the extracted NSIS 3.08 and sets `NSISDIR`.

   ### Linux local install (this Omarchy box — not marketed)

   Arena is on Steam Proton (app 2141910). The tracker now finds
   `Player.log` under the Proton prefix. Installed for the owner only:

   - binary: `~/.local/bin/filthy-net-deck` (rebuild: `npm run tauri:build -- --no-bundle` then `install` over that path)
   - launcher: `~/.local/share/applications/filthy-net-deck.desktop`
   - HUD Hyprland rule: overlay title float+pin in `~/.config/hypr/looknfeel.lua`

   Do **not** add Linux to the marketing site. Exclusive-fullscreen Arena
   will cover the HUD — use borderless windowed. Detailed Logs were
   **disabled** in the Proton `Player.log` last we looked; same Arena
   account toggle as Windows.

   ### Not live-tested with a real match on Linux
   Overlay auto-hide after match end; companion staying up after match /
   Arena quit; first-match chooser inside the real overlay webview;
   Proton process-name vs `MTGA.exe` path (badge / HUD show).

   ### Do not sneak in
   Silent autostart-on · extra nav items · ripping out the library
   tracker · flipping overlay default for existing users · notification
   centre · P2 autostart installer checkbox · translating the marketing
   site · rotating the signing key in the same commit as a release.

   ### Owner leftovers (not blockers)
   1. In-app **Check for updates** on an installed 3.2.0 — *Update & restart*.
   2. Link-share preview of the OG card (`?v=3.3.0`).
   3. Reply to Shane — draft below still refers to 3.2.0 deck-library;
      edit if sending now (3.3.0 is overlay/companion + i18n).
   4. **Rotate the signing key** when convenient (passphrase was pasted
      into a chat transcript on 2026-08-27). Key id `67FCA9900F523D49`.

1. **v3.2.0 was shipped 2026-08-27. Historical. Do not rebuild.**

   Grok wrapped Claude session `d46b6234` on 2026-08-27: rebased onto
   `origin/main`, signed Windows build, pushed `e695e79` + tag `v3.2.0`,
   then rolled the dmg in `b4a9b95`.

   ### Verified live
   - `https://filthy-net-deck.com/version.json` → `3.2.0`
   - `https://filthy-net-deck.com/updater/latest.json` → `3.2.0`
   - Setup-3.2.0.exe → 200, 7 574 959 bytes
   - Filthy-Net-Deck-3.2.0-universal.dmg → 200, 22 125 807 bytes
     (sha256 `5afe08f7…30da9b`, GH Release + Netlify)
   - downloads = current + 1 (3.2.0 + 3.1.9, Windows and dmg)
   - Migration 10 already applied — do not re-run.

   ⚠️ Signing passphrase was pasted into a chat transcript on 2026-08-27.
   **Rotate the signing key** when convenient (key id `67FCA9900F523D49`).

   ### Owner leftovers (not blockers, not for an agent to invent)
   1. In-app **Check for updates** on an installed 3.1.9 — *Update & restart*,
      not a browser download. Needs the running desktop app.
   2. Link-share preview of the OG card (`?v=3.2.0`).
   3. Reply to Shane — draft below. Edit the sign-off, then send. Both
      platforms are downloadable.

   ### Deliberately NOT part of this release
   - `supabase/maintenance/20260827_shared_matches_format_cleanup.sql` — run it
     **weeks later**, after users have updated and their decks have re-synced
     under true formats. Read-only diagnostic first. Not urgent: the rollup
     reads a 30-day window and fully rewrites itself, so the published numbers
     clean themselves once updated clients stop sending bad rows.
   - **Brawl commanders** — unresolved, needs a real log. See the open-question
     section below. Do not guess at a field name.

   ### Open question still unanswered
   - Add the signed-build command as `npm run release:build` in `package.json`
     so it is one memorable command per release? Not added in v3.2.0.

2. **Beta-tester feedback on the marketing site.** Owner will collect
   reports and pick this up later. Do not redesign the hero unless they
   ask — the live fan (Standard/Pioneer × Bo1/Bo3) is the chosen treatment.
3. Web-platform plan is `docs/WEB-PLATFORM.md`. Do not start `/matchups` on
   the site until gate G2 trips (a real `n ≥ 30` crowd cell).
4. Suggest / Report is live (site + app). FormSubmit is already
   activated for `ston3d4pe@gmail.com`. Leave it alone unless mail stops.

## Reply to Shane — send after v3.2.0 is live

`shane@coinz.org`, the reporter of both this ticket and the v3.1.9 basic-lands
one. Kept here because the only other copy was in a session scratchpad that does
not survive the handover. Owner should edit the sign-off. **Do not send before
the build is downloadable** — it says the feature has shipped.

> **Subject:** Re: Deck library across formats — yes, and you found a bug
>
> Shane,
>
> Second good ticket in a row. Short answer: most of this already exists, one
> part of it was quietly broken, and the missing piece is now built.
>
> **What's already there.** FND doesn't just read match results out of
> `Player.log` — it pulls the *decklist Arena registers* at the start of every
> match. That's already format-agnostic: your Historic, Timeless and Brawl games
> have been recorded the whole time, same as Standard. They're in **My Stats →
> Your decks**, each with version history (every time you swap cards, that's a
> new build, with a card-by-card diff and the win rate of each) and a **Copy
> decklist** button that gives you Arena import text.
>
> So the library exists. What it lacked was the two things that make it useful
> to you specifically.
>
> **The bug you surfaced.** FND worked out a match's format by looking for
> `"ladder"` in Arena's queue id. `Historic_Ladder` contains `"ladder"`. So did
> `Alchemy_Ladder` and `Timeless_Ladder`, and `Brawl` fell through to the
> default. Every one of them was being filed as **Standard**. Your Historic
> decks were being backed up with a "standard" label, and Historic games were
> being counted in the community Standard matchup data. Both fixed: decks now
> carry the format they were actually played in, and matches from formats FND
> doesn't cover are no longer uploaded to the community numbers at all.
>
> **What's new.** A single **Export decklists** button in My Stats. It writes
> your entire deck library to a folder in Downloads — one `.txt` per deck, named
> `Deck Name (Format).txt`, each one straight Arena import text. Every
> constructed format you play, no account needed, no sign-in, nothing uploaded.
> That's your "keep them in local files" workflow, minus the manual part. Run it
> before you cull down to 100 and nothing is lost.
>
> If you *do* make an account, deck backup rides the existing cloud toggle and
> covers all those formats too — that one matters because Arena's logs rotate,
> and once they do, a deck you haven't played recently is gone from your PC and
> Arena won't hand it back. Publishing a deck to `/u/<you>/<deck>` is a separate,
> per-deck choice — that's for sharing a link, not for backup. You don't have to
> publish anything to have it backed up.
>
> **One real limitation, worth knowing before you delete anything.** FND only
> sees a deck when you *play* it — it reads the list Arena hands over at match
> start. A deck sitting untouched in your collection isn't in the library. So if
> you're about to clear space: play one game with anything you want to keep (the
> Play queue counts), then export.
>
> **What isn't changing:** the metagame side stays Standard and Pioneer. No
> Historic tier list, no Brawl matchup rates. Keeping your decks and covering a
> format's metagame are different jobs, and I'd rather do the second one properly
> for two formats than badly for six.
>
> **One ask, if you're up for it.** Brawl is the one format I can't fully vouch
> for. FND reads the maindeck and sideboard out of the log, but I've never
> confirmed where Arena puts the *commander* — and I don't have a Brawl log to
> check against. Your decks will export, but the commander may not be tagged. If
> you play a Brawl game and send me the `Player.log` afterwards, I'll wire it up
> properly rather than guess. (Same place you found the log for the land report.)
>
> Thanks for the report. The format bug had been live for a while and nobody had
> hit it from an angle that made it obvious.
>
> — [owner]

## Previous session (2026-08-27)

Second in-app ticket from Shane (`shane@coinz.org`), v3.1.9: Arena's 100-deck
cap makes him archive decks to Goldfish/AetherHub or local text files; could FND
pull them out of `Player.log` into a deck library across Standard, Historic,
Explorer, Brawl? Owner's call: **do not add Historic/Brawl as covered formats**,
but back the *decks* up honestly.

| Item | Notes |
|------|--------|
| ✅ | **Root-cause bug — every prefixed queue was "Standard"** | `sync.ts formatFor` tested `id.includes("ladder")`. `Historic_Ladder`, `Alchemy_Ladder` and `Timeless_Ladder` all contain it; `Brawl` fell through to `meta.formats[0].id`. So non-covered formats were uploading into the **crowd matchup rollup as Standard**, and their decks were backed up + publishable with a `standard` chip. |
| ✅ | **`services/arenaFormat.ts`** | One honest queue→format resolver. Order is load-bearing: brawl before historic (`Historic_Brawl`), limited before the rest, Standard is the *leftover* not a guess. `metaFormatOf` (standard\|pioneer\|null) gates crowd data; `arenaFormatOf` labels decks. 12 tests. |
| ✅ | **Crowd data now rejects, never relabels** | Non-Standard/Pioneer matches return null → `buildSharedMatch` drops them. Unknown queues are dropped too — they used to become the featured format. Fewer uploads, all of them real. |
| ✅ | **Deck library covers every constructed format** | `decks.format` widened by migration 10 to standard/pioneer/historic/alchemy/timeless/brawl. Limited and unknown are skipped rather than given an invented label. Mislabelled rows self-heal: `format` is in `deckSyncFingerprint`, so the next sync re-upserts on `(user_id, deck_hash)`. |
| ✅ | **Format chip in My Stats** | `DeckGroup.format` from the *newest* match that named a queue (a post-rotation deck is Historic now); an unnamed match cannot blank a format the rest agree on. Covered formats get the gold chip, library-only formats a quiet one, `unknown` renders nothing. |
| ✅ | **Export decklists** | New: `tracker_export_decklists` writes one Arena-import `.txt` per deck to a dated folder in Downloads and reveals it. Runs over the **unfiltered** library, no account, all formats. Text is built client-side (`arenaExport`) — the Rust side still has no id→name map. Decks whose cards have not resolved are **held back, not trimmed**, because `toArenaDecklist` silently drops unnamed rows. |
| ✅ | **Shipped v3.2.0** | Windows signed updater live; macOS dmg rolled in this follow-up. |

### Hard-won this session

- **"Which format is this queue" and "which tier list do I show" are different
  questions.** `deckHelpers.formatIdForEvent` answers the second and returns
  null for everything uncovered — correct there, catastrophic when reused as the
  first. That reuse is what put Historic games in Standard's matchup cells.
- **A metagame is not a deck library.** The Standard+Pioneer non-goal is about
  *coverage* — tier lists, archetype data, matchup rates. It was never a reason
  to lie about what format the user's own deck is.
- **`toArenaDecklist` drops rows it cannot name.** Fine when publishing (the
  caller refuses on `unresolved > 0`); a trap anywhere else, because the output
  still looks like a valid decklist. Every new caller has to check the count.
- **Windows deck names.** Arena allows `Dimir? / "Midrange"`; NTFS does not, and
  `CON` cannot be a filename at all. `safe_file_stem` handles both, truncates by
  chars not bytes, and dedupes collisions rather than overwriting.

### Open question — needs a real log, not a guess

- **Brawl commanders are unverified.** Nothing in the chain reads one:
  `tracker.rs find_deck_message` takes `deckCards` + `sideboardCards` off the
  GRE `connectResp.deckMessage` and nothing else, and `toArenaDecklist` passes
  `commander: undefined` unconditionally — so a Brawl deck exports with no
  `Commander` header, though `buildArenaImport` can write one. Whether that
  *loses* the card or merely untags it depends on where Arena puts it, and there
  is **no Brawl fixture** in `src-tauri/tests/fixtures/logs/`. Deliberately not
  guessed at. Next step: get a Brawl `Player.log` (Shane is the obvious ask —
  his last report came with grpIds), add a fixture, then wire it through.

### Second pass — the local display half (same session)

The first pass fixed what was *uploaded*; every local page was still doing
`formatIdForEvent(...) ?? "standard"`. Owner asked for it in the same session.

| Item | Notes |
|------|--------|
| ✅ | **`localFormatOf(eventId, fallback)`** | The local policy, three-way: covered → itself; **known**-uncovered → null; **unnamed** → the page's own format. The old `?? "standard"` collapsed the last two, which is the entire bug. Deliberately weaker than `metaFormatOf` (which rejects unnamed queues too): a wrong row in the crowd rollup is everyone's problem, a wrong row in your own local record is only yours and is visible in the match list. |
| ✅ | **Matchups** | Historic/Alchemy/Timeless/Brawl/draft games no longer reach `archetypeForMatch`, so they cannot land in a `standard-*` row. Unnamed queues fall back to the **featured** format rather than a hardcoded "standard". A footnote counts what was left out — a record that silently shrinks is how this went unnoticed. |
| ✅ | **Overlay** | Was the worst one: an uncovered queue fell through to the featured format, so a Historic game had its opponent inferred against the **Standard** board — and a Historic Izzet list clears the 0.35 floor against Standard's Izzet deck easily. It now skips inference entirely. No line beats a wrong line. |
| ✅ | **Overlay says why (owner call, 2026-08-27)** | The overlay **has always shown in every format** — `tracker.rs` shows it on any `playing`/`ended` phase, with no format check, and the owner had assumed otherwise. Kept that way deliberately: library count, draw odds, lands left and revealed cards are all format-agnostic and hiding the HUD would take a working tracker off Historic players. The opponent tab now carries *"Archetype read off — untracked format"* where the read would be, muted rather than gold (gold reads as a live result on that HUD). Three states, not two: "not enough cards yet" vs "no deck field exists for this queue" — the second was silent and read as a bug. Style it with `?demo&untracked#/overlay`. |
| ✅ | **Daily + DeckView** | Same three-way policy; a Historic game no longer inflates a Standard archetype's "you vs this deck" chip. |
| ✅ | **List Clinic gated** | `closestRankedDeck` scans every format and takes the nearest by L1 — `preferFormat` is only a tie-breaker — so a Historic deck got "58 cards off Izzet Cauldron" rather than no result. DeckDetail now renders an honest "nothing to compare this to" panel instead. |
| ✅ | **Dead `syncRunner.formatForMatch` deleted** | Exported, zero importers, still carrying `?? "standard"`. Deleted rather than repaired — a dead export encoding the wrong rule is a trap for whoever reaches for it next. |
| ✅ | **CI flake fixed** | `pipeline/meta-site-links.test.mjs` is a synchronous crawl of the whole corpus; it passes in ~1 s alone but timed out against vitest's 5 s default under full parallel load. Given an explicit 30 s timeout — the default is sized for async hangs, not honest I/O. |

| ✅ | **`deckHelpers.formatIdForEvent` deleted too** | Migrating the five call sites left it with zero production callers. Its own tests always passed — the function did exactly what it documented. The defect was the *signature*: returning null for Standard **and** for Historic made `?? "standard"` the obvious call, and all five callers wrote it. A dead export whose natural call site is a bug does not survive on symmetry. |

### File inventory — the whole uncommitted v3.2.0 change

Curated so the release commit can be reviewed without re-deriving intent.
`git status` is the source of truth if these drift.

**New**
| File | Why |
|---|---|
| `src/services/arenaFormat.ts` (+ `.test.ts`) | The honest queue→format resolver. `arenaFormatOf` names the queue, `metaFormatOf` gates crowd data, `localFormatOf` gates local pages, `isUncoveredFormat` drives the UI notes. 19 tests. |
| `src/services/deckLibraryExport.ts` (+ `.test.ts`) | Builds the whole library as Arena import text. Carries the ⚠️ Brawl-commander note. 10 tests. |
| `src/components/stats/FormatChip.test.tsx` | jsdom render test for the format chip, incl. "unknown renders nothing". |
| `supabase/migrations/20260827120000_deck_library_formats.sql` | **Already applied.** Widens `decks.format`. Commit it for the record. |
| `supabase/maintenance/20260827_shared_matches_format_cleanup.sql` | Operator runbook, run later. Not a migration. |

**Modified — app behaviour**
| File | Why |
|---|---|
| `src/services/cloud/sync.ts` | The origin bug. `formatFor` → `metaFormatOf` (crowd), `deckFormatFor` → `arenaFormatOf` (decks). |
| `src/services/cloud/deckSync.ts` (+ test) | `DeckRow.format` widened to every constructed format; limited/unknown skipped. |
| `src/services/cloud/syncRunner.ts` | Dead `formatForMatch` deleted. |
| `src/services/deckHelpers.ts` (+ test) | Dead `formatIdForEvent` deleted — its null-for-Standard shape *was* the footgun. |
| `src/services/deckStats.ts` (+ test) | `DeckGroup.format`, from the newest match that named a queue. |
| `src/pages/Matchups.tsx` | Uncovered formats excluded + a footnote counting them. |
| `src/pages/Daily.tsx`, `src/pages/DeckView.tsx` | Same three-way policy on the "you vs this deck" chips. |
| `src/overlay/OverlayApp.tsx` | No archetype guess in uncovered formats + the "read off" note. |
| `src/overlay/demoLive.ts` | `?demo&untracked` knob to style that note in a browser. |
| `src/pages/Stats.tsx` | **Export decklists** button; runs over the *unfiltered* library. |
| `src/components/stats/{DeckBreakdown,DeckDetail,statsUi}.tsx` | Format chip, and the List Clinic replaced by an honest empty state for uncovered formats. |
| `src/index.css` | `.fmt-chip`, `.deck-row-label`, `.overlay-opp-note--off`. Verified in both themes. |
| `src-tauri/src/tracker.rs`, `src-tauri/src/lib.rs` | `tracker_export_decklists` + `safe_file_stem` (4 tests). |

**Modified — release + docs**
`package.json` · `src/version.ts` · `src-tauri/{Cargo.toml,Cargo.lock,tauri.conf.json}` ·
`website/version.json` · `public/version.json` · `website/index.html` ·
`website/privacy.html` · `website/assets/_gen_og.py` + `og-image.png` ·
`pipeline/build-meta-site.mjs` (PRIVACY_LASTMOD) ·
`pipeline/meta-site-links.test.mjs` (CI flake) · `README.md` · `handoff.md`

### Known, not fixed (deliberate)

- Nothing outstanding from the format work.

## Previous session (2026-08-25)

| Item | Notes |
|------|--------|
| ✅ | **First in-app bug report — Green Game Jam basic lands, no art** | Shane (`shane@coinz.org`) on v3.1.9: decklist / stacked view blank for Arena store basics from June. Scryfall `/cards/arena/107494` 404s. The five lands are ANA grpIds **107492–107496** (`DigitalReleaseSet: ANA-GGJ-2026`); he listed 107494–107498 in WUBRG order, off by two — 107497/107498 are MSC tokens. |
| ✅ | **Gap map now covers evergreen ANA** | `ana` never ages out of the 180-day window. Builder also searches Scryfall `pana` and joins on **name + artist**, so the Daren Bader Plains is not the 2018 Donato Giancola Plains. |
| ✅ | **No app bump** | 3.1.9 already reads `s`/`t` from `arena-names.json` after a Scryfall 404. Publishing the map is the ship. |

### Hard-won this session

- Arena dumps store cosmetics into **ANA**. Scryfall's `ana` is the 2018 New Player Experience; the paintings live in **pana** with `arena_id: null`. The 180-day window skipped both because `released_at` is 2018.
- Name-only join on "Plains" is how you show the wrong basic-land art. Evergreen dumps require artist. Same artist on Plains and Swamp (Daren Bader) is fine — the key is name+artist, not artist alone.
- mtgajson is the name authority, not the reporter's labels. 107494 is a Swamp, not a Plains.

## Previous session (2026-08-20)

| Item | Notes |
|------|--------|
| ✅ | **Copyable published decklists** | The ask: replace an AetherHub link in a YouTube description with an own-site link viewers can copy. Publishing a deck now uploads the list as **Arena import text**, and `/u/<handle>/<slug>` renders it with a one-click Copy button. `/d/<id>` 301s to the same page. |
| ✅ | **Profile rows are links** | Both tables on `/u/<handle>` now link a deck to its page when a published deck's name matches — with a `list` badge when there is one to copy. |
| ✅ | **v3.1.8 Windows** | Signed key id `67FCA9900F523D49`. Installer + `.sig` + updater + `version.json` + OG `?v=3.1.8`. |
| ✅ | **Migration 9 applied** | `20260820120000_public_decklists.sql`, run by the owner. Verified via REST: `has_list`/`list` select 200 while a bogus column 400s, and both the 3-arg and legacy 2-arg `set_deck_public` shapes resolve. |
| ✅ | **v3.1.8 macOS dmg rolled** | Pulled `Filthy-Net-Deck-3.1.8-universal.dmg` from the GH Release (sha256 `e06c66db…a345b`, 21 470 155 bytes). Both homepage Mac buttons repointed. downloads = current + 1 (3.1.8 + 3.1.7). |
| ✅ | **Favicon on the server-rendered pages** | `profile.mts` / `deck.mts` never had the icon links the static pages carry, so those tabs showed the browser's generic globe. Absolute URLs — the deck page is at a nested path where a relative href resolves wrong. |
| ✅ | **v3.1.9 macOS dmg rolled** | Pulled `Filthy-Net-Deck-3.1.9-universal.dmg` from the GH Release (sha256 `d953be46…78be3`, 21 567 165 bytes). Both homepage Mac buttons repointed. downloads = current + 1 (3.1.9 + 3.1.8). |
| ✅ | **v3.1.9 — decklist order + right-sized icons** | Published lists now read creatures → spells → lands (`aggregateDeck`'s order, reused). `favicon.png` was a byte-identical copy of the 1024px `app-icon.png` at **804 KB**, served on every page; now 64px / 5.7 KB, with a 128px `app-icon-128.png` for the 52px page-header avatar. |

### Hard-won this session

- **The server cannot name a card.** `meta/arena-names.json` is only the *gap*
  map for sets Scryfall has not indexed; `meta/sets/*.json` carries no arena
  ids at all. That is why the list is rendered client-side at publish time and
  uploaded as text — do not "improve" this by resolving ids in the function.
- **Names must go through `arenaCardName`.** Scryfall returns
  "Unholy Annex // Ritual Chamber"; Arena's importer rejects it. Without the
  front-face strip every Standard deck with an MDFC publishes an unimportable
  list.
- `public_profile_decks` exposes `has_list` (a boolean) *and* `list`. The
  profile page selects named columns and must never `select=*` — that would pull
  twelve decklists to evaluate twelve booleans, the same waste 20260812060000
  found.
- `set_deck_public` gained a **defaulted** third argument and kept `returns
  boolean` on purpose: a v3.1.7 client calls it with two named args and checks
  `data === true`. Changing either would break every installed older build.
- Consent is not retroactive: `public_list` is null for everything published
  before 3.1.8 and only an explicit publish from a 3.1.8+ client fills it.
- **Sorting a decklist by mana value alone puts the lands first** — they are
  MV 0. `aggregateDeck` in `deckShare.ts` already owns the right order
  (creatures → spells → lands, each by MV then name); `arenaExport` reuses it
  rather than reimplementing, so the published list, the share card and the
  deck screen cannot disagree.
- **A published list is frozen at publish time.** Changing the export order
  does not rewrite lists already on profile pages — the owner has to publish
  the deck again. That is inherent to storing the rendered text, and is the
  same reason the server cannot re-render one.
- `favicon.png` and `app-icon.png` were the same 1024px 804 KB file. Do not
  point a tab icon or a 52px avatar at the master again — `favicon.png` (64px)
  and `app-icon-128.png` exist for that. `apple-touch-icon` still wants the
  large one.

## Previous session (2026-08-18, later)

| Item | Notes |
|------|--------|
| ✅ | **Jace / Kaito / Tezzeret themes** | Sidebar Themes picker now has ten walkers. Jace = indigo mind-magic (deeper than Teferi's sky-ivory). Kaito = neon cyan + magenta. Tezzeret = etherium brass + gunmetal. Dark and Light palettes for each. |
| ✅ | **v3.1.7 Windows** | Signed key id `67FCA9900F523D49`. Installer + `.sig` + updater + `version.json` + OG `?v=3.1.7`. `711a91c`. |
| ✅ | **v3.1.7 macOS dmg rolled** | Pulled `Filthy-Net-Deck-3.1.7-universal.dmg` from the GH Release (sha256 `0448241f…c6fe9`, 21 382 310 bytes). Both homepage Mac buttons pointed at it. downloads = current + 1 (3.1.7 + 3.1.6). `f956918`. |
| ✅ | **Live** | `version.json` / `updater/latest.json` / Setup-3.1.7.exe / 3.1.7 dmg all 200 on filthy-net-deck.com. |

### Hard-won this session

- New skins append after Garruk. Teferi stays the sky/ivory blue; do not make Jace another ice-blue.
- Picker list already scrolls (`max-height: min(18rem, 40vh)`). Do not float the panel over the main pane.

## Previous session (2026-08-18)

| Item | Notes |
|------|--------|
| ✅ | **Today chip on My Stats** | New first filter chip. Scopes every home tile, queue, insight, season story, arsenal, splits, and match history to the **last 24 hours** (rolling, not calendar day). The existing TODAY tile stays local-calendar-day. |
| ✅ | **Always-visible time chips** | Filter bar no longer hides when only one season is present — Today / this season / All time are always there. |
| ✅ | **v3.1.6 Windows** | Signed key id `67FCA9900F523D49`. Installer + `.sig` + updater + `version.json` + OG `?v=3.1.6`. `e0d1ddb`. |
| ✅ | **v3.1.6 macOS dmg rolled** | Pulled `Filthy-Net-Deck-3.1.6-universal.dmg` from the GH Release (sha256 `71f27e60…6328e`, 21 380 156 bytes). Both homepage Mac buttons pointed at it. downloads = current + 1 (3.1.6 + 3.1.5). `4cef8bd`. |
| ✅ | **Live** | `version.json` / `updater/latest.json` / Setup-3.1.6.exe / 3.1.6 dmg all 200 on filthy-net-deck.com. |

### Hard-won this session

- `"today"` is a stats-window sentinel, not a `YYYY-MM` season key. Route it through `matchesForStatsWindow` — `seasonKeyOf(...) === "today"` matches nothing.
- Today = last 24 hours (`endedAt` within `[now-24h, now]`). The FormTiles TODAY number is still `isSameLocalDay`. Do not merge those two definitions.

## Previous session (2026-08-17)

| Item | Notes |
|------|--------|
| ✅ | **Suggest / Report** | Website + app button → `website/feedback.html`. FormSubmit emails `ston3d4pe@gmail.com`. Owner confirmed delivery after the one-time activation click. GitHub issue templates are the fallback. |
| ✅ | **Surfaces** | Homepage nav pill + hero + footer + download note; privacy + status; in-app topbar next to Help; Settings → Interface and About. `FEEDBACK_URL` / `appFeedbackUrl()` in `src/services/site.ts`. |
| ✅ | **v3.1.5 Windows** | Signed key id `67FCA9900F523D49`. Installer + `.sig` + updater + `version.json` + OG `?v=3.1.5`. In-app button is in the binary. `4eb7be3`. |
| ✅ | **v3.1.5 macOS dmg rolled** | Pulled `Filthy-Net-Deck-3.1.5-universal.dmg` from the GH Release (sha256 `a0faa4e2…db785`, 21 285 350 bytes). Both homepage Mac buttons pointed at it. downloads = current + 1 (3.1.5 + 3.1.4). `2d6f546`. |
| ✅ | **Live** | `version.json` / `updater/latest.json` / Setup-3.1.5.exe / 3.1.5 dmg all 200 on filthy-net-deck.com. |

### Hard-won that session

- The form is website-only. It is **not** an app upload-payload change, but privacy.html §7 still lists the fields (kind, message, optional contact, optional app version).
- FormSubmit’s first live submit only sends an activation mail. Owner already clicked it; later submits land in Gmail.
- Local `serve` pretty-URLs `/feedback.html?x=1` → `/feedback` and **drops the query**. Production Netlify serves `/privacy.html` as 200, so `?sent=1` / `?from=app&v=` keep working on the live domain.
- App UI is not live until a signed version bump. Shipping the site form first, then v3.1.5, is the right split.
- `git add a b missing` fails the whole add. Stage the new dmg and HTML in their own add, never reuse a path that `git rm` already consumed.

## Previous session (2026-08-16, later)

| Item | Notes |
|------|--------|
| ✅ | **Bo1/Bo3 hero pills** | Static “Bo1 · live” replaced with a sibling pill group. Four boards from `/meta/latest.json`. Pioneer Bo1/Bo3 share mainboard faces — dock flashes and shows `N-card SB`. `37bdba3`. |
| ✅ | **Stacked public lists** | Arena overlap (same as in-app): 128px columns, `height: 64px; margin-bottom: -38px`. Lands no longer a lonely void column. CSS in generator + `site.css`. Same commit. |
| ✅ | **CI lint** | Site commits that also touch `pipeline/` run the full CI. Unused `cardThumb` failed ESLint and mailed the owner on every such push. Wired into `listCards`. `4496c1f`. |
| ✅ | **Pushed** | `37bdba3` + `4496c1f` on `origin/main`. **No app bump.** Netlify = site only. |

### Hard-won this session

- `pipeline/` is **not** in CI `paths-ignore`. Editing `build-meta-site.mjs`
  for a CSS-only site fix still runs `eslint src pipeline --max-warnings 0`
  and emails on failure. Keep the generator lint-clean.
- Pioneer Bo1 and Bo3 are the same five mainboard faces. Do not put
  sideboard art on the fan — dock + SB count is the mode signal.

## Previous session (2026-08-16)

| Item | Notes |
|------|--------|
| ✅ | **Homepage hero = live fan** | Hand of 5 real Scryfall cards from today’s top 5. Standard / Pioneer toggle (Bo1/Bo3 pills came later the same day). Click side card to lift; click the lifted card or **Open list →** to `/meta-web/deck/<id>.html`. Driven by `/meta/latest.json`. Brand tokens + Segoe UI untouched. |
| ✅ | **Public meta pages** | Deck heroes get a 4-card art stack; hub/format tiles get art strips; Stacked / List / Text toggles (same as the app, remembered in `localStorage`). Format pages (Std + Pio) have hero art. |
| ✅ | **Copy** | Hero no longer says “MTGO only”. Pipeline is MTGO → magic.gg → Goldfish, plus Untapped ladder when that’s the list (today’s #1 Auras is). Matchup Lab line removed. |
| ✅ | **Web platform plan** | `docs/WEB-PLATFORM.md` — site as public face of FND data, not a second desktop app. Pointer in `PLATFORM-STRATEGY.md` §1.6. |
| ✅ | **Pushed** | `7b52fe7` `site: live hero fan + public meta deck views` on `origin/main`. **No app bump.** Netlify = site only. |

### Hard-won that session

- Marketing-only HTML is not an app release. Do not bump `package.json` /
  installer for a homepage layout change.
- **Do not put `rotateX` / `translateZ` / `preserve-3d` on the fan hand.**
  Chromium then draws the cards in one place and hit-tests another — they
  look clickable and are not. Production fan is flat 2D (`translate` +
  `rotate` + `scale`).
- Hero fan files: `website/hero-fan.js` + `website/hero-fan.css`. Lab
  geometries (coverflow / helix / tesseract / etc.) were prototypes and
  were **not** shipped.
- `pipeline/build-meta-site.mjs` owns `/meta-web/` HTML + `site.css` +
  `view.js`. Edit the generator, then `npm run meta:site`. Do not hand-edit
  the 380 generated pages.
- `.lists` in meta-web must be a **column** (`display: flex; flex-direction:
  column`). A 2-col grid puts the Stacked/List/Text toolbar in the left
  cell and the cards in the right.

## Previous session (2026-08-16, app)

| Item | Notes |
|------|--------|
| ✅ | **Revealed-card quantities** | Match History / Matchups chips show `×N` when the opponent revealed more than one copy. Copy list is an Arena import with those counts. Overlay Opponent tab shows the same qty. Tracker stores repeats = max simultaneous copies in any one game (Bo3 does not triple-count). `opponentSeen` still never uploaded. v3.1.4. |
| ✅ | **v3.1.4 Windows** | Signed key id `67FCA9900F523D49`. Installer + `.sig` + updater + `version.json` + OG `?v=3.1.4`. |
| ✅ | **v3.1.4 macOS dmg rolled** | Pulled `Filthy-Net-Deck-3.1.4-universal.dmg` from the GH Release (sha256 `f47b0361…e675`, 21 097 809 bytes). Both homepage Mac buttons pointed at it. 3.1.3 skipped (never on the homepage). 3.1.0 + 3.1.1 dmgs pruned — downloads stays at current + 1 (3.1.4 + 3.1.2). |

### Hard-won this session

- Quantity is **max simultaneous** in revealed zones, not unique instance ids.
  GRE remints `instanceId` on every zone hop — counting ids would report 3
  Mountains when they played one and it died. Same reason the library tracker
  re-derives from zone membership. `AnnotationType_ObjectIdChanged` collapses
  a hop so a stale zone + new instance still counts as one.
- Old persisted matches only have distinct ids (qty 1). First launch after
  3.1.4 re-parses `Player.log` / `Player-prev.log` and **enriches** stored
  `opponentSeen` when the new parse saw more copies — never drops an id.
- `OpponentRevealedCards` must pass the **raw** grpId list (repeats = qty)
  into `revealedCardsOf`. Distinct ids are only for name resolve.

## Previous session (2026-08-15)

| Item | Notes |
|------|--------|
| ✅ | **Opponent revealed cards** | Cut with Matchup Lab (`OpponentDeckRead`, deleted in `2d0aaea` as “dead code”). Restored on Match History (click a match / Cards column) and Matchups (open a game). Raw cards only — no archetype guess. **Copy list** = Arena import of what was seen (1 of each). `opponentSeen` still never uploaded. v3.1.2. |
| ✅ | **Clinic collapsed + moved** | “Vs today’s ranked list” on a deck page starts closed, **Show cards off** / **Hide**, and now sits **under Match history**. v3.1.3. |
| ✅ | **v3.1.2 Windows** | Signed key id `67FCA9900F523D49`. Installer + `.sig` + updater + `version.json` + OG `?v=3.1.2` live. |
| ✅ | **v3.1.3 Windows** | Same. Live `version.json` / `updater/latest.json` / `Setup-3.1.3.exe` confirmed on filthy-net-deck.com. |
| ✅ | **v3.1.2 macOS dmg rolled** | Homepage was on 3.1.0, then 3.1.1 mid-session, now 3.1.2. 3.1.3 dmg waits on CI. |

### Hard-won this session

- **Do not delete the revealed-cards UI again.** `2d0aaea` retired Matchup Lab and
  took `OpponentDeckRead.tsx` with it because nothing imported it. The data
  (`TrackedMatch.opponentSeen`) never left. New home is Match History + Matchups,
  helpers in `src/services/opponentSeen.ts`, UI in
  `src/components/OpponentRevealedCards.tsx`. CSS `.opp-read*` was already there.
- Netlify takes ~2–3 minutes after a push that includes the installer + dmg.
  `version.json` staying on the previous version for that window is normal, not
  a missed deploy.
- First `tauri:build` failed because a vitest mock in
  `OpponentRevealedCards.test.tsx` was included by `tsc` (`vi.fn()` typed as
  zero-arg). Type the mocks (`vi.fn<(id: number) => unknown>()`) before the
  signed build.
- Rebase onto `origin/main` before every release push — set-radar / daily-meta
  moved main 16 commits during the 3.1.2 build.

## Previous session (2026-08-13)

| Item | Notes |
|------|--------|
| ✅ | **Fullscreen + Close-to-tray** | Hide drops the OS fullscreen bit so Windows will actually hide. `WANT_FULLSCREEN` remembers the pref; every show path (`show_main_window` — tray, second instance, presence, deep link) restores it, with retries. `window_state` no longer persists the dropped bit. |
| ✅ | **Brew Lab shrunk into My Stats** | Nav page gone (keys 1–8). Clinic is card-by-card vs the **closest ranked 75 by list overlap**, not the field average and not the deck name. “N cards off” = L1/2. Paste-a-list is a collapsed row on the My Stats home. |
| ✅ | **v3.1.1 Windows release** | Signed with key id `67FCA9900F523D49`. Installer + `.sig` + `updater/latest.json` + `version.json` + OG `?v=3.1.1` live. 3.0.3 pruned. |

### Hard-won this session

- After the repo moved off `Desktop\Coding with Grok\…`, **release** `tauri`
  artifacts still pointed `OUT_DIR` at the old path. `cargo clean -p tauri -p
  tauri-build` is not always enough for release — delete
  `src-tauri/target/release/build/tauri-*` (not plugins/runtime) and the
  matching fingerprints/deps, then rebuild.
- Do not restore fullscreen on generic `focus`. A focus flicker during hide
  re-enters exclusive fullscreen and Close-to-tray looks dead again.
- `document.visibilityState` often does **not** change after WebView2
  `hide()`. Restore belongs in Rust `show_main_window` + the `main:shown` event.

---

# v3.0.0 program (closed)

Owner's brief (2026-08-12): *"refining, debugging, perfecting performance and
polishing — a PERFECT v3.0.0 I can confidently share around."*

Scope chosen by the owner: **full regression audit + a deliberate polish
workstream**, email sign-in hidden, historical docs deleted outright.

## Done so far

| # | Item | Notes |
|---|------|-------|
| ✅ | **False "nothing is uploaded" claims fixed** | README + 3 site strings. Had been wrong since v2.7.5 — see the post-mortem in `docs/PLATFORM-STRATEGY.md` §1.2 rule 4 |
| ✅ | **`website/privacy.html`** | Both allowlists field by field; linked from the site footer and Settings → Data & privacy. In the sitemap via `build-meta-site.mjs` |
| ✅ | **In-app copy sweep** | Three share-card kickers, `StatusPanel`, the Tracker-health blurb, and a genuinely wrong consent line ("the one optional exception" — there were two, and the bigger one was *above* it) |
| ✅ | **Email sign-in hidden** | `EMAIL_SIGN_IN_ENABLED = false` in `src/services/cloud/config.ts`. Code path intact |
| ✅ | **Doc cleanup** | `ROADMAP.md`, `100X-ROADMAP.md`, `docs/AUDIT-2026-08-10-v2.7.3.md` deleted (git history keeps them). Binding non-goals + cloud rules moved into `AGENTS.md` |

## Still to do

| # | Item | Notes |
|---|------|-------|
| ✅ | **Full regression audit v2.7.3 → v2.8.2** | **9 findings, 2 of them P0** — `docs/AUDIT-2026-08-12-v3.0.0.md`. All fixed, and `20260812060000` was run on the live DB by the owner 2026-08-12 (verified: the deck view no longer exposes `main`) |
| ✅ | **Performance pass** | Found the P0 splash re-render loop. Bundle + boot verified on a production build; WebView2 RAM measured on the live install (~795 MB attributable, three renderers = main + overlay + presence with Arena running, which is correct) |
| ✅ | **UI/UX polish** | Empty states verified across all nine pages; ~700 lines of dead Matchup-Lab-era code removed (incl. a share card branded with the retired product name); typography and tooltip fixes; `index.css` comment encoding repaired |
| ✅ | **Launch readiness** | Status page + in-app incident banner shipped (§2.7 closed). §4 anti-abuse verified — two of six were missing, now implemented. Launch-spike quota modelled in `BACKEND-PHASE-2.md` §5: a 500-signup day is 0.5% of MAU and 0.8% of the database; storage only bites near ~16k active sharers, so the constraint is auth providers, not Supabase |
| ✅ | **Roll the macOS dmg** | v2.8.2's dmg rolled in and links fixed (macOS visitors had been served 2.8.1). A checklist line in `AGENTS.md` now guards against a repeat |
| ✅ | **v3.0.0 release train** | Shipped. Signed installer (key id verified), updater manifest, site, OG, tag, macOS dmg rolled |
| ✅ | **v3.0.1 / v3.0.2 — new-set cards** | The Hobbit shipped on Arena before Scryfall assigned its `arena_id`s, so every card showed as `Card #103529`. New `meta/arena-names.json` gap map + client fallback. **3.0.1** restored names (v3.0.0's installer predated the client half); **3.0.2** added mana value, colours and land-ness from Arena's own table, so the curve and pips are right too |
| ✅ | **v3.0.3 — the gap map was in only one of two resolvers** | Owner reported the Hobbit cards *still* unnamed in My Stats after the 3.0.2 fix and the data restore. Both were fine: `arenaMeta` (overlay, inference) had the fallback and `arenaCards` (My Stats decklist, Brew Lab, deck share) never did. The map now lives in `src/services/arenaNameGap.ts`, owned by neither — see `docs/DATA-AND-UPDATES.md`. Two data incidents plus this one came out of that one feature; treat "which resolver?" as the first question on any card-name bug |

## Known-open, not blocking v3.0.0

- **Phase 3 (crowd meta) is gated on population, not code.** Its machinery
  shipped inside Phase 2 slices 5/6. Cells stay empty until enough opted-in
  users exist. Building more there will not fill them; users will.
- **Email OTP needs custom SMTP** before it can be un-hidden — *and* tests; it
  has none, unlike the OAuth path.
- **§2.6 legal check** gates Phase 4 only, deferred with it.
- Disk: `src-tauri/target/` ~9 GB, `.git` ~1.6 GB / 490 MB packed
  (`docs/GIT-HISTORY-BLOAT.md` — **never from CI or an agent**).

---

## Current state

| Item | Status |
|------|--------|
| App version | **v3.2.0** on Windows (signed updater) and macOS (universal dmg on the homepage, this commit) |
| Branch | `main` |
| Gates last green | **693** vitest / 89 files · tsc · eslint · cargo fmt/clippy/57 tests · signed Windows build (2026-08-27) |
| Licence | MIT (`LICENSE`); README carves out brand, third-party meta data, Scryfall/WotC content |
| Monetization | Ko-fi only; Phase 4 paid tier deferred indefinitely |
| Supabase | Project `bzcryoocsapqtyhiwzbe`, **Pro**. **Ten** migrations run; the tenth (`20260827120000_deck_library_formats`) applied by the owner 2026-08-27. Do not re-run it. |
| Auth | Google **and** Discord enabled + verified live. **Email OTP built but hidden** behind `EMAIL_SIGN_IN_ENABLED` |
| Cron | `fnd-rollup` scheduled hourly (job id 1) — without it `matchup_rollup` never fills |
| Owner's profile | `filthy-net-deck.com/u/l0ne-f0x` — public, 371+ matches uploaded and aggregating |

### Verified live vs merely built

- **Verified against production:** Google sign-in (system browser → Supabase →
  `callback.html` → `fnd://` deep link → app), signup trigger creating the
  profile row, match upload (371 rows), profile page render + OG tags + 404 +
  handle sanitisation, health ping, Matchups crowd orientation/suppression.
- **Built, never exercised for real:** cloud deck sync end-to-end (schema is
  live; no client has written a deck row yet), Discord sign-in (configured,
  unused), email OTP sign-in (**now hidden**), community matchup *cells* (need
  30+ shared games from accounts with 25+ matches and 7+ days — expect empty for
  a while **by design**, that is the honesty discipline, not a fault).

---

## Key files

| File | Role |
|------|------|
| `src/services/cloud/config.ts` | Supabase URL + publishable key; `EMAIL_SIGN_IN_ENABLED` |
| `src/services/cloud/sync.ts` | isCloudEnabled/setCloudEnabled, upload, fetchRollup, handle + display-name |
| `src/services/cloud/syncRunner.ts` | Pulls live state + inference, calls the upload. The only trigger point |
| `src/services/cloud/matchSync.ts` | Shared-match **allowlist** builder — never serialise `TrackedMatch` |
| `src/services/cloud/healthPing.ts` | Slice 0 payload; Settings consent copy is generated from the same object so it cannot drift |
| `src/services/cloud/crowdMeta.ts` | Wilson intervals, matchupsFor, `MIN_GAMES = 30` |
| `src/services/cloud/personalMatchups.ts` | archetypeForMatch, personalRecords, mergeMatchups, readDelta |
| `src/services/cloud/friends.ts` | Phase 5 — friend codes, seasonal race |
| `src/services/cloud/deckSync.ts` | Slice 7 — `deck_hash` upsert, fingerprint instead of a high-water mark |
| `src/services/cloud/auth.ts` | OAuth (system browser + `fnd://`), email OTP, session |
| `src/services/cloud/archetypeSlug.ts` | Canonical slug join key (duplicated in the profile function) |
| `src/services/opponentSeen.ts` | Distinct revealed grpIds, display list, Arena import of what was seen |
| `src/components/OpponentRevealedCards.tsx` | Match History / Matchups expand panel. Local only |
| `src/components/ListClinic.tsx` | `collapsible` starts the deck-page clinic closed (`Show cards off`) |
| `src/services/opponentArchetype.ts` | Inference. `observedColorsFromSeenCards` is where the basic-land fix landed |
| `src/services/site.ts` | `SITE_*`, `DONATE_URL`, `PRIVACY_URL`, `STATUS_URL` — empty string hides an affordance everywhere |
| `src/services/serviceStatus.ts` | Reads `website/status.json`; drives the in-app incident banner |
| `website/status.json` | **Flip this during an Arena-break incident** — see `docs/MAINTENANCE.md` item 4 |
| `pipeline/sources/arena-names.mjs` | Names for Arena cards Scryfall has no `arena_id` for; publishes `meta/arena-names.json`, self-healing |
| `src/services/arenaMeta.ts` | grpId → card meta. Scryfall first, gap map only on 404, `partial` entries never persisted |
| `src-tauri/src/deeplink.rs` | `fnd://` — handles BOTH cold start and the single-instance argv route |
| `netlify/functions/profile.mts` | Server-rendered `/u/<handle>` (config.path routing) |
| `netlify/functions/deck.mts` | Server-rendered `/u/<handle>/<slug>` + `/d/<id>` — one published deck, with the copy button |
| `src/services/arenaExport.ts` | Arena ids + resolved names → Arena import text. The publish path's only source of a decklist |
| `pipeline/build-meta-site.mjs` | The `/meta-web/` corpus + sitemap. Static pages are hardcoded there, not in `paths` |
| `website/privacy.html` | The published field allowlist |
| `supabase/migrations/` | 9 migrations, **all run on the live DB** (the 9th, `20260820120000`, published decklists — run by the owner 2026-08-20) |

---

## Hard-won facts (do not re-derive)

### Product rules now live in `AGENTS.md`

Cloud rules, non-goals and the deferred list moved there 2026-08-12 so they sit
with the release checklist rather than in a status file.

### Inference

- **Lands corroborate but never carry.** A four-colour pile plays every dual in
  the format, so land overlap alone matched whatever anyone put on the table.
  An unseen colour costs, scaled by how much of the deck has been seen, and is
  disqualifying once the sample is real unless three cards no other list plays
  say otherwise.
- **Arena basic-land grpIds are not stable identities.** A game object Arena
  described as `SuperType_Basic` / `SubType_Swamp` carried grpId **87457**, which
  resolves through the card API to **Island**. Read Arena's own `subtypes` off
  the game object; a basic resolved *by id* is only soft evidence.
- **Two harnesses exist — rebuild them before touching the engine.** A held-out
  synthetic benchmark over the whole field, and a replay over real tracked
  history. Nobody could previously tell whether an inference change helped.
  Baseline (owner's 322 real matches): wrong-colour reads 25.8% → 5.9%, gave a
  read at all 95.3% → 92.9%.

```
cd src-tauri
FND_REPLAY_LOG=<Player.log> FND_REPLAY_OPP='*' cargo test replay_real_log -- --nocapture --ignored
```

### UI performance

- **Splash wrappers that keep state + interval after exit re-render the entire
  app.** Prefer early-return unwrapped children once the splash is gone.
- Zustand `set({ trackerMatches: newArray })` on a no-op poll is expensive —
  any page subscribed to matches re-renders. Fingerprint before set.
- **Do not code-split the pages.** `React.lazy` renders its fallback once before
  resolving *even when the chunk is already cached*, so page-level splitting
  buys a permanent skeleton flash on each page's first visit. Prefetching does
  not suppress it, and `startTransition` cannot either. Measured 2026-08-10:
  static imports give 0–2 ms synchronous nav. The split worth keeping is
  `main.tsx`'s App-vs-overlay/toast/presence one.
- **Zustand updates cannot be deferred.** It reaches React through
  `useSyncExternalStore`, which React always renders synchronously —
  `startTransition(() => set(...))` is a no-op.
- `key={page}` on the content shell is usually wrong for "snappy nav" — it
  forces remount + CSS enter animation every click.

### WebView memory

- Counting "WebView2 Manager (N)" in Task Manager: one browser process + GPU +
  utility + **one renderer per webview window**. Secondary labels
  `toast` / `overlay` / `presence` are intentional product surfaces, not
  leaks — but they must not outlive their need.
- **Never prewarm toast at boot** again for "first-toast latency" without
  measuring RAM cost.
- ⚠️ **Never build a WebView window on the event-loop thread** on Windows — it
  deadlocks: the window is created, `build()` never returns, and every later
  main-thread task is wedged (tray Quit included). Reintroduced **four times**
  from four directions. You reach the event loop from **three non-obvious
  places**:
  1. inside a `run_on_main_thread` closure;
  2. an `on_window_event` handler;
  3. **any synchronous `#[tauri::command]`** — Tauri 2 runs those on the main
     thread. This is the one that keeps catching people.

  There is a guard: `refuse_if_main_thread()` in `lib.rs`, called at the top of
  every `ensure_window`. It refuses and names the offender instead of hanging,
  and `debug_assert!`s so `tauri:dev` fails loudly. **Call it from any new
  webview builder.** Create on a worker thread; only show/destroy on main.
- `on_window_event` is **global across all four webviews** — scope every arm by
  `window.label()`. An unscoped `prevent_close` once swallowed tray Quit.

### Supabase / backend

- **"Automatically expose new tables" is OFF** (deliberate). Every new table
  starts with **no privileges for any Data API role — `service_role` included**
  — so each migration must `grant all on public.<table> to service_role;`.
  Symptom when forgotten: an Edge Function write fails with Postgres **42501**
  although its key is correct, which reads like a database fault rather than
  config.
- This project uses the **new API key system**, so `SUPABASE_SERVICE_ROLE_KEY`
  may not be injected into functions — read it with fallbacks and fail loudly.
  `createClient(url, undefined)` **does not throw**; it silently downgrades
  every write to `anon`.
- **RLS is row-level, not column-level.** A `select` policy exposes the whole
  row; use a view over a locked-down base table to publish a column subset.
  (This is why `public_profiles` is a view, and why publishing decks needed one.)
- Never return raw Postgres messages from a public Edge Function — return the
  error *code* plus a stage label and log the rest.
- **Subject orientation is load-bearing on Matchups.** Community rows are
  "A vs B", so a field rate is only comparable to yours when both describe the
  same deck facing the same opponent. `subjectArchetype()` requires a 60%
  majority recognised deck; no clear subject means **no comparison is offered**.
  Do not "fix" that with a field average — it is not comparable.
- The public deck page prints deck, format, size and last played — **not the
  list**: `main` is Arena card ids and there is no id→name map on the server.
  If card names on public decks are wanted, ship an id→name map first.

### Sets feed

- Live/released sets: slim index + lazy `meta/sets/<code>.json`. Spoiling sets
  stay fat inline. Do not regress to full-gallery-in-index for every live set.
- Offline cache (`bbi.sets.lastGood`) strips live full galleries (same policy),
  with the bundled copy as an offline floor.

### CI

- **Stage directories, not file lists.** `sets-refresh.yml` hand-listed two
  files to stage; v2.7.1 added per-set lazy galleries writing ~19 more, they
  stayed unstaged, the following `git pull --rebase` refused, and the job exited
  **128 every 4 hours for two days** — with the *build step still reporting
  success*. The set radar was frozen the whole time.
- Nothing with a dot in its basename goes in `netlify/functions/` — it is read
  as a function name and a dot is illegal, failing every deploy.

### Release / git

- `main` can move under you via scheduled set-radar commits. Rebase release onto
  `origin/main` before push; retarget the version tag if it was created
  pre-rebase.
- Signing: `TAURI_SIGNING_PRIVATE_KEY` (file path or contents) +
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; clear from the shell after. Key id
  **67FCA9900F523D49** — check it against the pubkey in `tauri.conf.json` before
  publishing, because a sig from the abandoned repo-root key looks fine and
  breaks auto-update. On this Linux box the key lives in `~/.tauri/` and the
  NSIS build is `tauri build --bundles nsis --runner cargo-xwin --target x86_64-pc-windows-msvc`.
- PowerShell mangles HEREDOC / JSON argv — use temp files or node scripts for
  multi-line commits and version bumps on Windows.
- Install counting: the signal is **`/updater/latest.json`**, not
  `/version.json` (`docs/INSTALL-COUNTING.md`). **Never put a function in front
  of `/updater/latest.json`** — it drives the signed auto-update.
- Dual Netlify config: root `netlify.toml` governs build + functions;
  `website/netlify.toml` governs **headers and redirects**. A redirect in the
  root file silently does nothing.
- Test feed/origin changes in an **installed** build — prod origin is
  `tauri.localhost` and `tauri:dev` does not enforce the CSP.

### MSIX / reading app data

- My reads of `%APPDATA%` can be a frozen copy-on-write snapshot. Verify via
  `\\localhost\c$` or the in-app diagnostic before concluding a persistence bug.

---

## Background queue (nothing here blocks v3.0.0)

| Priority | Item | Notes |
|----------|------|--------|
| Defect | Tracker persistence — root cause | Data loss FIXED (reconcile pass, 2026-08-11). Why appends stalled is still unknown; `persistRepairs` in the next diagnostic is the trail |
| Measurement | Search Console checkpoint ~2026-08-24 | Baseline 2026-08-11: 3 clicks, 32 impressions, position 11.2 |
| Product | Email OTP needs custom SMTP **and tests** | Hidden for now |
| Product | Wildcard craft-cost feature | Buildable locally, never built — `PLATFORM-STRATEGY.md` §2.4 |
| Optional | Upload Windows exe/sig to GitHub Releases | macOS dmgs are there; Windows lives on the site CDN + local archive only |
| Disk | `src-tauri/target/` regrows to ~9 GB | `cargo clean` reclaims it at the cost of one full rebuild |
| Later | macOS signed updater | Workflow disables updater artifacts; key is local-only |
| Later | `.git` is ~1.6 GB | Needs the coordinated filter-repo in `docs/GIT-HISTORY-BLOAT.md`. **Never from CI or an agent** |

---

## Dev / release commands

```bash
npm install
npm run tauri:dev
npm test              # 625 vitest across 84 files
npm run sets          # rebuild slim sets index + galleries
npm run meta          # daily meta (no app bump required)
npm run meta:site     # regenerate /meta-web/ + sitemap
npm run tauri:build   # set TAURI_SIGNING_* for Windows updater artifacts
```

Release definition of done: root **`AGENTS.md`** checklist (binary + downloads +
updater + version.json + site + OG + Netlify live + tag/macOS).

---

## Docs map

| File | Role |
|------|------|
| `handoff.md` | **This file** — live session state |
| `AGENTS.md` | Binding project rules, release checklist, cloud rules, non-goals |
| `docs/PLATFORM-STRATEGY.md` | Growth phases — all buildable ones now shipped; kept for the reasoning |
| `docs/BACKEND-PHASE-2.md` | The backend as designed *and as built* |
| `docs/MAINTENANCE.md` | What self-maintains vs. the monthly hands-on checklist |
| `docs/DATA-AND-UPDATES.md` | Pipeline sources + updater mechanics |
| `docs/INSTALL-COUNTING.md` | Post-mortem: right machinery, wrong endpoint |
| `docs/GIT-HISTORY-BLOAT.md` | The optional history rewrite, and why not to automate it |
| `docs/AUDIT-2026-08-12-v3.0.0.md` | Latest deep audit — 9 findings across the v2.7.3→v2.8.2 backend push |
| `docs/WEB-PLATFORM.md` | Site-as-destination plan (Goldfish × AetherHub × Untapped). Gates, not a build list |

Removed 2026-08-12 as shipped history (recover from git if ever needed):
`ROADMAP.md`, `100X-ROADMAP.md`, `docs/AUDIT-2026-08-10-v2.7.3.md`,
and earlier `docs/PAGE-10X.md` / `docs/AUDIT-2026-07-22-v2.5.0.md`.

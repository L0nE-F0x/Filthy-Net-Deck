# Filthy Net Deck — 10× page roadmap

**Created:** 2026-07-19 (after Climb Tracker v0.26.0 overhaul)  
**How to use:** Each page is graded against the **Climb bar**. Work is **batched** (see `AGENTS.md` pacing). Check items off when they ship in a real version bump — source-only is not done.

### The Climb bar (what “10×” means here)

Climb succeeded because it is not a dump of stats — it is a **story + actions**:

| Principle | Climb example | Apply everywhere |
|-----------|---------------|------------------|
| **Path / narrative** | Chronological deck legs on the ladder | “What changed / what to do next,” not only tables |
| **Identity on the data** | Every sample tagged with a deck | Opponents, cards, sets, events carry clickable identity |
| **Deep links** | Stretch → My Stats deck detail | Meta ↔ personal ↔ prep surfaces jump both ways |
| **Hover density** | Rank + deck + time on chart | Tooltips carry the next click, not decoration |
| **Honest empties** | No rank stamps → clear copy | Never invent matchups, SB guides, or lists |

**Non-goals stay closed:** in-game overlay, Alchemy/Historic, cloud sync, mobile tracking promises, price tracking, fabricated matchup/sideboard content.

**Climb (v0.26) is the reference implementation — not on this list.**

---

## Priority overview (suggested batch order)

| Batch | Theme | Pages | Why first |
|-------|--------|-------|-----------|
| **A** | **Deep-link lattice** | Decks, Stats, Matchups, Events | Climb proved the pattern; max product glue for least new data |
| **B** | **Meta ↔ personal fusion** | Decks, DeckView, Matchups | Turns tracker + board into a daily plan |
| **C** | **World events as decisions** | Format Hub, Sets | Rotation / spoilers / bans that change what you play |
| **D** | **Trust & power** | Settings, Events polish | Setup health, discoverability |

Do **not** ship one micro-release per bullet. Finish a batch on `main`, then one version cut.

---

## 1. Decks home (`Daily.tsx`) + DeckView + FormatView

**Role:** What to play today (live meta board).

### Now
- Hero “Deck to beat,” top-8 grid, tier/color filters, movement chips, you-vs-tag chips
- BanPulse / SpoilerPulse, meta timeline, PersonalMeta panel
- DeckView: full list, Arena copy, rotation impact, day-over-day list diff
- FormatView: charts + deck stack (somewhat overlapping home)

### Gaps vs Climb
- Catalog, not a **plan**
- Personal/meta widgets mostly non-clickable
- Empty matchup/SB sections look broken when the feed has no real guides
- FormatView under-motivated after home hero

### 10× target
A pilot opens Decks and in **one screen** knows: best personal weapon, rising threat, prep hole, and can land on the right list in one click.

### Roadmap

| ID | Upgrade | Impact | Effort | Notes |
|----|---------|--------|--------|-------|
| D1 | **“Today’s plan” strip** — best personal WR archetype · worst tagged MU · rising meta threat · 1 CTA each | High | M | Join `personalMeta` + `matchupNotes` + metaDiff |
| D2 | **Click-through everything** — PersonalMeta → DeckView; movers → deck; “you X–Y” → Matchups filtered by tag | High | L–M | Mirror `openStatsDeck` patterns |
| D3 | **DeckView “Your record”** — W–L vs this archetype from tags; link Matchup Lab; hide empty published MU/SB | High | M | Real tags only |
| D4 | **FormatView merge or demote** — either deep-link from home “Full format” or fold unique charts into home | Med | M | Kill dead nav weight |
| D5 | **“I’m piloting this” pin** — local pin of 1–2 archetypes for plan strip + climb join | Med | M | Prefs only, no cloud |

**Definition of done (Decks 10×):** Plan strip live; every personal widget opens a destination; DeckView never shows empty fake guide chrome.

---

## 2. My Stats (`Stats.tsx`)

**Role:** Your local Arena history and deck arsenal.

### Now
- Tracker health, seasons/queues, arsenal fans, deck table, deck detail (list, diffs, fresh run, history)
- Recap PNG + CSV; accepts Climb deep-link via `statsFocusDeckKey`

### Gaps vs Climb
- Stack of panels, weak **ranked narrative** (“this deck is carrying / killing you”)
- Match rows don’t open Matchups / Climb
- No jump to meta DeckView when name joins today’s board

### 10× target
Stats is the **personal HQ**: every row is a door into prep, meta, or climb story.

### Roadmap

| ID | Upgrade | Impact | Effort | Notes |
|----|---------|--------|--------|-------|
| S1 | **Deck detail hub CTAs** — “Open meta list” · “Opponents on this deck” · “Climb path for this deck” | High | M | Close reverse link from Climb |
| S2 | **Insight chips on home** — worst 10-game WR deck, play/draw gap, streak deck — all open detail | High | M | Pure local aggregates |
| S3 | **Match history navigation** — click opponent → Matchups; deck name → detail | High | L | Low code, high lab feel |
| S4 | **Season story header** — peak rank, best deck, games this month in one hero (reuse climbStats) | Med | M | Aligns with Climb season chips |
| S5 | **Compare two decks** side-by-side WR / play-draw / form | Med | H | Only if S1–S3 land first |

**Definition of done:** From any deck detail you can reach meta + matchups + climb; home answers “what’s wrong with my game?” in one glance.

---

## 3. Matchups (`Matchups.tsx`)

**Role:** Opponent tags, notes, and prep lab.

### Now
- Opponent groups, filters, tags (live-save), notes, meta tag suggestions, trouble counter
- Tags already power Decks “you vs” chips (one-way)

### Gaps vs Climb
- Tags don’t open meta decks or Stats decks
- No post-match **prompt** to tag (data starvation)
- Deck chips non-interactive; no prep “story” for a tag

### 10× target
After every session, tough opponents are tagged; opening a tag shows **meta list + your record + notes**.

### Roadmap

| ID | Upgrade | Impact | Effort | Notes |
|----|---------|--------|--------|-------|
| M1 | **Tag → meta deck + your WR** — open DeckView when tag matches ranked archetype | High | M | Closes loop with Decks |
| M2 | **Post-match tag nudge** — optional toast/action “Tag last opponent?” | High | L–M | Feeds personal graph for whole app |
| M3 | **Prep mode for tag** — aggregate notes + last N results across foes with that tag | Med | M | User-authored only |
| M4 | **Deck chips → openStatsDeck** | Med | L | Same as Climb |
| M5 | **Untagged recent queue** — sticky list of last 5 untagged ladder foes | Med | L | Forces lab hygiene |

**Definition of done:** Tagging is the default post-game habit; every tag is a portal to meta + history.

---

## 4. Sets (`Sets.tsx`)

**Role:** Spoilers, drop countdowns, galleries, Future Standard, trailers.

### Now
- Arena-first radar, galleries, trailers, Future Standard, full Standard “Recently live”
- Excellent browse keyboard/drawer UX

### Gaps vs Climb
- Card drawer doesn’t answer **“who plays this?”**
- Weak **Arena drop-day** decision story
- Soft link to Format Hub legality

### 10× target
Spoil a card → instantly see meta presence → open the list that plays it.

### Roadmap

| ID | Upgrade | Impact | Effort | Notes |
|----|---------|--------|--------|-------|
| Z1 | **Card drawer “In today’s meta”** — cardWatch decks/copies/board + openDeck | High | M | Best Sets↔Decks bridge |
| Z2 | **Drop-day focus** — Arena ±1d pins set, defaults “new” filter | Med | M | Pair with SpoilerPulse |
| Z3 | **Legality badges → Format Hub** | Med | L | Reinforce hub |
| Z4 | **Rotation flag on live Standard set cards** when exit ≤45d | Med | M | Near-event focus |
| Z5 | **More curated trailers** as WotC posts them | Low | L | Maintenance, not code |

**Definition of done:** Drawer is a play tool, not only a Scryfall lightbox.

---

## 5. Events (`MetaPulse.tsx`)

**Role:** Tournament / results pulse (verified links only).

### Now
- Format/platform filters, relative dates, top deck chips, external open, “See decks”
- Trust: no seed/placeholder sources

### Gaps vs Climb
- Mostly a **browser link farm**
- Top archetypes rarely open in-app DeckView
- Flat hierarchy (prestige / size not surfaced)

### 10× target
Events that matter for **today’s Arena board** are obvious; archetypes open the app, not only Chrome.

### Roadmap

| ID | Upgrade | Impact | Effort | Notes |
|----|---------|--------|--------|-------|
| E1 | **Archetype chips → openDeck / Decks search** | High | L | Fuzzy join to meta names |
| E2 | **“Results that matter” grouping** — Arena / large events first | Med | M | Same data, better path |
| E3 | **“On today’s board” count** per event | Med | L | Clickable chips |
| E4 | **Collapse old paper** by default | Low | L | Density |
| E5 | Optional **your finish** if log ever exposes event IDs | Low | H | Only if tracker can prove it |

**Definition of done:** Majority of top-deck chips land in-app; Arena pilots see Arena-first list without hunting.

---

## 6. Format Hub (`FormatHub.tsx`)

**Role:** Legality, rotation, bans (Standard + Pioneer).

### Now
- Set pools, rotating-next highlight, ban rails → Scryfall, BanPulse acknowledge

### Gaps vs Climb
- Static reference: doesn’t show **which of your/meta decks die at rotation**
- Ban cards don’t join the live board

### 10× target
When rotation or B&R hits, Hub is the **war room**: threatened decks ranked, one click to lists.

### Roadmap

| ID | Upgrade | Impact | Effort | Notes |
|----|---------|--------|--------|-------|
| F1 | **Rotation impact roster** — today’s Standard decks sorted by cards lost → DeckView | High | M | Reuse `rotationImpact` |
| F2 | **Near-rotation hero** (≤45d) — date, card count, top 3 threatened decks | High | M | ROADMAP “as date nears” |
| F3 | **Ban card → meta / cardWatch** | Med | L–M | Empty if not on board |
| F4 | **Your arsenal at risk** — tracker decks × rotation set | Med | M | Personal × hub |
| F5 | Pioneer ban / pool polish only if Std path feels done | Low | M | Don’t dilute Std focus |

**Definition of done:** Rotation week is navigable entirely inside the app without spreadsheets.

---

## 7. Settings (`Settings.tsx`)

**Role:** Prefs, updates, trust — correctly utilitarian.

### Now
- Mode, theme, fullscreen, autostart, notifications, updater, About

### Gaps vs Climb
- Tracker setup lives mainly on My Stats
- No keyboard / data-locality cheat sheet

### 10× target
New install: “is tracking working?” answered in Settings; power users find shortcuts without docs.

### Roadmap

| ID | Upgrade | Impact | Effort | Notes |
|----|---------|--------|--------|-------|
| X1 | **Tracker health block** — log found, detailed logs, last event, link My Stats | Med | L | Cut support friction |
| X2 | **Keyboard cheat sheet** — 1–8, Ctrl+K, F11 | Low | L | Discoverability |
| X3 | **Local-only data note** — matches/notes stay on PC | Low | L | Trust |
| X4 | Notification preview / test toast | Low | L | Confidence |

**Definition of done:** Support questions “is my log working?” answerable without leaving Settings.

---

## Cross-app infrastructure (enables every batch)

These are not pages, but **Climb-class** work depends on them:

| ID | Work | Enables |
|----|------|---------|
| I1 | Generalize deep links: `openStatsDeck`, `openMatchupOpponent`, `openMatchupTag`, `openMetaDeck`, `openFormatHubTab` | A–C batches |
| I2 | Shared “entity chips” (deck / opponent / card / set) with consistent hover + click | All pages |
| I3 | PersonalMeta join quality tests (already improving) | Decks plan strip |
| I4 | cardWatch available outside palette (Sets drawer, Format Hub bans) | Sets/Hub |

---

## Suggested milestone map (product versions — illustrative)

Exact version numbers flex with owner pacing; **theme** is what matters.

| Milestone | Theme | Ships |
|-----------|--------|-------|
| **Next** | Deep-link lattice | D2, S1, S3, M1, M4, E1, I1 |
| **+1** | Daily plan loop | D1, D3, M2, M5, S2 |
| **+2** | Rotation & spoilers war room | F1, F2, Z1, Z2, F3 |
| **+3** | Trust polish | X1–X3, E2, D4 |

P0 hotfixes (tracker, import) still ship solo.

---

## Owner decision board

When picking the next batch, choose **one** primary:

1. **Glue the app** (deep links) — fastest 10× feel after Climb  
2. **Daily plan** (Decks strip + tag nudge) — best for “open every morning”  
3. **Rotation war room** (Hub + DeckView) — best as Q-exit approaches  

Default recommendation: **(1) then (2)**. Rotation batch activates when the exit window is within ~45 days (see Format Hub F2).

---

## Explicitly deferred

| Idea | Why deferred |
|------|----------------|
| Limited / Draft hub | Large data surface; owner parked |
| In-draft overlay | ToS |
| AI coach without grounded local data | Hallucination risk |
| Price / collection vault | Non-goal / high complexity |
| Cloud sync of notes/matches | Privacy promise |

---

*Companion to root `ROADMAP.md`. Update both when a batch ships.*

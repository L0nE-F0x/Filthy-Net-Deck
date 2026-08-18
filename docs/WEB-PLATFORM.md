# Filthy Net Deck — web platform plan

**Prepared:** 2026-08-16 · owner's brief: once FND users and opted-in matches
are dense enough, the site should become more than a download page — a public
combination of what people currently go to **MTGGoldfish**, **AetherHub**, and
**Untapped.gg** for.
**Parent:** [`PLATFORM-STRATEGY.md`](PLATFORM-STRATEGY.md) §1.1, §1.6, §3
**Status:** plan only. Nothing here is being built until the gates below trip.
The live product is still the desktop app (v3.1.7). The live site is still a
funnel plus a thin `/meta-web/` corpus.

> **This does not replace §1.6.** That section said: do not rebuild Untapped's
> web app; FND is desktop-first; the website's job is discovery that funnels to
> installs. That is still true for **tracking**. What changes, when the crowd
> dataset is real, is that the site also becomes the **public face of FND's own
> data** — the thing Goldfish cannot compute and Untapped charges for.

---

## 0. What the three sites actually are (so we do not clone the wrong bits)

People say "Untapped / AetherHub / Goldfish" as one wish. They are three
different jobs:

| Site | The job people open it for | What FND already has | What FND must never fake |
|---|---|---|---|
| **MTGGoldfish** | "What is the metagame, and what is the list?" Share, movement, a 75 you can copy. | Daily pipeline + `/meta-web/` (32 ranked lists, Bo1/Bo3, Std/Pio, Arena import). Source is MTGO challenges, not FND users. | Invented lists. Seed decks. A "live meta" that is yesterday's guess. |
| **AetherHub** | "Show me decks, cards, and a place to park a list." Deck database, card pages, user-published 75s. | Card pages (v2.8.2), public deck pages (format / size / last played — **not** the list), public profiles `/u/<handle>`. | Printing Arena `grpId`s as names. Collection / wildcard inventory we do not parse yet (`PLATFORM-STRATEGY.md` §2.4). |
| **Untapped.gg** | "How am I doing, and what beats what on ladder?" Tracker, matchups, profiles, a web dashboard. | All of that **in the desktop app**. On the web: profile pages only. Crowd matchup *machinery* shipped (Phase 3); cells stay empty until `n ≥ 30`. | A public matchup number from 12 games. Uploading `opponentName` / `opponentSeen`. Putting local tracking behind a login. |

The combination that is actually available to us, and not already owned by a
funded tracker, is:

> **Goldfish's job** (verified challenge lists, already shipping) **plus
> Untapped's job on FND-native ladder data** (gated on population) **plus
> AetherHub's job on FND-native published decks and card pages** (partially
> shipping, thin).

That is a destination. It is not a second Tauri app in the browser.

---

## 1. Binding constraints (do not "flex" these when the site gets ambitious)

These are already in `AGENTS.md`. They apply to HTML the same way they apply to
the overlay.

1. **Desktop is where tracking happens.** No Android / iOS "auto WR" promises.
   A web dashboard that *displays* opted-in history is fine; a web app that
   pretends to tail `Player.log` is not.
2. **The app stays fully functional with no account.** The site must not become
   a login wall in front of today's public meta.
3. **Never upload or render another player's identity.** Public pages may show
   *your* handle (you opted in) and an inferred *archetype label*. Not the
   opponent's Arena name, not their revealed cards.
4. **Honest aggregates.** Suppress under 30 games, show `n`, Wilson intervals.
   A pretty empty state beats a lying 64%.
5. **Public copy matches the payload.** If a new field goes on a public page,
   `README.md`, `website/index.html`, and `website/privacy.html` all change in
   the same release.
6. **No client-side paywall.** If Phase 4 is ever un-deferred, only server-side
   value is chargeable — and §2.6 legal checks happen *first*.
7. **Do not compete on data breadth.** Untapped has millions of matches. We win
   on being native, honest, and on the *join* between MTGO-verified lists and
   FND-ladder results — not on "we tracked more games."

---

## 2. The site's two jobs, in order

### Job A — discovery that installs the app (now)

This is the current homepage, `/meta-web/`, card pages, and `/u/<handle>`.
Every public page ends at a download. That does not go away when Job B lights
up; it is how Job B gets its data.

Work that still pays **before** crowd cells fill:

- Keep `/meta-web/` thick enough to rank: archetype pages, card pages,
  time-anchored titles ("Best Standard decks — August 2026"), real sitemap,
  per-page OG. §1.6's programmatic SEO list is still the right list.
- Homepage is a product surface, not a changelog. The 2026-08-16 hero overhaul
  is this job.
- Profiles stay shareable. `filthy-net-deck.com/u/l0ne-f0x` is the only viral
  loop that exists today.

### Job B — public FND meta (when the dataset is real)

A visitor who never installs still gets something true and useful:

- What the **challenges** played this week (Goldfish-shaped, already true).
- What **FND opted-in ladder** actually faced and beat, with `n` on every cell
  (Untapped-shaped, empty today by design).
- Which **published FND decks** are legal in Std/Pio right now (AetherHub-shaped,
  list-on-the-web needs an id→name map first — see handoff).

The desktop app remains the place you *produce* that data (overlay, tracker,
opt-in upload). The site is where other people *read* it.

---

## 3. Sequence — gated, not a vibe

Do not start Job B pages because the homepage looks ready. Start them when the
numbers say the page will not be a graveyard.

| Gate | Tripwire | What may ship after it |
|---|---|---|
| **G0 — corpus on** | Already true | `/meta-web/` decks + cards, homepage, profiles. Keep thickening. |
| **G1 — search actually works** | Search Console: meaningful clicks on `/meta-web/` and `/u/*`, not just impressions | Time-anchored month pages, richer card pages ("played in N of today's Std Bo1 lists"), per-page OG. |
| **G2 — crowd cells exist** | At least one Standard Bo1 matchup cell passes `games ≥ 30` from accounts with 25+ matches and 7+ days (same rule as the in-app Matchups page) | A public `/matchups/standard-bo1` matrix. Empty cells stay empty. No "coming soon" fake rates. |
| **G3 — two formats, both honest** | G2 also true for Pioneer **or** Std Bo3 | Format toggle on the public matrix; "FND ladder vs MTGO challenges" comparison on each archetype page. |
| **G4 — lists on the web** | Ship an id→name map the **server** can use (handoff: public deck pages currently cannot print `main`) | Public deck pages show the 75. User-published lists become an AetherHub-like database. |
| **G5 — personal public stats** | Owner decides the allowlist; profile already exists | Opt-in season line on `/u/<handle>` (record, favourite deck, climb peak). Still no opponent identity, still no revealed-card dump. |

`fnd-rollup` is already hourly. Building more backend will not fill G2. Users
will. The honest empty state on Matchups is the product working, not a bug.

### Explicit non-starts (even after G2)

- A web tracker / "paste your Player.log".
- A web overlay.
- In-browser deck builder that invents a 75.
- Historic / Alchemy boards.
- A public "opponent revealed these cards" feed.
- Chat, comments, or a second Discord on the site.

---

## 4. Page map when G2–G4 are green

Sketch only — names can change, the *jobs* cannot.

```
/                         marketing + download + today's top 5
/meta-web/                Goldfish job (already)
/meta-web/standard.html
/meta-web/deck/<id>       list + curve + Arena import
/meta-web/card/<slug>     "what plays this today"
/matchups/                Untapped job, FND-native, gated
/matchups/standard-bo1
/u/<handle>               profile (already) + optional season line (G5)
/u/<handle>/<deck>        published 75 once G4 ships
/status                   incidents (already)
/privacy                  allowlist (already)
```

Every one of those pages still has a download CTA. The site does not become
"good enough that you skip the app" for tracking; it becomes "good enough that
you believe the app is the thing producing this."

### The comparison that is actually the moat

On an archetype page, once G3 trips, show **two** columns:

1. **Challenges** — MTGO / magic.gg share for this name (today's pipeline).
2. **FND ladder** — opted-in Arena results for the same slug, with `n` and a
   Wilson interval.

That join does not exist on Goldfish (no ladder) or Untapped (no challenge
lists you can trust as *the* list). It is the only chart worth adding a
route for.

---

## 5. What "done" looks like for each era

**Now (G0/G1):** a homepage people want to sit on, and a corpus search engines
can chew. No new backend. No version bump required for marketing-only HTML.

**After G2:** a public matchup page that would survive a screenshot on Reddit
without us wincing. If we cannot screenshot it, we do not ship it.

**After G4:** a published deck on the web looks like a deck, not a stub. That
is the AetherHub-shaped piece, and it is blocked on a server-side name map,
not on CSS.

**Never:** a site that tracks your Arena client, a site that needs an account
to see today's 75, or a site that quotes a winrate with `n = 11`.

---

## 6. How this talks to the rest of the docs

| Doc | Relationship |
|---|---|
| `PLATFORM-STRATEGY.md` §1.6 | Still the law for *not* cloning Untapped's web app. This file is the evolution of that section once crowd data exists. |
| `PLATFORM-STRATEGY.md` §3 Phase 3 | Population gate. This file does not move it. |
| `BACKEND-PHASE-2.md` | The upload allowlist and rollup. Public pages read rollups, never raw `TrackedMatch`. |
| `AGENTS.md` | Honesty, privacy, desktop-only, copy-matches-payload. Bind on every new route. |
| `handoff.md` | Live "is G2 close?" signal lives there, not here. |

When a gate trips, do not "just start building the web app." Open a session
against **one** route in §4, with the allowlist and the empty-state copy
written first.

# Filthy Net Deck — Platform Strategy

**Prepared:** 2026-07-29 · from the owner's growth/monetization brief + a repo and site read
**Product at time of writing:** v2.5.3 · Tauri 2 + React 19 + TS + Tailwind 4 + Zustand 5 · ~33.5k lines TS/TSX · ~2.4k Rust · 250+ vitest tests · four webviews
**Status:** Reviewed and in progress. **Phase 0 is done** (see §3) — install counting is measured via Netlify Observability, the Ko-fi tip jar is shipped, and Discord + email capture were cut by the owner. Phase 1 (reach) is next. §0's install estimate has since been replaced by real measured data — see Phase 0.

> This document answers three questions the owner asked: (1) is the plan viable, honestly; (2) what's the sequence to build it; (3) what's obviously missing. It supersedes nothing — `ROADMAP.md` and `100X-ROADMAP.md` cover the *app*. This covers the *business around the app*.

---

## 0. Honest snapshot — where this actually is

**The engineering is not the constraint.** CI gates, a self-healing daily pipeline, signed auto-updates, a reverse-engineered log parser, a no-fabrication data promise enforced in code. That is ahead of where most solo projects ever get, and `100X-ROADMAP.md` already closed its active pillars.

**The audience is the constraint.** Read the numbers without flinching:

| Signal | Value | Read |
|---|---|---|
| Netlify unique visitors | 1,313 / 30 days | Real, but small |
| Netlify pageviews | 3,100 / 30 days | ~2.4 pages per visitor — funnel works |
| YouTube subscribers | 1,733 | Warm start, credibility |
| YouTube views | 629 / 28 days, **trending down** | Not currently an acquisition engine |
| X followers | 1,301 | Same — credibility, not scale |
| Estimated installs to date | **~200–350** | Site visitors × a generous 15–25% CTA conversion |

**What that means for monetization today:** ~300 installs × a 3% paid conversion × $5/mo ≈ **$45/month**. Even at 10× the current audience a subscription does not pay for a weekend of work. Subscriptions need roughly **10–20k installs** before they are a business rather than a rounding error.

### The single most important conclusion

**The binding constraint is reach, not features.** A feature-dense app with 300 users is not short of features. Building a backend, a social graph and tiered billing on top of 300 users optimizes the variable that is not binding.

This does **not** mean skip the backend. It means:

> **Choose backend features by acquisition value first, retention second, revenue third.**

That single reordering is the spine of everything below. It is why public profile pages ship before cloud sync, and why SEO ships before accounts.

---

## 1. Straight answers on the owner's ideas

### 1.1 Backend + deck upload DB — **yes, but for a better reason than stated**

"Users upload their decks" is a convenience feature. It is not why this is worth building.

The strategic reason: **the entire meta feed currently depends on regex-scraping MTGGoldfish.** `100X-ROADMAP.md` already flags it — one Goldfish redesign and the meta goes dark. C3 added MTGO/magic.gg fallbacks, which helps, but the dependency on third-party publishers is structural.

If a few thousand users opt in to sharing match results, **FND becomes its own data source.** Real matchup winrates from real ladder play — precisely the thing Goldfish cannot provide and Untapped charges for. That converts the biggest structural fragility in the product into the actual moat. Deck sync falls out of the same infrastructure for free.

Build the backend for the **crowd meta**, not for deck storage.

### 1.2 The privacy collision — the most important decision in this document

The README says: *"entirely on your PC. Nothing is uploaded anywhere."* `100X-ROADMAP.md` lists local-only tracking as a **principled constraint to keep forever.** That is the counterpositioning against Untapped, whose business model *is* harvesting player data.

A cloud-by-default FND is an underfunded Untapped. That is a losing position.

**The resolution — non-negotiable rules if the backend happens:**

1. Local-first stays the **default forever**. The app must remain fully functional, forever, with no account.
2. Cloud is **explicitly opt-in**, with a plain-language consent screen naming exactly what leaves the machine.
3. The opt-in is framed as a **trade, not a grab**: *"share your matches, get community matchup data."*
4. Opt-out must be one click, and must delete server-side data.
5. The README's promise gets **rewritten precisely**, not quietly dropped. "Local by default. Nothing leaves your PC unless you turn it on."

Handled this way, the privacy story gets *stronger*, not weaker — neither competitor can honestly say the same thing.

### 1.3 Donation button — **do it, but understand what it's for**

Realistic yield: **$10–40/month.** That is not the point.

The point is (a) establishing that paying for this is normal, (b) getting a real willingness-to-pay signal before building billing infrastructure, and (c) it costs one afternoon. Ko-fi or a Stripe payment link — **no backend required.**

Treat the donation revenue as a *signal*, not income. If nobody donates, that is data about the eventual subscription.

### 1.4 Subscription tiers — right idea, wrong timing, one hard constraint

**The constraint the plan must account for: the repo is public** (`github.com/L0nE-F0x/Filthy-Net-Deck`, linked from the README). Any license check inside a Tauri app is client-side, and the source is readable. Client-side gates are unenforceable here.

Therefore:

> **Never paywall anything that runs locally.** It is trivially bypassed and it makes users resent you.

**Paywall only what a server computes or stores.** This constraint is a gift — it forces the monetization design that is correct anyway.

| Free forever (local) | Pro (server-side) |
|---|---|
| Match tracking, all local stats | Community matchup winrates |
| In-game overlay | Cloud sync + cross-device |
| Meta feed, deck lists, Brew Lab | Unlimited history retention |
| Share cards, exports | Public profile customization |
| Everything shipped through v2.5.3 | Early access to new server features |

**Pricing posture:** do **not** undercut Untapped on price. A solo dev racing a funded company to the bottom loses; the low price also anchors the product as the cheap alternative rather than the better one. Price at or slightly under theirs and win on native performance, no ads, no bloat, privacy, and responsiveness.

**Sell a capped Founder's Lifetime tier at launch.** Cash up front when it's most useful, a hard cap so it doesn't cannibalize recurring revenue forever, and it converts the earliest users into evangelists. Solo-dev-friendly in a way monthly billing is not.

#### "Can't I just make the repo private?" — it doesn't change the conclusion

It helps less than it looks, and it costs something real.

**Why it doesn't fix enforcement:** the binary ships to the user's machine either way. The Tauri frontend is a JS bundle inside that binary — extractable and patchable. The Rust side is compiled, but compiled is not tamper-proof. Closing the source raises the *effort* to crack; it does not change the fact that **code running on someone else's computer cannot enforce anything.** And the repo has been public since launch, so history is already cloneable and possibly mirrored — that cannot be undone.

**The realistic threat model** isn't skilled crackers targeting a niche MTG tool. It's one person posting a patched build to Reddit. Low frequency, but the point stands: effort spent on a gate that doesn't hold is effort not spent on value that does.

**The strategic cost is the bigger issue.** The privacy claim is currently *verifiable* — anyone can read the source and confirm nothing is uploaded. Going private at exactly the moment a backend is added removes that verifiability precisely when users have the most reason to want it. **Auditability is a feature when privacy is the differentiator.** Secondary losses: the CI badge signal, contributions, and the open fan-project posture that distinguishes FND from a commercial competitor.

**Recommendation:** keep the app repo public. The server-side rule was never really a piracy defense — server-side value is enforceable, *is* genuinely the thing worth paying for, and cannot be copied by a competitor. Those three hold regardless of repo visibility.

**Middle path if it still feels wrong:** keep the app public, put the backend/billing code in a **separate private repo**. Standard practice, and it gets both properties. Going fully private is a defensible choice — just don't let it change the architecture, because the architecture is right for reasons that have nothing to do with piracy.

### 1.5 Friends / social — **yes to the light version, no to chat relay**

**Cut the in-app chat relay.** It is the worst-ROI item on the list:

- Hosting cost that scales with usage and produces no revenue.
- **Moderation liability** — you become responsible for what strangers say inside your app.
- It needs density you do not have. An empty chat is worse than no chat.
- **Discord already exists**, every MTG community is already on it, and it is free.

**Async social works at low density and is worth building** — friend codes, compare stat lines, "your pod's meta," a friends ladder race during a season. All of it rides the same backend as the crowd meta. None of it needs real-time infrastructure.

### 1.6 Website expansion — **expand, but not toward Untapped**

`/meta-web/` already exists: 32 deck pages, `standard.html`, `pioneer.html`, generated daily by `pipeline/build-meta-site.mjs`. Current state:

- Pages are **thin** (~155 lines each).
- There is **exactly one link** to `/meta-web/` from `website/index.html`.
- It is in the sitemap but barely interlinked.

**That is an SEO engine with the ignition off.** The data is already being generated four times a day; it is simply not being turned into an indexable corpus.

The right expansion is **programmatic SEO**, not a web app clone:

- Per-archetype pages (evergreen URL, daily-refreshed content)
- Per-card pages ("what plays [card] in Standard right now")
- Matchup pages
- Time-anchored pages — "Best Standard decks — July 2026" — which are what people actually search
- Budget / wildcard-cost pages (on-brand for *Filthy Net Deck*)
- Deep interlinking + a real sitemap + per-page OG cards

**Do not rebuild Untapped's web app.** Their web product is their acquisition channel because they are web-first. FND is desktop-first; the website's job is **discovery that funnels to installs**, not a second product to maintain.

---

## 2. What the brief missed

### 2.1 There is currently no way to know how many users exist

Zero telemetry is principled but at scale it is dangerous: an Arena patch breaks the parser and the first signal is a bad review. Two fixes, both cheap:

1. **Passive, immediate, zero-privacy-cost:** every install hits **`/updater/latest.json`** on launch via the signed Tauri updater. Netlify Web Analytics already records it — filter to that path for install and DAU numbers **today**, with no code change and nothing new leaving the user's machine.

   > ⚠️ **Corrected 2026-07-30.** This originally said `version.json`. That was wrong: `useAppStore::checkForUpdates` tries the signed updater first and returns early whenever it answers, so `/version.json` is only a fallback for when that check *fails* — real installs never request it. An attempt to instrument it counted 0 app hits and caused two production incidents. Full write-up in [`INSTALL-COUNTING.md`](INSTALL-COUNTING.md). **Do not put a function in front of `/updater/latest.json`** — it drives the signed auto-update. Reading its count in Analytics is free and safe; code in that path is not.
2. **Opt-in parser-health ping:** app version, parser version, crash/parse-failure class. No account, no PII, no match data. Ship it *before* scaling, not after.

### 2.2 The streamer / OBS play

Untapped grew through streamers. A free **OBS browser-source overlay** with a small `filthy-net-deck.com` watermark is distribution that compounds without ongoing effort. The overlay webview already exists — a meaningful share of the work is done.

### 2.3 Public profile pages are the viral loop — and the correct *first* backend feature

`filthy-net-deck.com/u/<name>` showing a season's climb. Users share it → it is an SEO page → it drives installs → installs feed crowd data → crowd data improves the product.

This should ship **before** cloud sync. Sync is invisible to everyone except the one user who has it; a profile page is visible to everyone they know.

### 2.4 Wildcard cost — verified against the real logs 2026-07-29

**Checked empirically**, not from memory: `tracker.rs` (2,898 lines) plus the live `Player.log` (7.4 MB) and `Player-prev.log` (53 MB). Both logs start at engine init, both have Detailed Logs enabled, and `Player-prev.log` contains 17 full login sequences — so this is boot-to-session coverage, not a partial sample.

**What the parser currently reads:** `matchGameRoomStateChangedEvent`, `greToClientEvent`, `gameStateMessage`, `deckMessage`, `CourseDeckSummary`, `constructedClass` (rank), `ZoneType_Library`, `authenticateResponse`. **Zero** inventory or collection parsing — grep for `Inventory` / `Collection` / `Wildcard` / `vault` across `src-tauri/src/*.rs` returns nothing.

**What the log actually contains — available today, unparsed:**

An `InventoryInfo` block rides along on the DeckSelect course payload:

```
"InventoryInfo":{"SeqId":1,"Gems":330,"Gold":18155,"TotalVaultProgress":190,
"wcTrackPosition":26,"WildCardCommons":1191,"WildCardUnCommons":216,
"WildCardRares":9,"WildCardMythics":15,"CustomTokens":{...},"Boosters":[],
"Vouchers":{...},"PrizeWallsUnlocked":[],"Cosmetics":{...}}
```

Wildcard balance, gems, gold, vault progress, draft/play tokens — all there, all local, all currently ignored.

**What is NOT there — the feature as originally scoped is dead:**

| Probe | Player.log | Player-prev.log |
|---|---|---|
| `PlayerInventory.GetPlayerCardsV3` | 0 | 0 |
| `GetPlayerCards` | 0 | 0 |
| `PlayerInventory.GetPlayerInventory` | 0 | 0 |
| `CardsOwned` / `OwnedCards` | 0 | 0 |
| `CardPool` (non-empty) | 0 | 0 |
| digit-keyed card-count maps | 0 | 0 |

`CardPool` exists but is always empty (it is the limited/draft pool). There is no local ownership cache in `MTGA_Data/` or `LocalLow/` either. **The card-ownership dump that older trackers relied on is no longer written to `Player.log`.** "Rank meta decks by what you can craft" cannot be built as described, because the app cannot know which cards the user already owns.

**The reduced version that IS buildable, entirely locally:**

> **"This deck costs 9 rare + 4 mythic wildcards to build from scratch. You have 9 rares and 15 mythics."**

Worst-case craft cost per meta deck, checked against a real wildcard balance, with an "affordable right now" filter across the 8×8 grid. Weaker than the original idea — it can't subtract what you already own — but genuinely useful, dead on-brand for *Filthy Net Deck*, needs no infrastructure, and the data is sitting in a log the app already tails.

**Possible incremental improvement:** cards appearing in decks the user has actually played are necessarily owned, so ownership can be accumulated as a **lower bound** over time. This must be labelled honestly — *"known owned (seen in your decks)"*, never *"your collection"* — or it violates the no-fabrication promise. Treat as optional, later.

**Revised priority:** this is no longer a candidate to jump the queue. It is a good, cheap, local feature — a normal `ROADMAP.md` item, not a strategic move.

**Caveat on the evidence:** absence across two full logs is strong but it is not proof. If Arena only emits collection data on particular flows — a first login after a client update, or opening the collection screen — it could exist and simply be missing from this sample. Worth one more look before permanently writing off the full version. To re-check, open the collection screen in Arena, then:

```bash
grep -c "GetPlayerCardsV3\|CardsOwned" "$LOCALAPPDATA/../LocalLow/Wizards Of The Coast/MTGA/Player.log"
```

### 2.5 An email list

Netlify Forms is already available on the project. A weekly meta email is an **owned audience** that no algorithm can take away. Costs nothing, compounds, and it is the only channel here not rented from a platform.

### 2.6 Two legal items that gate the entire monetization plan

**Verify these personally before taking money. Do not skip.**

1. **WotC Fan Content Policy** restricts commercial use of fan content. Untapped, Moxfield, Archidekt and others operate commercially, so a workable path clearly exists — but confirm the current terms and where companion tools sit. Rebuilding monetization after a takedown is far worse than checking now.
2. **Scryfall API terms** — attribution, rate limiting, and conditions around commercial use of data and card imagery. The app depends on Scryfall for validation *and* card art.

Also worth confirming: WotC tolerates log-reading trackers but not in-draft assistance or automation. The existing non-goal ("no in-draft overlay — ToS") is correct and must stay.

### 2.7 Arena patch risk is existential

The entire moat is an unofficial parser against a format that can change without notice. Needed before scale: a documented fast-response process, a **public status page**, and an in-app "we know, fix incoming" channel (partially exists — My Stats already degrades honestly rather than recording garbage). At 300 users a two-day outage is a support ticket; at 10,000 it is a review-bombing.

### 2.8 Reality-check on "better in every way than Untapped"

Untapped has millions of aggregated matches. **That gap will not close for years**, and chasing it head-on is a losing fight against a funded team.

Compete asymmetrically. Win on: native desktop performance, no ads, no bloat, privacy, honest data, responsiveness, a real human behind it, and creator integration. The goal is not *"better in every way"* — it is ***"clearly better for players who dislike Untapped."*** That is winnable and defensible.

---

## 3. The sequence

**Gated on metrics, not dates** — so a subscription never gets built for 300 people. Each phase produces the input the next phase consumes.

### Phase 0 — Instrument & rails
*~1 week · no backend*

- ✅ **Install/DAU counting** — Netlify **Observability**, URL filter `/updater/latest.json` (**not** `version.json`, see §2.1; Web Analytics has no path breakdown for JSON assets). Baseline 2026-07-30: **~325 updater checks/7 days** (~46/day) and **84 `/downloads/` requests/7 days** — though the `206` partials mean that's realistically ~30–50 actual downloads. Implies **~15–25 daily active installs** and roughly **5 new installs/day**.
- ✅ **Ko-fi tip jar** — site + Settings → About (Ko-fi pays through to PayPal; PayPal.Me is not offered to Indonesian personal accounts). Single `DONATE_URL` constant in `src/services/site.ts`; empty string hides it everywhere. Gates nothing.
- ❌ **Discord server** — *cut by owner 2026-07-30.*
- ❌ **Email capture** — *cut by owner 2026-07-30.*
- ⬜ **Opt-in parser-health ping** — now the only way to get true unique-install counts, since no passive endpoint distinguishes machines. Ship with a release.

**Revised install estimate:** the measured data puts the base in the **low hundreds**, below the 200–350 guessed in §0 from visitor numbers. That *strengthens* the §0 conclusion rather than changing it — with daily actives in the teens, reach is unambiguously the binding constraint, and Phase 1 matters more than anything on the backend.

**Goal:** know the numbers, be able to take money.
**Gate to Phase 1:** none — this is unconditional groundwork.

### Phase 1 — Reach
*~3–4 weeks · no backend*

Owner selected **C + B** on 2026-07-30 and cut the rest for now.

- ✅ **C — crawlability** (`776bfa1`). The hub linked only the top 5 Bo1 decks per format, leaving **22 of 32 deck pages unreachable from it**; it now links all 32. Deck pages were dead ends with no outbound deck links; each now links 6 siblings plus its format hub — **192 internal links** across the corpus. Homepage gained a CTA block (previously one nav link). Sitemap gained `lastmod` + tiered priorities, replacing a flat 0.7.
- ✅ **B — page depth** (`776bfa1`). Deck pages 170 → ~257 lines: mana curve from `cmc` weighted by copies, composition by card type, key-card art strip, colors spelled out, richer descriptions, `BreadcrumbList` JSON-LD. Also fixed `og:image` being pinned at `?v=1.5.1` since v1.5.1 — social caches had held a stale card for eight releases.
- ⬜ **A — 252 card pages** — not selected. Still the largest corpus expansion available.
- ❌ **D — monthly archive pages** — cut by owner. Would have needed to live outside `website/meta-web/`, which `build-meta-site.mjs` wipes on every run.
- ❌ **E / F / G** — per-page OG cards, automated X posts, OBS overlay — all cut for now.
- ❌ **Weekly meta email** — cut with email capture in Phase 0.

**Two pipeline data quirks discovered and relied upon** (both verified, both documented in `build-meta-site.mjs`):
1. Lands carry **no `type` field** — all 259 untyped rows in the feed are lands at cmc 0. That is what lets the mana curve exclude them.
2. `keyCards` (Goldfish meta tile) and the decklist (archetype page) are **different sources** and disagree for 3 of 87 key cards. Those are dropped rather than rendered as empty captions; 3 decks have no `keyCards` at all and omit the section.

**Netlify rewrites the deployed HTML.** Pretty URLs turns `href="deck/x.html"` into `href='/meta-web/deck/x'` — absolute, no extension, single-quoted. Both forms return 200 and every canonical points at the `.html` form, so indexing consolidates correctly. Worth knowing before diffing local output against production and concluding a deploy failed.

**Goal:** acquisition that compounds without daily effort.
**Gate to Phase 2:** organic search traffic visibly non-zero and installs meaningfully growing. **Do not start Phase 2 before this.** As of 2026-07-30 that gate is **not met** — the SEO work is hours old and needs weeks to be crawled. Measuring it requires Google Search Console, which is not yet set up.

### Phase 2 — Accounts + public profiles
*~4–6 weeks · first backend*

- **Supabase** (Postgres + auth + row-level security) — chosen for velocity as a solo dev. Abstract the boundary so a move to Cloudflare Workers/D1 is possible if costs bite.
- **Discord OAuth** via system browser → deep-link callback into the app. `src/services/deepLinks.ts` already exists.
- **First feature: public profile pages + shareable deck pages.** Acquisition-visible.
- **Second feature: cloud sync.** Quiet, useful, invisible.
- Consent screen per §1.2 rules.

**Goal:** the platform everything else needs, shipped in acquisition-first order.
**Gate to Phase 3:** enough opted-in users for statistically honest aggregates.

### Phase 3 — Crowd meta
*The moat*

- Opt-in match sharing → FND's own aggregate matchup winrates
- **Must respect the no-fabrication data promise**: show sample sizes, suppress thin cells, never present a 12-match sample as a winrate. This is the same discipline `build-meta.mjs` already enforces — apply it to crowd data or the promise is dead.
- Reduces the MTGGoldfish dependency (§1.1)

**Goal:** data no competitor of this size has, and the thing worth paying for.
**Gate to Phase 4:** crowd data is good enough that a reasonable person would pay for it.

### Phase 4 — Pro tier

- Server-side-only paywall per §1.4 table
- Stripe, server-validated entitlement
- Capped Founder's Lifetime tier at launch
- Price at or slightly under Untapped — verify their current tiers first

### Phase 5 — Light social

- Friend codes, stat-line comparison, pod leaderboards, seasonal friend ladder races
- **Still no chat.** Discord is the chat.

---

## 4. Cut list

| Cut | Why |
|---|---|
| In-app real-time chat relay | Cost + moderation liability + needs density you don't have; Discord already solves it free |
| Competing on data breadth | Millions of matches vs. zero — unwinnable head-on for years |
| Undercutting on price | Race to the bottom against a funded team; also anchors FND as "the cheap one" |
| A full web-app clone of Untapped | Second product to maintain; FND is desktop-first, the site's job is discovery |
| Any client-side paywall | Public repo + Tauri = unenforceable |
| Mobile | Log tailing is desktop-only; already a standing non-goal |

---

## 5. Risks that could kill this

| Risk | Severity | Mitigation |
|---|---|---|
| Arena patch breaks the parser | **Existential** | §2.7 — fast-response process, status page, health ping |
| WotC / Scryfall terms block monetization | **High** | §2.6 — verify before taking money, not after |
| Cloud features erode the privacy positioning | **High** | §1.2 rules, enforced without exception |
| Backend cost outruns revenue | Medium | Free tier costs nothing server-side by design; cost-per-user budgeted before Phase 2 |
| Solo-dev bandwidth | Medium | Gates exist precisely to prevent building the wrong thing at the wrong time |
| Crowd data is too thin to be honest | Medium | Phase 3 gate + sample-size discipline; ship nothing rather than ship noise |
| Reach never materialises | Medium | Phase 1 gate stops the spend before the backend exists |

---

## 6. The through-line

> SEO brings installs → installs bring opt-in data → data becomes the product → the product becomes the subscription.

Each phase is the raw material for the next. Skipping ahead — building billing before reach, or sync before profiles — breaks the chain and burns the scarcest resource in the whole plan, which is solo-dev time.

---

*Not affiliated with Wizards of the Coast. MTG and MTG Arena are trademarks of Wizards of the Coast LLC.*

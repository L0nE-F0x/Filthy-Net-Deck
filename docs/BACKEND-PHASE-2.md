# Phase 2 — Accounts, profiles, and the crowd-meta backend

**Prepared:** 2026-08-10 · grounded in the real `TrackedMatch` shape, not a sketch
**Parent plan:** [`PLATFORM-STRATEGY.md`](PLATFORM-STRATEGY.md) §1.1, §1.2, §2.3, §3
**Status:** ✅ **BUILT — all 8 slices shipped v2.7.5 → v2.8.2.** Reconciled against the code 2026-08-12.

> This started as a design document and is now a **record of what was built**.
> Where the built thing differs from the design, the difference is called out
> inline rather than edited away — the reasoning is the useful part.
>
> | Slice | Shipped |
> |---|---|
> | 0 · parser-health ping | v2.7.5 |
> | 1 · schema, RLS, archetype seeding | v2.7.6 |
> | 2 · deep-link scheme + Google/Discord OAuth | v2.7.6 |
> | 3 · consent screen, one cloud toggle | v2.7.6 |
> | 4 · public profile pages `/u/<handle>` | v2.7.7 |
> | 5 · match upload + hourly rollup | v2.7.6 |
> | 6 · crowd matchup UI, gated on `games >= 30` | v2.7.6 |
> | 7 · cloud deck sync | v2.8.0 |
>
> **Seven migrations are live on the DB**, not the five listed in older notes:
> `health_pings`, `core_schema`, `public_profiles`, `display_name_privacy`,
> `decks`, `public_decks`, `friends`.
>
> **Email OTP (§6) is built but hidden** behind `EMAIL_SIGN_IN_ENABLED` in
> `src/services/cloud/config.ts` — Supabase's built-in mailer is rate-limited
> per project and fails by silently not delivering, which under a launch spike
> reads as a broken app. It also has **no test coverage**, unlike the OAuth path.
> Both need fixing before it is switched back on.

Phase 1's gate was waived by the owner on 2026-08-10 (Search Console: 3 clicks /
32 impressions / avg position 11.2 over 28 days — thin, but Netlify Web
Analytics shows real and growing app usage). Recorded in `PLATFORM-STRATEGY.md` §3.

---

## 0. Scope of the cloud opt-in

**Revised 2026-08-10.** Privacy was demoted from a strategic pillar to an ordinary
constraint (`PLATFORM-STRATEGY.md` §1.2), which simplifies this design
considerably. An earlier draft split match-sharing and deck-sharing into two
separate opt-ins and coarsened several fields. Both are gone:

| Was | Now | Why |
|---|---|---|
| Two opt-ins (matches / decks) | **One** — "Sync & community data" | Simpler to explain and to build |
| `playedOn` day only | Exact `endedAt` timestamp | More useful; the fingerprinting concern was over-weighted |
| `rankTier` ("Diamond") | Full rank ("Diamond 1") | Genuinely better data for climb analysis |
| Bucketed match counts | Exact counts | Ditto |
| Retention justified as privacy | Retention justified by **cost** | Honest about the real reason |

**Two things stay, and they are not about positioning:**

1. **Never upload another player's identity.** `opponentName` and `opponentSeen`
   do not leave the machine — not hashed, not "anonymised". An Arena handle
   identifies a real person who consented to nothing, and UK/EU users bring GDPR
   with them regardless of how the app is marketed. Infer the archetype locally,
   upload the *label*. Cost: one line in an allowlist.
2. **Build the payload from an explicit allowlist**, never by serialising
   `TrackedMatch`. This is ordinary engineering hygiene — it means a new field
   added to the tracker cannot silently start being uploaded.

The app also stays **fully functional with no account**. That is an adoption
requirement, not a privacy one: forcing sign-up on a passion-project tracker
kills the funnel.

---

## 1. What actually gets uploaded

Derived from the real type in `src/types/tracker.ts`. **Allowlist, not blocklist.**

```ts
interface SharedMatch {
  clientHash: string;      // sha256(matchId + user salt) — dedupe key, not reversible
  startedAt: number;       // unix ms, exact
  endedAt: number;
  format: "standard" | "pioneer";
  bestOf: 1 | 3;
  ranked: boolean;         // isLadderEvent(eventId)
  rank: string | null;     // "Diamond 1" — full rank
  seasonOrdinal: number | null;
  myArchetype: string;     // canonical slug, resolved locally
  myDeckHash: string | null;     // groups a user's own matches by list
  oppArchetype: string | null;   // inferOpponentArchetype(), null when unconfident
  oppConfidence: number | null;  // so the server can weight or reject
  result: "win" | "loss" | "draw";
  games: { onPlay: boolean | null; won: boolean; mulligans: number | null }[];
}
```

Decklists (`deckMain` / `deckSide` / `deckName`) ride the same opt-in but go to
the `decks` table, not onto every match row — that is a normalisation choice, not
a privacy one.

**Not uploaded:** `opponentName`, `opponentSeen`, `opponentPlatform`,
`myPlayerName`, raw `matchId`.

The first two are the ones that matter and the reasoning is worth keeping:
`opponentSeen` (the raw grpIds an opponent revealed) would genuinely give better
server-side archetype inference — it is the single most useful field the crowd
meta could have — but it is a detailed behavioural record of a player who never
opted in to anything. Infer locally, upload the label. `myPlayerName` and raw
`matchId` are simply not needed for any query.

---

## 2. Schema

Postgres (Supabase). RLS on every table.

```sql
-- Canonical archetypes, seeded from the existing meta feed. Never user-created.
create table archetypes (
  slug        text primary key,          -- 'standard-mono-white-auras'
  format      text not null,
  name        text not null,
  first_seen  date not null default current_date
);

create table profiles (
  id              uuid primary key references auth.users on delete cascade,
  handle          citext unique not null,       -- /u/<handle>
  display_name    text,
  created_at      timestamptz not null default now(),
  -- One cloud opt-in (§0), default FALSE. Profile visibility is separate
  -- because it is a publishing choice, not a data-sharing one.
  cloud_enabled   boolean not null default false,
  profile_public  boolean not null default false,
  -- Anti-abuse (see §4)
  trust           smallint not null default 0
);

create table shared_matches (
  id              bigserial primary key,
  user_id         uuid not null references profiles on delete cascade,
  client_hash     text not null,
  started_at      timestamptz not null,
  ended_at        timestamptz not null,
  format          text not null,
  best_of         smallint not null,
  ranked          boolean not null,
  rank            text,
  my_deck_hash    text,
  season_ordinal  int,
  my_archetype    text references archetypes(slug),
  opp_archetype   text references archetypes(slug),
  opp_confidence  real,
  result          text not null check (result in ('win','loss','draw')),
  games           jsonb not null default '[]',
  created_at      timestamptz not null default now(),
  unique (user_id, client_hash)          -- idempotent upload, safe to retry
);
create index on shared_matches (ended_at, format, my_archetype, opp_archetype);

-- Aggregated nightly. This is what the app reads; raw rows are never queried live.
create table matchup_rollup (
  format        text not null,
  best_of       smallint not null,
  a_archetype   text not null references archetypes(slug),
  b_archetype   text not null references archetypes(slug),
  period        date not null,           -- rolling 30d window anchor
  games         int not null,
  a_wins        int not null,
  a_on_play_wins int not null,
  a_on_play_games int not null,
  primary key (format, best_of, a_archetype, b_archetype, period)
);

create table decks (               -- cloud_enabled only
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles on delete cascade,
  name        text not null,
  format      text not null,
  main        jsonb not null,      -- arena grpIds
  side        jsonb not null default '[]',
  is_public   boolean not null default false,
  updated_at  timestamptz not null default now()
);
```

**RLS posture:** `shared_matches` and `decks` are insert/select/delete **own rows
only**. `matchup_rollup` and `archetypes` are public read, service-role write.
`profiles` is public read of `(handle, display_name)` **only when
`profile_public`**, and full read/write for the owner.

> ⚠️ **Grants are not automatic on this project.** "Automatically expose new
> tables" is deliberately OFF, so every new table starts with **no** privileges
> for the Data API roles — `service_role` included. Each migration must say
> `grant … to service_role;` explicitly. Symptom when forgotten: an Edge
> Function write fails with Postgres `42501` even though its key is correct,
> which looks like a database fault rather than a config one (hit 2026-08-10 on
> `health_pings`).
>
> Also note **RLS is row-level, not column-level** — a `select` policy exposes
> the whole row. To publish only `(handle, display_name)` from `profiles`, use a
> view over a locked-down base table, not a policy.

**Retention.** Raw `shared_matches` are dropped after 120 days; the rollups are
permanent. The justification is **cost and unbounded growth** (§5), not privacy —
revised 2026-08-10. Note this trades away a user's own long-term history, so
revisit the window if per-user history turns out to matter more than the storage.

---

## 3. Honest aggregates

`PLATFORM-STRATEGY.md` §3 requires the no-fabrication promise apply to crowd
data. Concretely:

- **Suppress any cell with `games < 30`.** Show "not enough data yet", never a
  number. 30 is the point where a 60% winrate has a ~±17pp 95% interval — still
  wide, but no longer noise.
- **Report a Wilson score interval, never a raw proportion.** A 7–3 record is not
  "70%". Store `games` and `a_wins`; compute the interval at read time.
- **Show `n` on every single cell.** Non-negotiable, matches what
  `build-meta.mjs` already does for the scraped feed.
- **Deduplicate the two sides of a matchup.** If both players use FND, one match
  produces two rows with mirrored perspectives. Canonicalise `(a, b)` by sorting
  the slugs and flipping the result, so the pair is counted once — otherwise
  popular archetypes double-count against each other and the whole table skews.

That last point is easy to miss and quietly corrupts everything downstream.

---

## 4. Anti-abuse — the part that is usually forgotten

An opt-in crowd meta is *poisonable*, and the moat is worthless if the numbers
can be pushed. The client is on the user's machine and the repo is public, so
assume the payload can be forged.

| Vector | Mitigation | As built |
|---|---|---|
| Mass fake matches | Per-user rate limit: 100 matches/day, 400/week | ⚠️ **Changed.** Nothing was implemented until the v3.0.0 audit found the gap; now a `before insert` trigger caps **2,000/day** keyed on server-set `created_at`. 100/day was unshippable — a new user backfilling a long local history on first sync would fail and keep failing. The real job of this limit is cost, not integrity (the three rows below already bound influence), so it is set to never touch a real backfill |
| Duplicate submissions | `unique (user_id, client_hash)` — replays are no-ops | ✅ As designed |
| A single user skewing a cell | Cap any one user's contribution to **5%** of a given matchup cell | ✅ As designed. Note the consequence: the cap only stops binding at **≥20 contributors** per cell, so cells fill slowly by construction |
| Statistical outliers | Exclude users whose overall winrate is >75% or <25% over 200+ matches | ⚠️ **Was missing.** Specified here, never implemented, added in migration `20260812060000` as a CTE anti-join (the correlated form is quietly quadratic) |
| Throwaway accounts | `trust` starts at 0; matches count only after 25 matches and 7 days | ✅ As designed (`refresh_trust()`) |
| Archetype spoofing | FKs to the seeded `archetypes` table | ⚠️ **Deliberately changed** to a regex shape check. A hard FK would reject a legitimate match whenever the registry lagged the feed — the day a new archetype appears — and silently lose real user data. Unknown slugs are stored and start counting the moment they are registered. Reasoning is in the migration |

None of this stops a determined attacker. It raises the cost above what a niche
MTG tool attracts, which is the right target — same threat-model logic as
§1.4's piracy discussion.

---

## 5. Cost model

**The project is already on Supabase Pro** (owner, 2026-08-10) — 8 GB database,
250 GB egress, 100k MAU included, $25/mo. Overage: ~$0.125/GB/mo storage,
~$0.09/GB egress. The standing instruction is still *keep costs as low as
possible*.

A `shared_matches` row is ~180 bytes of payload, but budget **~350 B effective**
once Postgres row overhead and the `(played_on, format, archetypes)` index are
counted.

| Opted-in sharers | Raw/day | At 120-day retention |
|---|---|---|
| 1,000 | ~7 MB | **~0.8 GB** — comfortable |
| 5,000 | ~35 MB | **~4.2 GB** — over half the included 8 GB |
| 10,000 | ~70 MB | **~8.4 GB** — exceeds it; retention or overage required |

Rollups are negligible by comparison: bounded by archetype pairs (~60 × 60 × 2
formats × 2 Bo) ≈ 15k rows, a few MB, permanent.

**Conclusions under Pro:**
1. Storage is **not** the near-term constraint it would be on free — there is
   headroom to roughly **5–8k active sharers** before it bites. Nothing here
   needs to be over-engineered for cost on day one.
2. The 120-day retention window is justified by **cost and unbounded growth**,
   not privacy (revised 2026-08-10). With Pro's headroom it could be extended —
   the question to ask is whether users want more than 120 days of their own
   history, not whether shorter is "safer".
3. **Read rollups only, never raw.** This is the rule that actually matters for
   cost, because egress scales with *readers*, not writers. 250 GB is generous,
   but a client that queries raw matches would burn it unpredictably.
4. Keep the data layer behind `src/services/cloud/*` per §3, so the escape hatch
   to Cloudflare D1/Workers stays open if the economics change.

Abstract the data layer behind `src/services/cloud/*` so a move to Cloudflare
D1/Workers is a driver swap, per §3's instruction.

---

## 6. Auth — providers, and a correction to the parent doc

**Three ways in (owner, 2026-08-10): Google, Discord, and email.** Google is the
broadest-reach default; Discord fits an MTG audience; email is the fallback for
anyone who wants neither. The two OAuth providers are dashboard toggles plus an
app registered with each vendor — **not** an architectural choice, and not a
reason to change backend.

**Email uses a 6-digit code, not a password.** `signInWithOtp` →
`verifyOtp`. Rationale: no password to store, leak, or reset; no "forgot
password" flow to build; no email-confirmation deep link, because the code is
typed straight into the app rather than clicked in a browser. For a desktop app
this is strictly less machinery than email+password for the same result. (A
magic *link* would be worse here — it would need the deep-link hop again just to
get back into the app.)

### The tier model — clarified by the owner 2026-08-10

- **Signed out:** everything the app does today, unchanged, forever. No account,
  no nag, no degradation.
- **Signed in (free):** unlocks *additional* features — profile pages, crowd
  meta, deck sync. **Costs nothing.**
- **Paid:** possible one day, deferred indefinitely (`PLATFORM-STRATEGY.md`
  Phase 4). Nothing is being built toward it.

The distinction that matters when designing: **account-gated ≠ paid.** Do not
put an existing local feature behind sign-in, and do not treat sign-in as a
monetization step.

> **Firebase was considered and rejected (owner asked 2026-08-10).** The reason
> given was Google login — but Supabase supports Google OAuth natively, so the
> premise did not hold. Evaluated on merits anyway, Firebase is the wrong fit
> here for three reasons:
> 1. **The crowd meta is a relational aggregate.** Matchup rollups are a
>    `GROUP BY` over archetype pairs. Firestore has no joins and no `GROUP BY`;
>    every aggregate would be hand-maintained denormalised state in Cloud
>    Functions.
> 2. **Per-document read billing punishes exactly this workload.** The nightly
>    rollup must scan the whole window — ~600k document reads per run at 1,000
>    sharers, every night. Postgres does it in one indexed query on capacity
>    already paid for.
> 3. **Profile pages must be crawlable** (§2.3 — they are the SEO loop). The
>    site already builds static HTML in a pipeline; querying Postgres at build
>    time slots into `build-meta-site.mjs` naturally.
>
> Firebase's genuine strengths — real-time sync, push messaging — are unused
> here: chat was cut in §1.5 and this is a desktop app. Supabase Pro is already
> being paid for. **Decision: stay on Supabase.**

> `PLATFORM-STRATEGY.md` §3 Phase 2 says *"Discord OAuth via system browser →
> deep-link callback into the app. `src/services/deepLinks.ts` already exists."*
> **That is misleading.** `deepLinks.ts` is pure in-app routing for meta decks,
> tags and cards. There is no `tauri-plugin-deep-link` dependency and no custom
> URI scheme registered in `tauri.conf.json`. The OAuth callback plumbing is
> entirely unbuilt — budget it as real work, not as wiring.

Flow (identical for every provider — and note **Google refuses OAuth from
embedded webviews**, so the system-browser hop is mandatory, not a preference):

1. App opens the **system browser** to Supabase's OAuth URL for the chosen
   provider, with a PKCE challenge and `redirect_to` pointing at a page on
   `filthy-net-deck.com`.
2. That page bounces to `fnd://auth?code=…`.
3. `tauri-plugin-deep-link` (new dependency) receives it on the `main` window.
4. Client exchanges the code for a session; refresh token in the OS keychain via
   `tauri-plugin-stronghold` or the existing store — **not** `localStorage`,
   which is readable by anything sharing the webview origin.

**Register the scheme on Windows before building the UI** — it is an installer
concern (NSIS registry keys), so it must be verified in an *installed* build, not
`tauri:dev`. This is exactly the class of thing the 2026-07 audit flagged: origin
and installer behaviour differ in production (`tauri.localhost`).

---

## 7. Build order

Acquisition-visible first, per §2.3 — profiles before sync.

| # | Slice | Ships |
|---|---|---|
| **0** | **Opt-in parser-health ping** (§7.1) | Early warning + true install counts |
| 1 | Supabase project, schema, RLS, archetype seeding from the meta feed | Nothing user-visible |
| 2 | Deep-link scheme + Google & Discord OAuth, verified in an **installed** build | Sign-in, nothing else |
| 3 | Consent screen, one cloud toggle, one-click delete | The trust surface |
| 4 | **Public profile pages** `/u/<handle>` — season climb, archetypes played | The viral loop |
| 5 | Match upload (queue, retry, idempotent), nightly rollup job | Data starts accruing |
| 6 | Crowd matchup UI in-app, gated on `games >= 30` | The payoff for opting in |
| 7 | Cloud deck sync | The quiet one |

**Slice 7, as built (2026-08-11).** The app has no hand-authored deck library —
"your decks" are the lists Arena registers at the start of each match, so a deck
row is match history collapsed by `deckHash`. That history is re-derived from
Arena's logs on every launch, which is the whole argument for backing it up: the
logs rotate, and a list whose matches predate the surviving log is gone with no
way to ask Arena for it again. Restored lists fill `buildVersions` and are
labelled "restored" in the UI; a locally recorded list always wins.

Two details worth keeping:

- The `decks` table gained `deck_hash` with `unique (user_id, deck_hash)`. A
  list's identity *is* its contents, and upserting on it is what makes repeat
  runs free.
- Deck sync has **no high-water mark**. A list can be renamed with no new match,
  so "newer than X" would miss it; the client stores a fingerprint of the last
  successful upload instead.

**Slices 0–4 are shippable without a single match ever being uploaded.** That
ordering means the privacy-sensitive part (5) ships only after the trust surface
(3) and the acquisition win (4) are already live — and if reach still hasn't
moved by then, you can stop after 4 having lost nothing.

Slice 0 has no dependency on the rest and can ship in the next release.

---

### 7.1 Slice 0 — the parser-health ping

Closes the last ⬜ in `PLATFORM-STRATEGY.md` Phase 0. Two jobs, in priority
order:

1. **Detect a broken parser within hours instead of via a bad review.** §2.7
   calls Arena patch risk *existential*: the log format is unofficial and can
   change without notice, and when it does, tracking silently dies for everyone
   at once. A population-level spike in parse errors is the only early signal
   that exists.
2. **Count true unique installs.** `/updater/latest.json` hits cannot distinguish
   325 people once from 15 people twenty times, and counting IPs would be both
   unreliable and *more* invasive than this.

#### Payload

```ts
interface HealthPing {
  installId: string;      // random UUID, generated once on opt-in
  appVersion: string;     // "2.7.4"
  parserVersion: string;  // bumped when tracker.rs parsing changes
  os: string;             // "windows" | "macos" — not the build number
  logFound: boolean;
  detailedLogs: boolean | null;
  parseErrors: number;         // TrackerStatus.parseErrors
  matchesLast24h: number;      // exact — revised 2026-08-10
}
```

`matchesLast24h` was bucketed in the first draft on privacy grounds; with §1.2
downgraded it is an exact count, which makes "did recording stop across the
population overnight?" a sharper signal.

Nothing else is sent. No decks, match detail, opponents, Arena username, file
paths, or IP-derived location.

#### Transport

A Supabase **Edge Function**, not a direct table write:

- Client never holds a database credential, and the schema can change without
  shipping an app update.
- Rate-limit by IP at the edge; the client is in a public repo, so a shared
  secret would be theatre.
- Upsert on `(install_id, day)` — **at most one row per install per day.** That
  caps volume by construction, makes retries free, and yields DAU directly.

```sql
create table health_pings (
  install_id       uuid not null,
  day              date not null,
  app_version      text not null,
  parser_version   text,
  os               text,
  log_found        boolean,
  detailed_logs    boolean,
  parse_errors     int  not null default 0,
  matches_last_24h int,
  updated_at       timestamptz not null default now(),
  primary key (install_id, day)
);
create index on health_pings (day, app_version);
```

Volume is trivial: one row/install/day. 10,000 daily actives for a year is
~3.6M rows of ~80 B — well inside Pro. Retain 180 days.

#### Client behaviour

- **Default OFF.** Explicit opt-in in Settings → Data & privacy, with the field
  list shown in plain language rather than a link to a policy — cheap to do, and
  it is the kind of thing a streamer audience will screenshot approvingly.
- Fires **at most once per day**, on launch, after a short delay so it never
  competes with boot.
- Fails silently and never retries aggressively — this must never affect app
  behaviour or startup time.
- `installId` lives in the Rust app-data dir (alongside `presence-enabled`), not
  `localStorage`, so it survives a webview storage clear.
- **Opt-out deletes the server rows and the local id.** Re-opting-in generates a
  fresh id — a discontinuity in the counts is the correct trade for honouring
  §1.2 rule 4.

#### The honest tradeoff

`installId` is a persistent identifier for a machine — **pseudonymous, not
anonymous**. It makes "this install has been active 60 days" knowable. That is
the whole point (it is how unique installs get counted at all), and with §1.2
downgraded it needs no special defence beyond being opt-in and saying plainly
what it sends.

One judgement call worth flagging: **default off** is kept even though a default-on
ping would give far better coverage. Reason is practical rather than
philosophical — the README currently promises nothing is uploaded, and flipping
that to on-by-default in an update is the kind of thing that produces a bad
thread. Ship it off, explain it, and revisit if uptake is too low to be useful.

---

## 8. What must change outside the code

- ✅ **README** — done **2026-08-12, three releases late.** The rule was "rewrite
  it the moment the first upload ships"; uploads shipped in v2.7.5 and the README
  went on promising *"entirely on your PC. Nothing is uploaded anywhere"* until
  v3.0.0. Two marketing-site claims were wrong for the same span. Nobody was
  uploaded without consenting — the in-app consent copy was accurate the whole
  time — but the *published* claim was false and no checklist item owned it.
  `AGENTS.md` now carries a binding rule tying payload changes to all three
  surfaces. Full post-mortem in `PLATFORM-STRATEGY.md` §1.2 rule 4.
- ✅ **A short privacy page on the site** — `website/privacy.html`, shipped
  v3.0.0. Lists both allowlists field by field, names the five things that are
  never uploaded, and is linked from the site footer *and* from Settings → Data
  & privacy, one click from the toggles themselves. Generated into the sitemap
  by `build-meta-site.mjs` (static pages sit outside the `/meta-web/` corpus and
  must not inherit its daily `lastmod`).
- ⬜ **§2.6 legal items** (WotC Fan Content Policy, Scryfall commercial terms)
  gate *taking money*, and Phase 4 is deferred indefinitely — so nothing here is
  blocked. They must be done before Phase 4 is ever revived, **not after**.

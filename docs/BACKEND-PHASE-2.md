# Phase 2 — Accounts, profiles, and the crowd-meta backend

**Prepared:** 2026-08-10 · grounded in the real `TrackedMatch` shape, not a sketch
**Parent plan:** [`PLATFORM-STRATEGY.md`](PLATFORM-STRATEGY.md) §1.1, §1.2, §2.3, §3
**Status:** design — nothing built, no infrastructure provisioned

Phase 1's gate was waived by the owner on 2026-08-10 (Search Console: 3 clicks /
32 impressions / avg position 11.2 over 28 days — thin, but Netlify Web
Analytics shows real and growing app usage). Recorded in `PLATFORM-STRATEGY.md` §3.

---

## 0. The one decision that shapes everything else

**Match sharing and deck sharing are two separate opt-ins, not one.**

The strategy doc treats "cloud" as a single toggle. It cannot be, because the two
asks have completely different trust profiles:

| | Match sharing | Deck / profile sharing |
|---|---|---|
| What leaves | Archetype vs archetype, result, on-play, rank tier | Your actual decklists |
| Who it's about | You **and your opponent** | Only you |
| Why a user says yes | To get community matchup data back | To show off / sync devices |
| Reconstructable | Nothing personal | Your collection, partially |

Bundling them means a user who just wants a shareable profile page is also
uploading their play history, and a user who wants to contribute to the crowd
meta is also uploading their brews. Two checkboxes, two consent strings, two
server-side delete paths.

**A second, non-obvious consequence:** a shared match is partly *about someone
else*. `TrackedMatch.opponentName` is a real player's Arena handle. It must never
leave the machine — not hashed, not salted, not "anonymised." The upload payload
is built by an explicit allowlist, never by serialising `TrackedMatch`.

---

## 1. What actually gets uploaded

Derived from the real type in `src/types/tracker.ts`. **Allowlist, not blocklist.**

```ts
interface SharedMatch {
  clientHash: string;      // sha256(matchId + userId salt) — dedupe only, not reversible
  playedOn: string;        // "2026-08-10" — DAY, not a timestamp
  format: "standard" | "pioneer";
  bestOf: 1 | 3;
  ranked: boolean;         // isLadderEvent(eventId)
  rankTier: string | null; // "Diamond" — tier only, never "Diamond 1"
  seasonOrdinal: number | null;
  myArchetype: string;     // canonical slug, resolved locally
  oppArchetype: string | null;   // inferOpponentArchetype(), null when unconfident
  oppConfidence: number | null;  // so the server can weight or reject
  result: "win" | "loss" | "draw";
  games: { onPlay: boolean | null; won: boolean }[];
}
```

**Explicitly never uploaded:** `opponentName`, `myPlayerName`, `matchId` (raw),
`deckMain` / `deckSide`, `deckName`, `deckId`, `opponentSeen`, `startedAt` /
`endedAt` (exact ms), `opponentPlatform`.

Three of those deserve their reasoning stated, because each is a tempting
inclusion:

- **`opponentSeen`** (raw grpIds the opponent revealed) would give far better
  archetype inference server-side, and it is the single most valuable field for
  the crowd meta. It still must not go: it is a detailed behavioural record of
  another player who never consented. Infer locally, upload the *label*.
- **Exact timestamps** are a fingerprint. Two users' match streams can be
  correlated by timing alone — and if both uploaded, you could reconstruct who
  played whom. Day granularity kills that.
- **`rankTier` without the division.** "Diamond 1" plus a season plus a day is
  close to uniquely identifying at the top of the ladder. Mythic is the sharp
  case: bucket all of Mythic together, never a percentile or rank number.

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
  -- Two independent opt-ins. Both default FALSE. See §0.
  share_matches   boolean not null default false,
  share_decks     boolean not null default false,
  profile_public  boolean not null default false,
  -- Anti-abuse (see §4)
  trust           smallint not null default 0
);

create table shared_matches (
  id              bigserial primary key,
  user_id         uuid not null references profiles on delete cascade,
  client_hash     text not null,
  played_on       date not null,
  format          text not null,
  best_of         smallint not null,
  ranked          boolean not null,
  rank_tier       text,
  season_ordinal  int,
  my_archetype    text references archetypes(slug),
  opp_archetype   text references archetypes(slug),
  opp_confidence  real,
  result          text not null check (result in ('win','loss','draw')),
  games           jsonb not null default '[]',
  created_at      timestamptz not null default now(),
  unique (user_id, client_hash)          -- idempotent upload, safe to retry
);
create index on shared_matches (played_on, format, my_archetype, opp_archetype);

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

create table decks (               -- share_decks opt-in only
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

**Retention.** Raw `shared_matches` are dropped after 120 days; the rollups are
permanent. This is both a privacy property worth advertising and the thing that
keeps the database inside the free tier (see §5).

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

| Vector | Mitigation |
|---|---|
| Mass fake matches | Per-user rate limit: 100 matches/day, 400/week. A real human maxes out well below this |
| Duplicate submissions | `unique (user_id, client_hash)` — replays are no-ops |
| A single user skewing a cell | Cap any one user's contribution to **5%** of a given matchup cell in the rollup |
| Statistical outliers | Exclude users whose overall winrate is >75% or <25% over 200+ matches from aggregates (still show them their own data) |
| Throwaway accounts | `trust` starts at 0; matches count toward aggregates only after 25 matches and 7 days |
| Archetype spoofing | `my_archetype` / `opp_archetype` are FKs to the seeded `archetypes` table — unknown slugs are rejected, not created |

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
2. The 120-day retention window is therefore justified **primarily as a privacy
   property** — "we delete raw matches after 120 days" is a claim worth making
   and worth advertising — with cost control as the secondary benefit. It should
   not be dropped just because Pro has room.
3. **Read rollups only, never raw.** This is the rule that actually matters for
   cost, because egress scales with *readers*, not writers. 250 GB is generous,
   but a client that queries raw matches would burn it unpredictably.
4. Keep the data layer behind `src/services/cloud/*` per §3, so the escape hatch
   to Cloudflare D1/Workers stays open if the economics change.

Abstract the data layer behind `src/services/cloud/*` so a move to Cloudflare
D1/Workers is a driver swap, per §3's instruction.

---

## 6. Auth — and a correction to the parent doc

> `PLATFORM-STRATEGY.md` §3 Phase 2 says *"Discord OAuth via system browser →
> deep-link callback into the app. `src/services/deepLinks.ts` already exists."*
> **That is misleading.** `deepLinks.ts` is pure in-app routing for meta decks,
> tags and cards. There is no `tauri-plugin-deep-link` dependency and no custom
> URI scheme registered in `tauri.conf.json`. The OAuth callback plumbing is
> entirely unbuilt — budget it as real work, not as wiring.

Flow:

1. App opens the system browser to Supabase's Discord OAuth URL with a PKCE
   challenge and `redirect_to` pointing at a page on `filthy-net-deck.com`.
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
| 1 | Supabase project, schema, RLS, archetype seeding from the meta feed | Nothing user-visible |
| 2 | Deep-link scheme + Discord OAuth, verified in an **installed** build | Sign-in, nothing else |
| 3 | Consent screen (§1.2 wording), two toggles, one-click delete | The trust surface |
| 4 | **Public profile pages** `/u/<handle>` — season climb, archetypes played | The viral loop |
| 5 | Match upload (queue, retry, idempotent), nightly rollup job | Data starts accruing |
| 6 | Crowd matchup UI in-app, gated on `games >= 30` | The payoff for opting in |
| 7 | Cloud deck sync | The quiet one |

**Slices 1–4 are shippable without a single match ever being uploaded.** That
ordering means the privacy-sensitive part (5) ships only after the trust surface
(3) and the acquisition win (4) are already live — and if reach still hasn't
moved by then, you can stop after 4 having lost nothing.

---

## 8. What must change outside the code

- **README.** §1.2 rule 5: *"Local by default. Nothing leaves your PC unless you
  turn it on."* Rewritten precisely, not quietly dropped. This is the promise the
  whole privacy position rests on.
- **A privacy page on the site**, naming the exact field list from §1 — the
  allowlist is short enough to publish in full, which is itself the argument.
- **§2.6 legal items are still open** and gate *taking money*, not this phase.
  Nothing here charges anyone, so Phase 2 is not blocked — but Phase 4 is, and
  the WotC Fan Content / Scryfall terms check has not been done yet.

-- v3.0.0 audit fixes. Found reviewing v2.7.3 → v2.8.2 before the public push.
--
-- Four things, in severity order:
--   1. P0 — rebuild_matchup_rollup() can raise a NOT NULL violation and freeze
--           ALL community data, silently, every hour.
--   2. P2 — public_profile_decks published full decklists to anon, which is not
--           what the product says it does.
--   3. P2 — shared_matches had no server-side insert ceiling at all.
--   4. P3 — friend_lines.best_rank returned the *latest* rank, not the best.

-- ---------------------------------------------------------------------------
-- 1 · P0 — the rollup could abort on a NULL sum
-- ---------------------------------------------------------------------------
--
-- `a_on_play` is NULL for every row where the user was on the "b" side of the
-- canonical pair, and also whenever `games->0->>'onPlay'` is absent. So a user
-- contributing only b-side rows to a cell has on_play_games = 0, and the capped
-- CTE then computed:
--
--     round(0::numeric * least(0, cap) / nullif(0, 0))::int
--       → round(0 * 0 / NULL) → round(NULL) → NULL
--
-- If EVERY contributor to a cell is in that state, `sum(on_play_wins)` over the
-- group is NULL (SQL sum of all-NULLs is NULL), and the INSERT names the column
-- explicitly — so the `default 0` never applies and the NOT NULL constraint
-- raises 23502. That aborts the whole function, the hourly cron rolls back, and
-- `matchup_rollup` silently stops updating for every user.
--
-- Reachability is not theoretical: it needs only one matchup cell where all the
-- uploaded matches came from players on the alphabetically-later archetype.
-- That is MORE likely with few contributors and diverse pairings — i.e. exactly
-- at launch, which is the worst possible time for the moat to freeze.
--
-- Two belts here: coalesce the per-user value, and coalesce the sum.

create or replace function public.rebuild_matchup_rollup(window_days int default 30)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- §4 statistical outliers, specified in the design and never implemented.
  -- A user whose lifetime record is implausible over a real sample contributes
  -- nothing to anyone else's aggregates. They still see all of their own data;
  -- this only removes them from the shared numbers.
  --
  -- Computed ONCE as a CTE rather than as a correlated subquery inside
  -- `eligible` — the correlated form re-runs a full per-user aggregate for
  -- every candidate row, which is fine at 371 matches and quietly quadratic by
  -- the time this matters.
  with outliers as (
    select user_id
    from public.shared_matches
    where result in ('win', 'loss')
    group by user_id
    having count(*) >= 200
       and ( count(*) filter (where result = 'win')::numeric / count(*) )
           not between 0.25 and 0.75
  ),
  eligible as (
    select m.*
    from public.shared_matches m
    join public.profiles p on p.id = m.user_id
    where m.ended_at >= now() - make_interval(days => window_days)
      and m.opp_archetype is not null
      and m.result in ('win', 'loss')
      and coalesce(m.opp_confidence, 1) >= 0.5
      and p.trust >= 1
      and not exists (select 1 from outliers o where o.user_id = m.user_id)
  ),
  oriented as (
    select
      format, best_of, user_id,
      least(my_archetype, opp_archetype)    as a_archetype,
      greatest(my_archetype, opp_archetype) as b_archetype,
      case
        when my_archetype <= opp_archetype then (result = 'win')
        else (result = 'loss')
      end as a_won,
      case when my_archetype <= opp_archetype
           then (games->0->>'onPlay')::boolean else null end as a_on_play
    from eligible
    where my_archetype <> opp_archetype
  ),
  per_user as (
    select format, best_of, a_archetype, b_archetype, user_id,
           count(*)                                   as games,
           count(*) filter (where a_won)              as wins,
           count(*) filter (where a_on_play is not null)          as on_play_games,
           count(*) filter (where a_on_play and a_won)            as on_play_wins
    from oriented
    group by 1, 2, 3, 4, 5
  ),
  cell_totals as (
    select format, best_of, a_archetype, b_archetype, sum(games) as total
    from per_user group by 1, 2, 3, 4
  ),
  capped as (
    select p.format, p.best_of, p.a_archetype, p.b_archetype, p.user_id,
           least(p.games, greatest(1, (t.total * 0.05)::int)) as games,
           -- p.games is count(*) over a non-empty group, so it is never 0 and
           -- this divisor is never NULL. Left as-is deliberately.
           round(
             p.wins::numeric
             * least(p.games, greatest(1, (t.total * 0.05)::int))
             / nullif(p.games, 0)
           )::int as wins,
           least(p.on_play_games, greatest(1, (t.total * 0.05)::int)) as on_play_games,
           -- p.on_play_games CAN be 0 (all b-side rows, or no onPlay recorded),
           -- which is what produced the NULL. Zero games on the play means zero
           -- wins on the play — coalesce, do not let it become NULL.
           coalesce(
             round(
               p.on_play_wins::numeric
               * least(p.on_play_games, greatest(1, (t.total * 0.05)::int))
               / nullif(p.on_play_games, 0)
             )::int,
             0
           ) as on_play_wins
    from per_user p
    join cell_totals t using (format, best_of, a_archetype, b_archetype)
  )
  insert into public.matchup_rollup as r
    (format, best_of, a_archetype, b_archetype,
     games, a_wins, a_on_play_games, a_on_play_wins, contributors, computed_at)
  select format, best_of, a_archetype, b_archetype,
         coalesce(sum(games), 0), coalesce(sum(wins), 0),
         coalesce(sum(on_play_games), 0), coalesce(sum(on_play_wins), 0),
         count(distinct user_id), now()
  from capped
  group by 1, 2, 3, 4
  on conflict (format, best_of, a_archetype, b_archetype) do update
    set games = excluded.games,
        a_wins = excluded.a_wins,
        a_on_play_games = excluded.a_on_play_games,
        a_on_play_wins = excluded.a_on_play_wins,
        contributors = excluded.contributors,
        computed_at = excluded.computed_at;

  delete from public.matchup_rollup
  where computed_at < now() - interval '1 hour';
end;
$$;

revoke all on function public.rebuild_matchup_rollup(int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2 · P2 — the public deck view published the actual lists
-- ---------------------------------------------------------------------------
--
-- The product says a published deck shows "deck, format, size and last played
-- — NOT the list", and website/privacy.html now says so to the public. But the
-- view selected `d.main` and `d.side` (the Arena card ids) and is granted to
-- `anon`, so the full list of any published deck was readable straight off the
-- REST API.
--
-- The only consumer, netlify/functions/profile.mts, uses `main.length` and
-- `side.length` and never renders an id. So exposing the arrays bought nothing
-- and contradicted the stated behaviour — and it made the profile page pull
-- ~75 integers per deck across the wire to compute two numbers.
--
-- Sizes are computed here instead. If card names on public decks are ever
-- wanted, the blocker is an id→name map on the server (there isn't one), not
-- this view.

drop view if exists public.public_profile_decks;

create view public.public_profile_decks as
select
  p.handle::text                                as handle,
  d.id                                          as deck_id,
  d.name,
  d.format,
  coalesce(jsonb_array_length(d.main), 0)       as main_count,
  coalesce(jsonb_array_length(d.side), 0)       as side_count,
  d.played_at,
  d.updated_at
from public.decks d
join public.profiles p on p.id = d.user_id
where d.is_public
  and p.profile_public
  and p.handle is not null
  and p.cloud_enabled;

grant select on public.public_profile_decks to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3 · P2 — no server-side ceiling on shared_matches inserts
-- ---------------------------------------------------------------------------
--
-- §4 specified "100 matches/day, 400/week" and it was never implemented. The
-- client chunks at 50 and caps a run, but the client is in a public repo and
-- the REST endpoint takes authenticated inserts directly, so that is not
-- enforcement.
--
-- The design's 100/day is too tight to ship as written: a new user signing in
-- with a long local history backfills it in one go, and 100/day would fail
-- their first sync and keep failing. That is the opposite of the intended
-- effect — it would punish exactly the users worth having.
--
-- What the limit is actually for here is COST, not aggregate integrity: the 5%
-- cell cap, the trust gate and the confidence floor already bound how much any
-- one account can move a published number. So the ceiling is set generously
-- enough to never touch a real backfill (the owner's own history is 371) while
-- still bounding a runaway account.
--
-- Keyed on `created_at`, which the server sets. `ended_at` is client-supplied
-- and therefore forgeable — rate limiting on it would be trivially bypassed.

create index if not exists shared_matches_user_created_idx
  on public.shared_matches (user_id, created_at desc);

create or replace function public.shared_matches_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent int;
begin
  select count(*) into recent
    from public.shared_matches
   where user_id = new.user_id
     and created_at >= now() - interval '1 day';

  if recent >= 2000 then
    raise exception 'daily upload limit reached'
      using errcode = 'check_violation',
            hint = 'Uploads resume automatically within 24 hours.';
  end if;
  return new;
end;
$$;

drop trigger if exists shared_matches_rate_limit_trg on public.shared_matches;
create trigger shared_matches_rate_limit_trg
  before insert on public.shared_matches
  for each row execute function public.shared_matches_rate_limit();

-- ---------------------------------------------------------------------------
-- 4 · P3 — friend_lines returned the latest rank while calling it "best"
-- ---------------------------------------------------------------------------
--
-- The previous body took `array_agg(rank order by ended_at desc)[1]` — the most
-- RECENT rank — under a comment that said "Highest rank REACHED, not current:
-- this is a race, and what people actually compare is how far up they got".
-- The code did the opposite of its own comment, and the column was named
-- best_rank. (The TS doc-comment and the UI header both said "freshest"/"Rank",
-- so nothing user-visible actually lied — but the next person to touch this
-- would have believed the SQL.)
--
-- Ranking Arena labels correctly is not a simple string sort: "Mythic 82%",
-- "Mythic #874" and "Diamond 1" all order differently, and
-- `src/services/ranks.ts::rankValue` already owns that logic (a 0–22 scale
-- covering Mythic percentile and leaderboard place). Duplicating that parser in
-- SQL would guarantee the two drift.
--
-- So the function returns the DISTINCT ranks seen, and the client picks the max
-- with the parser it already has. One source of truth, and the honest answer.

drop function if exists public.friend_lines(int);

create function public.friend_lines(season int default null)
returns table (
  user_id      uuid,
  display_name text,
  handle       text,
  is_me        boolean,
  matches      bigint,
  wins         bigint,
  losses       bigint,
  ranks        text[],
  last_match   timestamptz
)
language sql
security definer
set search_path = public
as $$
  with circle as (
    select auth.uid() as id
    union
    select case when f.a = auth.uid() then f.b else f.a end
      from public.friendships f
     where f.a = auth.uid() or f.b = auth.uid()
  )
  select
    p.id,
    p.display_name,
    p.handle::text,
    p.id = auth.uid(),
    count(m.id),
    count(m.id) filter (where m.result = 'win'),
    count(m.id) filter (where m.result = 'loss'),
    coalesce(
      array_agg(distinct m.rank) filter (where m.rank is not null),
      '{}'
    ),
    max(m.ended_at)
  from circle c
  join public.profiles p on p.id = c.id
  left join public.shared_matches m
         on m.user_id = p.id
        and p.cloud_enabled
        and (season is null or m.season_ordinal = season)
  group by p.id, p.display_name, p.handle
$$;

revoke all on function public.friend_lines(int) from public, anon;
grant execute on function public.friend_lines(int) to authenticated;

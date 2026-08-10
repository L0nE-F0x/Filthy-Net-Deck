-- Phase 2 slices 1/3/5/6 — accounts, opt-in match sharing, crowd matchup data.
-- Design: docs/BACKEND-PHASE-2.md
--
-- ⚠️ This project has "Automatically expose new tables" OFF, so every table
-- below needs EXPLICIT grants. Without them an authenticated write fails with
-- 42501 even though RLS would have allowed it — the failure looks like a
-- database fault rather than a config one (hit on health_pings, 2026-08-10).

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user, created automatically on signup
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id              uuid primary key references auth.users on delete cascade,
  display_name    text,
  created_at      timestamptz not null default now(),
  -- The single cloud opt-in (§0). Default FALSE: signing in must never start
  -- an upload on its own — the user has to choose that separately.
  cloud_enabled   boolean not null default false,
  -- Anti-abuse: matches only count toward aggregates once an account has some
  -- history behind it (§4).
  trust           smallint not null default 0
);

alter table public.profiles enable row level security;
grant all    on public.profiles to service_role;
grant select, insert, update on public.profiles to authenticated;
revoke all   on public.profiles from anon;

drop policy if exists profiles_own_select on public.profiles;
create policy profiles_own_select on public.profiles
  for select to authenticated using (auth.uid() = id);
drop policy if exists profiles_own_update on public.profiles;
create policy profiles_own_update on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Create the profile row on signup. Doing this in a trigger rather than from
-- the client means a profile always exists, including for accounts created by
-- a provider we add later.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'user_name',
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- archetypes — display registry, fed from the existing meta pipeline
-- ---------------------------------------------------------------------------
--
-- Deliberately NOT a foreign key on shared_matches (a change from the first
-- draft of §2). A hard FK would reject a legitimate match whenever the registry
-- lagged the feed — e.g. the day a new archetype appears — and silently lose
-- real user data. Instead the slug is stored with a format check, and the
-- rollup only *aggregates* archetypes that are registered. Unknown slugs are
-- kept and start counting the moment they are registered. Fail-soft, and it
-- matches the pipeline's existing "never fabricate, never discard" posture.

create table if not exists public.archetypes (
  slug        text primary key,
  format      text not null,
  name        text not null,
  updated_at  timestamptz not null default now()
);

alter table public.archetypes enable row level security;
grant all    on public.archetypes to service_role;
grant select on public.archetypes to anon, authenticated;

drop policy if exists archetypes_public_read on public.archetypes;
create policy archetypes_public_read on public.archetypes
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- shared_matches — the opt-in upload
-- ---------------------------------------------------------------------------

create table if not exists public.shared_matches (
  id              bigserial primary key,
  user_id         uuid not null references public.profiles on delete cascade,
  client_hash     text not null,
  started_at      timestamptz not null,
  ended_at        timestamptz not null,
  format          text    not null check (format in ('standard', 'pioneer')),
  best_of         smallint not null check (best_of in (1, 3)),
  ranked          boolean not null default false,
  rank            text,
  season_ordinal  int,
  my_deck_hash    text,
  my_archetype    text not null check (my_archetype ~ '^[a-z0-9-]{1,80}$'),
  opp_archetype   text          check (opp_archetype ~ '^[a-z0-9-]{1,80}$'),
  opp_confidence  real          check (opp_confidence between 0 and 1),
  result          text not null check (result in ('win', 'loss', 'draw')),
  games           jsonb not null default '[]',
  created_at      timestamptz not null default now(),
  -- Idempotent upload: re-sending a match is a no-op, so the client can retry
  -- freely and a reinstall cannot double-count.
  unique (user_id, client_hash)
);

create index if not exists shared_matches_rollup_idx
  on public.shared_matches (ended_at, format, best_of, my_archetype, opp_archetype);
create index if not exists shared_matches_user_idx
  on public.shared_matches (user_id, ended_at desc);

alter table public.shared_matches enable row level security;
grant all on public.shared_matches to service_role;
grant select, insert, delete on public.shared_matches to authenticated;
revoke all on public.shared_matches from anon;

-- `id` is bigserial, so INSERT also needs USAGE on the backing sequence. Table
-- grants alone are not enough: without this every authenticated insert fails
-- with 42501, and the message points at the table rather than the sequence.
grant usage, select on sequence public.shared_matches_id_seq to authenticated, service_role;

-- Own rows only, in every direction. There is deliberately no public read:
-- raw matches are never exposed, only aggregates.
drop policy if exists matches_own_select on public.shared_matches;
create policy matches_own_select on public.shared_matches
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists matches_own_insert on public.shared_matches;
create policy matches_own_insert on public.shared_matches
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists matches_own_delete on public.shared_matches;
create policy matches_own_delete on public.shared_matches
  for delete to authenticated using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- matchup_rollup — what the app actually reads
-- ---------------------------------------------------------------------------

create table if not exists public.matchup_rollup (
  format          text not null,
  best_of         smallint not null,
  a_archetype     text not null,
  b_archetype     text not null,
  games           int  not null,
  a_wins          int  not null,
  a_on_play_games int  not null default 0,
  a_on_play_wins  int  not null default 0,
  contributors    int  not null default 0,
  computed_at     timestamptz not null default now(),
  primary key (format, best_of, a_archetype, b_archetype)
);

alter table public.matchup_rollup enable row level security;
grant all    on public.matchup_rollup to service_role;
grant select on public.matchup_rollup to anon, authenticated;

drop policy if exists rollup_public_read on public.matchup_rollup;
create policy rollup_public_read on public.matchup_rollup
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- The rollup job
-- ---------------------------------------------------------------------------
--
-- Three things here are load-bearing and easy to get wrong:
--
-- 1. PAIRS ARE CANONICALISED (a < b). When two FND users play each other the
--    same game arrives twice, mirrored. Without folding to one orientation the
--    popular archetypes double-count against each other and the whole table
--    skews.
-- 2. ONE USER CANNOT DOMINATE A CELL. Each user contributes at most 5% of a
--    cell's games (§4), so a single prolific — or malicious — player cannot
--    move a published number.
-- 3. ONLY TRUSTED ACCOUNTS COUNT. trust >= 1 is set once an account has enough
--    history; throwaways contribute nothing.

create or replace function public.rebuild_matchup_rollup(window_days int default 30)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with eligible as (
    select m.*
    from public.shared_matches m
    join public.profiles p on p.id = m.user_id
    where m.ended_at >= now() - make_interval(days => window_days)
      and m.opp_archetype is not null
      and m.result in ('win', 'loss')
      and coalesce(m.opp_confidence, 1) >= 0.5
      and p.trust >= 1
  ),
  -- Fold each row onto the canonical (a, b) orientation.
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
  -- Cap any one user at 5% of the cell (minimum 1 game, so small cells work).
  --
  -- Wins are scaled PROPORTIONALLY, not clamped independently. Clamping both
  -- with least() inflates the result: a user on 10 games / 8 wins capped to 5
  -- games would keep all 5 capped wins and land at 100%, biasing the very cell
  -- the cap exists to protect. Scale to preserve their rate, then round.
  capped as (
    select p.format, p.best_of, p.a_archetype, p.b_archetype, p.user_id,
           least(p.games, greatest(1, (t.total * 0.05)::int)) as games,
           round(
             p.wins::numeric
             * least(p.games, greatest(1, (t.total * 0.05)::int))
             / nullif(p.games, 0)
           )::int as wins,
           least(p.on_play_games, greatest(1, (t.total * 0.05)::int)) as on_play_games,
           round(
             p.on_play_wins::numeric
             * least(p.on_play_games, greatest(1, (t.total * 0.05)::int))
             / nullif(p.on_play_games, 0)
           )::int as on_play_wins
    from per_user p
    join cell_totals t using (format, best_of, a_archetype, b_archetype)
  )
  insert into public.matchup_rollup as r
    (format, best_of, a_archetype, b_archetype,
     games, a_wins, a_on_play_games, a_on_play_wins, contributors, computed_at)
  select format, best_of, a_archetype, b_archetype,
         sum(games), sum(wins), sum(on_play_games), sum(on_play_wins),
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

  -- Drop cells that fell out of the window entirely.
  delete from public.matchup_rollup
  where computed_at < now() - interval '1 hour';
end;
$$;

revoke all on function public.rebuild_matchup_rollup(int) from public, anon, authenticated;

-- Promote accounts to trust=1 once they have real history (§4: 25 matches and
-- 7 days). Run alongside the rollup.
create or replace function public.refresh_trust()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles p
     set trust = 1
   where p.trust = 0
     and p.created_at < now() - interval '7 days'
     and (select count(*) from public.shared_matches m where m.user_id = p.id) >= 25;
$$;

revoke all on function public.refresh_trust() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Retention (§5) and scheduling. Run manually or via pg_cron:
--   select cron.schedule('fnd-rollup', '17 * * * *',
--     $$select public.refresh_trust(); select public.rebuild_matchup_rollup(30);$$);
--   select cron.schedule('fnd-prune', '30 4 * * *',
--     $$delete from public.shared_matches where ended_at < now() - interval '120 days'$$);
-- ---------------------------------------------------------------------------

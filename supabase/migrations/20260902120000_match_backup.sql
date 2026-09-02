-- Cross-device history restore — the download half of "syncing between machines".
--
-- WHY A SECOND MATCH TABLE. `shared_matches` looks like it should serve this and
-- cannot. It is a *contribution* table: an allowlisted, lossy projection built
-- for the crowd rollup. It accepts Standard and Pioneer only, drops the Arena
-- queue, the deck name and the per-game detail, and stores an irreversible hash
-- instead of the match id. Restoring a user's own history from it would silently
-- lose every Brawl, Limited, Historic and Alchemy game they ever played and
-- mislabel what survived. Widening it instead was rejected: the rollup reads
-- that table, and loosening its format check to serve a personal feature is how
-- the community numbers get polluted (see the 2026-08-27 cleanup).
--
-- So: two tables, two jobs. `shared_matches` is what the user gives the crowd.
-- `match_backup` is what the user gets back, and nothing aggregate reads it.
--
-- WHAT IS DELIBERATELY NOT HERE. `opponent_name`, `opponent_seen`,
-- `opponent_basics` and `opponent_platform` describe another player who
-- consented to nothing, and BACKEND-PHASE-2.md §0 commits to never uploading
-- them. That commitment holds here even though these rows are private to their
-- owner — "only the user can read it" is an access-control claim, not a consent
-- one, and the other player still did not agree. The practical cost is small and
-- named in the UI: restored matches show no opponent handle and no revealed
-- cards. Everything the user did themselves comes back.
--
-- `my_player_name` is also absent, for a duller reason: nothing in the app reads
-- it. Do not add a column for a field no surface renders.
--
-- `match_id` IS NOT ARENA'S MATCH ID. It is `sha256(user_id + ':' + arenaId)`,
-- the same digest `shared_matches.client_hash` uses. privacy.html §3 lists
-- Arena's raw match id under "never uploaded, under ANY setting — hashed before
-- it is used", and an unconditional claim does not get an exemption just
-- because these rows are private. Nothing needs the real id: the column only
-- has to be stable for one user and unique per match, and a salted digest is
-- both.
--
-- The consequence to remember when reading this table: a restored match carries
-- the digest as its `matchId` client-side, so the client hashes its LOCAL ids
-- before asking "do I already have this one?". Skipping that step is how every
-- machine would restore its own backup and double its history.
--
-- ⚠️ "Automatically expose new tables" is OFF on this project, so this table
-- starts with NO privileges for any Data API role, service_role included.
-- Without the explicit grants below an authenticated insert fails with 42501
-- and the error reads like a database fault rather than a config one.

create table if not exists public.match_backup (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles on delete cascade,
  -- sha256(user_id + ':' + arena match id). NOT the raw id — see the header.
  match_id       text not null,
  started_at     timestamptz not null,
  ended_at       timestamptz not null,
  -- The raw Arena queue ("Ladder", "Brawl_Ladder", "QuickDraft_…"). This is the
  -- column `shared_matches` refuses to store, and the reason a restore can tell
  -- a Brawl game from a Standard one instead of guessing.
  event_id       text not null,
  best_of        smallint not null default 1,
  -- Which seat was the user's. Per-game wins are derived from it, so a backup
  -- without it restores a match whose games all read as losses.
  my_team_id     int not null default 0,
  -- Full TrackedGame[]: winningTeamId, reason, onPlay, mulligans, firstLandTurn.
  -- Unlike the {onPlay, won} pairs in shared_matches, this round-trips.
  games          jsonb not null default '[]',
  -- 'unknown' is accepted on purpose. A disconnect mid-match is part of the
  -- user's real history; dropping it would make the restored match count
  -- disagree with the machine it came from, and that reads as data loss.
  result         text not null check (result in ('win', 'loss', 'draw', 'unknown')),
  result_reason  text,
  deck_name      text,
  deck_id        text,
  deck_hash      text,
  my_rank        text,
  season_ordinal int,
  -- Game-1 submitted lists as Arena grpIds. Duplicated from `decks` on purpose:
  -- that table is keyed by deck_hash and collapses every match played with a
  -- list into one row, so it cannot answer "what did this deck look like on the
  -- night I played this match". Version history needs the per-match snapshot.
  deck_main      jsonb,
  deck_side      jsonb,
  created_at     timestamptz not null default now(),
  -- Idempotent upload, exactly like shared_matches: re-sending is a no-op, so
  -- the client can retry freely and a reinstall cannot double-count.
  unique (user_id, match_id)
);

-- The restore reads "everything for this user, newest first" and nothing else.
create index if not exists match_backup_user_idx
  on public.match_backup (user_id, ended_at desc);

alter table public.match_backup enable row level security;
grant all on public.match_backup to service_role;
grant select, insert, update, delete on public.match_backup to authenticated;
revoke all on public.match_backup from anon;

-- `id` defaults from gen_random_uuid(), not a sequence, so unlike
-- shared_matches there is no sequence grant to remember here.

-- Own rows only, in every direction. There is no public read policy and there
-- must never be one: this table holds the unaggregated history the rest of the
-- schema goes out of its way not to expose.
drop policy if exists match_backup_own_select on public.match_backup;
create policy match_backup_own_select on public.match_backup
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists match_backup_own_insert on public.match_backup;
create policy match_backup_own_insert on public.match_backup
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists match_backup_own_update on public.match_backup;
create policy match_backup_own_update on public.match_backup
  for update to authenticated using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists match_backup_own_delete on public.match_backup;
create policy match_backup_own_delete on public.match_backup
  for delete to authenticated using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Insert ceiling
-- ---------------------------------------------------------------------------
--
-- Same reasoning as shared_matches_rate_limit (migration 20260812060000 §3):
-- the client caps its own batches, but the client is in a public repo and the
-- REST endpoint takes authenticated inserts directly, so the client cap is not
-- enforcement. The number is set to never touch a real backfill — this table
-- takes EVERY match, not just the constructed ones shared_matches accepts, so
-- a first sync here is strictly larger than a first sync there.
--
-- Keyed on `created_at`, which the server sets. `ended_at` is client-supplied
-- and therefore forgeable.

create index if not exists match_backup_user_created_idx
  on public.match_backup (user_id, created_at desc);

create or replace function public.match_backup_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent int;
begin
  select count(*) into recent
    from public.match_backup
   where user_id = new.user_id
     and created_at >= now() - interval '1 day';

  if recent >= 5000 then
    raise exception 'daily backup limit reached'
      using errcode = 'check_violation',
            hint = 'Backup resumes automatically within 24 hours.';
  end if;
  return new;
end;
$$;

drop trigger if exists match_backup_rate_limit_trg on public.match_backup;
create trigger match_backup_rate_limit_trg
  before insert on public.match_backup
  for each row execute function public.match_backup_rate_limit();

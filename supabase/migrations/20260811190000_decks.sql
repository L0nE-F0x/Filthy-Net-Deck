-- Phase 2 slice 7 — cloud deck sync. Design: docs/BACKEND-PHASE-2.md §2.
--
-- Decklists ride the SAME opt-in as matches (`profiles.cloud_enabled`); there
-- is deliberately no second toggle. They live here rather than on every match
-- row because a list is shared by every match played with it — normalisation,
-- not privacy.
--
-- ⚠️ "Automatically expose new tables" is OFF on this project, so this table
-- starts with NO privileges for any Data API role, service_role included.
-- Without the explicit grants below an authenticated insert fails with 42501
-- and the error reads like a database fault rather than a config one.

create table if not exists public.decks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles on delete cascade,
  -- The client's own list fingerprint (TrackedMatch.deckHash). It is the
  -- natural identity of a list: same 75 cards, same hash, across reinstalls
  -- and machines. Uploads upsert on it, which is what makes them idempotent.
  deck_hash   text not null,
  name        text not null,
  format      text not null check (format in ('standard', 'pioneer')),
  main        jsonb not null,                 -- arena grpIds, repeats = quantity
  side        jsonb not null default '[]',
  -- Reserved for a future "decks on your public profile" surface. Nothing
  -- reads it yet, and it defaults to private so shipping the column now cannot
  -- publish anything by itself.
  is_public   boolean not null default false,
  played_at   timestamptz,                    -- last match played with this list
  updated_at  timestamptz not null default now(),
  unique (user_id, deck_hash)
);

create index if not exists decks_user_idx on public.decks (user_id, played_at desc);

alter table public.decks enable row level security;
grant all on public.decks to service_role;
grant select, insert, update, delete on public.decks to authenticated;
revoke all on public.decks from anon;

-- `id` defaults from gen_random_uuid(), not a sequence, so unlike
-- shared_matches there is no sequence grant to remember here.

-- Own rows only, in every direction.
drop policy if exists decks_own_select on public.decks;
create policy decks_own_select on public.decks
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists decks_own_insert on public.decks;
create policy decks_own_insert on public.decks
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists decks_own_update on public.decks;
create policy decks_own_update on public.decks
  for update to authenticated using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists decks_own_delete on public.decks;
create policy decks_own_delete on public.decks
  for delete to authenticated using (auth.uid() = user_id);

-- There is no public read policy, not even for is_public rows. RLS is
-- row-level, not column-level, so a public policy here would expose user_id
-- and deck_hash alongside the list. When public decks ship, publish them the
-- way public_profiles does: a view over this table exposing only the columns
-- a stranger should see.

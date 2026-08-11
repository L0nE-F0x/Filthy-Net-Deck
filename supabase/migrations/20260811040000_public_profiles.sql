-- Phase 2 slice 4 — public profile pages at /u/<handle>.
-- Design: docs/BACKEND-PHASE-2.md §7 (build order), PLATFORM-STRATEGY.md §2.3
--
-- These are the acquisition-visible half of Phase 2: a page a player shares is
-- an SEO page, which drives installs, which feed the crowd data. Sync is
-- invisible to everyone except the one user who has it; a profile is visible to
-- everyone they know.
--
-- ⚠️ Grants are explicit on this project ("Automatically expose new tables" is
-- OFF). Every new object below states them.

-- ---------------------------------------------------------------------------
-- Handle + visibility
-- ---------------------------------------------------------------------------

create extension if not exists citext;

alter table public.profiles
  add column if not exists handle citext unique,
  add column if not exists profile_public boolean not null default false;

-- Reserve the shapes we never want a user to take: anything that could be
-- mistaken for a route, an official account, or an empty-looking name.
alter table public.profiles
  drop constraint if exists profiles_handle_shape;
alter table public.profiles
  add constraint profiles_handle_shape
  check (
    handle is null
    or (
      length(handle::text) between 3 and 24
      and handle::text ~ '^[a-z0-9][a-z0-9_-]{1,22}[a-z0-9]$'
      and handle::text not in (
        'admin','root','api','www','app','support','help','about','settings',
        'login','signin','signup','account','filthynetdeck','fnd','official',
        'staff','mod','moderator','system','null','undefined','u'
      )
    )
  );

-- ---------------------------------------------------------------------------
-- What the public can read
-- ---------------------------------------------------------------------------
--
-- RLS is ROW-level, not column-level: a select policy on `profiles` would
-- expose the whole row, including cloud_enabled and trust. So the public
-- surface is a VIEW over a locked-down table, exposing a curated column set.
-- The view runs with definer rights (the default), which is what lets it read
-- past RLS — hence the `where` clause is the real access control and must
-- stay.

create or replace view public.public_profiles as
select
  p.handle::text        as handle,
  p.display_name,
  p.created_at
from public.profiles p
where p.profile_public
  and p.handle is not null;

grant select on public.public_profiles to anon, authenticated;

-- Aggregates for the page. Only for profiles that opted into being public AND
-- into sharing — a public profile with sharing off simply has no stats, rather
-- than silently exposing matches the user never agreed to share.
create or replace view public.public_profile_stats as
select
  p.handle::text as handle,
  count(*)                                             as matches,
  count(*) filter (where m.result = 'win')             as wins,
  count(*) filter (where m.result = 'loss')            as losses,
  count(distinct m.my_archetype)                       as archetypes,
  min(m.ended_at)                                      as first_match,
  max(m.ended_at)                                      as last_match
from public.profiles p
join public.shared_matches m on m.user_id = p.id
where p.profile_public
  and p.handle is not null
  and p.cloud_enabled
group by p.handle;

grant select on public.public_profile_stats to anon, authenticated;

-- Per-archetype breakdown — the substance of the page, and what makes it worth
-- linking to. Same visibility gate.
create or replace view public.public_profile_archetypes as
select
  p.handle::text  as handle,
  m.my_archetype  as archetype,
  m.format,
  count(*)                                   as matches,
  count(*) filter (where m.result = 'win')   as wins,
  count(*) filter (where m.result = 'loss')  as losses
from public.profiles p
join public.shared_matches m on m.user_id = p.id
where p.profile_public
  and p.handle is not null
  and p.cloud_enabled
group by p.handle, m.my_archetype, m.format;

grant select on public.public_profile_archetypes to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Claiming a handle
-- ---------------------------------------------------------------------------
--
-- A function rather than a direct update so the uniqueness clash returns
-- something the UI can act on ("that one is taken") instead of a raw 23505,
-- and so a user can only ever set their OWN handle.

create or replace function public.claim_handle(new_handle text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  want citext := lower(trim(new_handle))::citext;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if exists (select 1 from public.profiles where handle = want and id <> auth.uid()) then
    raise exception 'handle taken' using errcode = 'unique_violation';
  end if;
  update public.profiles set handle = want where id = auth.uid();
  return want::text;
end;
$$;

revoke all on function public.claim_handle(text) from public, anon;
grant execute on function public.claim_handle(text) to authenticated;

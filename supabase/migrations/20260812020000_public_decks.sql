-- Public decks on profile pages.
--
-- `decks.is_public` shipped with slice 7 (20260811190000) and nothing read it.
-- This is the read side: a curated view, exactly like `public_profiles`.
--
-- ⚠️ RLS is ROW-level, not column-level. A public select policy on
-- `public.decks` would expose `user_id` and the client's `deck_hash` alongside
-- the list, so the public surface is a VIEW over the locked-down table with a
-- `where` clause doing the access control. Same shape, same reasoning, as
-- migration 20260811040000 — do not "simplify" it into a policy.
--
-- ⚠️ Grants are explicit on this project ("Automatically expose new tables" is
-- OFF), so the view states them.

-- ---------------------------------------------------------------------------
-- What the public can read
-- ---------------------------------------------------------------------------
--
-- THREE gates, all required, because publishing a decklist is a different
-- decision from publishing a profile:
--   1. the deck itself is marked public,
--   2. the profile is public and has a handle,
--   3. the user still has cloud sync on.
--
-- (3) matters: switching sharing off deletes the deck rows, but if that delete
-- ever fails or races, this view must not keep serving them.

create or replace view public.public_profile_decks as
select
  p.handle::text as handle,
  d.id           as deck_id,
  d.name,
  d.format,
  d.main,
  d.side,
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
-- Publishing one deck
-- ---------------------------------------------------------------------------
--
-- A function rather than a direct update so the app cannot accidentally
-- publish by writing a column, and so the "you need a handle first" case comes
-- back as something the UI can say out loud. `security definer` with an
-- explicit auth.uid() check: a user can only ever publish their own deck.

create or replace function public.set_deck_public(deck_hash_in text, make_public boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated int;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if make_public and not exists (
    select 1 from public.profiles
    where id = auth.uid() and handle is not null and profile_public
  ) then
    -- Publishing a deck to a profile page nobody can open is a dead end; say so.
    raise exception 'profile is not public' using errcode = 'check_violation';
  end if;

  update public.decks
     set is_public = make_public,
         updated_at = now()
   where user_id = auth.uid()
     and deck_hash = deck_hash_in;

  get diagnostics updated = row_count;
  return updated > 0;
end;
$$;

revoke all on function public.set_deck_public(text, boolean) from public, anon;
grant execute on function public.set_deck_public(text, boolean) to authenticated;

-- Turning the profile private must not leave decks reachable by any later
-- change of view definition — belt and braces alongside the view's own gate.
create or replace function public.unpublish_decks_when_profile_private()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.profile_public is false and old.profile_public is true)
     or (new.cloud_enabled is false and old.cloud_enabled is true) then
    update public.decks set is_public = false where user_id = new.id and is_public;
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_visibility_change on public.profiles;
create trigger on_profile_visibility_change
  after update of profile_public, cloud_enabled on public.profiles
  for each row execute function public.unpublish_decks_when_profile_private();

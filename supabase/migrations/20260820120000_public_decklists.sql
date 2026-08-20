-- Copyable decklists on the public profile page (v3.1.8).
--
-- WHY THIS REVERSES PART OF 20260812060000
-- That migration stripped `main`/`side` out of `public_profile_decks` because
-- the *arena card ids* of every published deck were readable off the anon REST
-- API while the product said they were not. That reasoning still stands and the
-- ids stay private — this view still does not expose `d.main` or `d.side`.
--
-- What changes is that a player can now deliberately publish a **human-readable
-- decklist** so a viewer can copy it into Arena. That is the whole point of the
-- profile page as a share target: a link in a YouTube description that replaces
-- a third-party deck host.
--
-- THE ID→NAME PROBLEM, AND WHY THE TEXT IS STORED RATHER THAN RENDERED
-- The server has no arena-id→name map. `meta/arena-names.json` is only the gap
-- map for sets Scryfall has not indexed yet, and `meta/sets/*.json` carries no
-- arena ids at all. Resolving 75 ids per request through Scryfall would be slow
-- and rude to a public API — 20260812060000 said as much.
--
-- The client already has the names: `src/services/arenaCards.ts` resolves and
-- caches them. So the client renders the list once, at publish time, and
-- uploads the finished text. The page then costs one row read.
--
-- CONSENT
-- `public_list` is null for every deck published before this shipped, and only
-- an explicit publish action from a v3.1.8+ client can fill it. Nobody's list
-- appears because this migration ran. Taking a deck down clears it, and so does
-- turning the profile private.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.decks
  add column if not exists public_list text,
  -- Assigned on first publish and never reissued, so a link already pasted into
  -- a video description keeps working after the deck is renamed.
  add column if not exists public_slug text,
  add column if not exists public_id   text;

-- Slug is scoped to the owner (`/u/<handle>/<slug>`), so per-user uniqueness is
-- all that is needed. `public_id` backs `/d/<id>` and has no handle to scope it.
create unique index if not exists decks_public_slug_idx
  on public.decks (user_id, public_slug) where public_slug is not null;
create unique index if not exists decks_public_id_idx
  on public.decks (public_id) where public_id is not null;

-- ---------------------------------------------------------------------------
-- Slug helper
-- ---------------------------------------------------------------------------
--
-- Kept in sync with `deckSlug()` in src/services/arenaExport.ts. Duplicated for
-- the same reason `label()` is duplicated into the Netlify function: the app
-- cannot reach into the database and vice versa. If you edit one, edit the
-- other — a mismatch means the app shows a link the site does not serve.

create or replace function public.deck_slugify(raw text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(
      btrim(
        left(
          btrim(regexp_replace(lower(coalesce(raw, '')), '[^a-z0-9]+', '-', 'g'), '-'),
          48
        ),
        '-'
      ),
      ''
    ),
    'deck'
  );
$$;

-- ---------------------------------------------------------------------------
-- Publishing
-- ---------------------------------------------------------------------------
--
-- Gains a third argument. It DEFAULTS to null so a v3.1.7 client — which calls
-- with two named arguments and checks `data === true` — keeps working exactly as
-- it did: the deck goes public without a list. Do not change the return type for
-- the same reason.

drop function if exists public.set_deck_public(text, boolean);

create function public.set_deck_public(
  deck_hash_in text,
  make_public  boolean,
  list_in      text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target     public.decks%rowtype;
  base_slug  text;
  try_slug   text;
  suffix     int := 1;
  new_id     text;
  clean_list text;
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

  select * into target
    from public.decks
   where user_id = auth.uid()
     and deck_hash = deck_hash_in;

  if not found then
    return false;
  end if;

  if not make_public then
    -- Taking a deck down removes the published list, always. The slug and the
    -- id survive so re-publishing restores the same URL.
    update public.decks
       set is_public   = false,
           public_list = null,
           updated_at  = now()
     where id = target.id;
    return true;
  end if;

  if target.public_slug is null then
    base_slug := public.deck_slugify(target.name);
    try_slug  := base_slug;
    while exists (
      select 1 from public.decks
       where user_id = auth.uid()
         and public_slug = try_slug
         and id <> target.id
    ) loop
      suffix   := suffix + 1;
      try_slug := base_slug || '-' || suffix;
    end loop;
  else
    try_slug := target.public_slug;
  end if;

  if target.public_id is null then
    -- Derived from the row's own uuid rather than pgcrypto: `gen_random_bytes`
    -- lives in the `extensions` schema on Supabase and this function pins
    -- `search_path = public`, so calling it here would fail at runtime.
    new_id := left(replace(target.id::text, '-', ''), 10);
    while exists (
      select 1 from public.decks where public_id = new_id and id <> target.id
    ) and length(new_id) < 32 loop
      new_id := left(replace(target.id::text, '-', ''), length(new_id) + 2);
    end loop;
  else
    new_id := target.public_id;
  end if;

  clean_list := nullif(btrim(coalesce(list_in, '')), '');
  -- A 75-card list is ~1.5 KB. The ceiling is a cheap bound on a forged upload,
  -- not a real limit anyone can reach by playing Magic.
  if clean_list is not null and length(clean_list) > 8000 then
    raise exception 'decklist too long' using errcode = 'check_violation';
  end if;

  update public.decks
     set is_public   = true,
         public_slug = try_slug,
         public_id   = new_id,
         public_list = clean_list,
         updated_at  = now()
   where id = target.id;

  return true;
end;
$$;

revoke all on function public.set_deck_public(text, boolean, text) from public, anon;
grant execute on function public.set_deck_public(text, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- What the public can read
-- ---------------------------------------------------------------------------
--
-- Same three gates as before (deck public, profile public + handled, cloud on).
-- `d.main` / `d.side` stay out of the view: the arena ids are still nobody's
-- business, and the counts are what the profile page renders.

drop view if exists public.public_profile_decks;

create view public.public_profile_decks as
select
  p.handle::text                          as handle,
  d.id                                    as deck_id,
  d.public_id,
  d.public_slug                           as slug,
  d.name,
  d.format,
  coalesce(jsonb_array_length(d.main), 0) as main_count,
  coalesce(jsonb_array_length(d.side), 0) as side_count,
  d.public_list                           as list,
  -- So the profile page can badge "has a list" without dragging 12 decklists
  -- across the wire to test 12 booleans. That is the same mistake 20260812060000
  -- found — a caller selecting the payload to compute a property of it.
  (d.public_list is not null)             as has_list,
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
-- Going private takes the lists with it
-- ---------------------------------------------------------------------------
--
-- The 20260812020000 trigger already unpublished the decks. Now it must also
-- drop the stored text — an unpublished row is invisible to the view either
-- way, but leaving a published list sitting in a column after the user said
-- "make me private" is not what they asked for.

create or replace function public.unpublish_decks_when_profile_private()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.profile_public is false and old.profile_public is true)
     or (new.cloud_enabled is false and old.cloud_enabled is true) then
    update public.decks
       set is_public = false, public_list = null
     where user_id = new.id
       and (is_public or public_list is not null);
  end if;
  return new;
end;
$$;

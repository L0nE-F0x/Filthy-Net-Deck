-- Stop public profiles defaulting to the user's real name.
--
-- `handle_new_user` seeded display_name from the identity provider's
-- full_name. For Google that is the user's LEGAL NAME, so the first real
-- profile page rendered "Amedeo Ilotte" in its <h1>, <title>, description and
-- social card — for someone who had deliberately chosen the pseudonym
-- `l0ne-f0x`. Picking a handle IS the statement of how you want to be known;
-- defaulting over it was wrong, and nobody should have to notice a leak to
-- avoid it.
--
-- After this: display_name is null unless the user sets one on purpose, and the
-- public page falls back to the handle.

-- 1. Stop seeding it from provider metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- display_name is deliberately NOT populated. The public profile falls back
  -- to the handle, which the user chose. See 20260811060000.
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 2. Clear names already collected. These were never set deliberately by
--    anyone — they came from the provider — so removing them takes nothing the
--    user chose to publish.
update public.profiles set display_name = null where display_name is not null;

comment on column public.profiles.display_name is
  'Optional, user-set only. Never seeded from an identity provider: for Google '
  'that is the user''s legal name, and the public profile page would publish it.';

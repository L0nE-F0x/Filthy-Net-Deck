-- Phase 5 — light social. Friend codes, stat-line comparison, seasonal race.
-- Design: docs/PLATFORM-STRATEGY.md §1.5 and "Phase 5 — Light social".
--
-- **Still no chat.** Discord is the chat. Nothing here carries free text
-- between users; a friendship is two ids and a timestamp.
--
-- ⚠️ Grants are explicit on this project ("Automatically expose new tables" is
-- OFF), so every object below states them. Without that an authenticated
-- insert fails with 42501 and the message points at the database rather than
-- the config.

-- ---------------------------------------------------------------------------
-- The code you share
-- ---------------------------------------------------------------------------
--
-- Deliberately NOT the handle. A handle is a public identity with a page at
-- /u/<handle>; a friend code is a private token you hand to someone you
-- actually know, and can regenerate if you post it somewhere you regret.

alter table public.profiles
  add column if not exists friend_code text unique;

alter table public.profiles
  drop constraint if exists profiles_friend_code_shape;
alter table public.profiles
  add constraint profiles_friend_code_shape
  -- Exactly the alphabet generate_friend_code() uses: no I, L, O, 0 or 1.
  check (friend_code is null or friend_code ~ '^[A-HJKMNP-Z2-9]{8}$');

-- Crockford-ish alphabet: no I, L, O, 0 or 1, because these get read aloud and
-- typed by hand from a Discord message.
create or replace function public.generate_friend_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
  i int;
begin
  loop
    candidate := '';
    for i in 1..8 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where friend_code = candidate);
  end loop;
  return candidate;
end;
$$;

revoke all on function public.generate_friend_code() from public, anon, authenticated;

/**
 * Your code, generating one on first use. Also the way to roll it: passing
 * true issues a new code, which immediately invalidates the old one for anyone
 * who has not already added you.
 */
create or replace function public.my_friend_code(regenerate boolean default false)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  code text;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  select friend_code into code from public.profiles where id = auth.uid();
  if code is null or regenerate then
    code := public.generate_friend_code();
    update public.profiles set friend_code = code where id = auth.uid();
  end if;
  return code;
end;
$$;

revoke all on function public.my_friend_code(boolean) from public, anon;
grant execute on function public.my_friend_code(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Friendships
-- ---------------------------------------------------------------------------
--
-- Stored once per pair, canonically ordered (a < b), so a friendship cannot
-- exist in one direction only and there is nothing to keep in sync. Handing
-- someone your code IS the consent — there is no request/accept dance, which
-- is the "light" in light social.

create table if not exists public.friendships (
  a          uuid not null references public.profiles on delete cascade,
  b          uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (a, b),
  constraint friendships_ordered check (a < b)
);

create index if not exists friendships_b_idx on public.friendships (b);

alter table public.friendships enable row level security;
grant all on public.friendships to service_role;
grant select, delete on public.friendships to authenticated;
revoke all on public.friendships from anon;

-- Read and remove your own edges. Inserts go through add_friend_by_code only,
-- so nobody can befriend a stranger by guessing a uuid.
drop policy if exists friendships_own_select on public.friendships;
create policy friendships_own_select on public.friendships
  for select to authenticated using (auth.uid() = a or auth.uid() = b);
drop policy if exists friendships_own_delete on public.friendships;
create policy friendships_own_delete on public.friendships
  for delete to authenticated using (auth.uid() = a or auth.uid() = b);

create or replace function public.add_friend_by_code(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  select id into target from public.profiles
   where friend_code = upper(trim(code));
  if target is null then
    raise exception 'no such code' using errcode = 'no_data_found';
  end if;
  if target = me then
    raise exception 'that is your own code' using errcode = 'check_violation';
  end if;
  insert into public.friendships (a, b)
  values (least(me, target), greatest(me, target))
  on conflict do nothing;
  return target;
end;
$$;

revoke all on function public.add_friend_by_code(text) from public, anon;
grant execute on function public.add_friend_by_code(text) to authenticated;

create or replace function public.remove_friend(friend uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  removed int;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from public.friendships
   where a = least(auth.uid(), friend) and b = greatest(auth.uid(), friend)
     and (a = auth.uid() or b = auth.uid());
  get diagnostics removed = row_count;
  return removed > 0;
end;
$$;

revoke all on function public.remove_friend(uuid) from public, anon;
grant execute on function public.remove_friend(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The stat line you compare
-- ---------------------------------------------------------------------------
--
-- A function, not a view, because the honest version needs a season argument.
-- `security definer` reads past RLS, so the `friendships` join IS the access
-- control: it returns rows only for people who exchanged codes with the
-- caller, plus the caller.
--
-- A friend who has not turned sharing on has no matches here, and appears with
-- zeroes rather than being hidden — "they have not shared anything" is a more
-- honest answer than pretending they are not your friend.

create or replace function public.friend_lines(season int default null)
returns table (
  user_id      uuid,
  display_name text,
  handle       text,
  is_me        boolean,
  matches      bigint,
  wins         bigint,
  losses       bigint,
  best_rank    text,
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
    -- Highest rank REACHED, not current: this is a race, and what people
    -- actually compare is how far up they got.
    (array_agg(m.rank order by m.ended_at desc) filter (where m.rank is not null))[1],
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

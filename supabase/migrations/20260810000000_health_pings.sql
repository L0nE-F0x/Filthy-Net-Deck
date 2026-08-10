-- Phase 2 slice 0 — opt-in parser-health ping.
-- Design: docs/BACKEND-PHASE-2.md §7.1
--
-- Written only by the `health-ping` Edge Function using the service-role key,
-- which bypasses RLS. There are deliberately NO policies: RLS is enabled and
-- nothing else can read or write this table.

create table if not exists public.health_pings (
  install_id       uuid        not null,
  day              date        not null,
  app_version      text        not null,
  parser_version   text,
  os               text,
  log_found        boolean,
  detailed_logs    boolean,
  parse_errors     int         not null default 0,
  matches_last_24h int,
  updated_at       timestamptz not null default now(),
  -- At most one row per install per day: caps volume by construction, makes
  -- retries free, and makes DAU a plain count.
  primary key (install_id, day)
);

-- The two queries this table exists to answer.
create index if not exists health_pings_day_version_idx
  on public.health_pings (day, app_version);
create index if not exists health_pings_day_errors_idx
  on public.health_pings (day) where parse_errors > 0;

alter table public.health_pings enable row level security;

-- Grants must be explicit on this project: "Automatically expose new tables" is
-- OFF, so a new table starts with NO privileges for the Data API roles —
-- including `service_role`, which the Edge Function uses. Without this the
-- function's write fails with 42501 (insufficient_privilege) even though its
-- key is correct, which reads like a database fault rather than a config one.
-- Every future table needs the same two lines.
grant all on public.health_pings to service_role;
revoke all on public.health_pings from anon, authenticated;

comment on table public.health_pings is
  'Opt-in health telemetry. One row per install per day. Service-role writes only.';

-- ---------------------------------------------------------------------------
-- Read helpers (run manually; not exposed to the client)
-- ---------------------------------------------------------------------------

-- Daily actives + parser health, last 30 days.
--   select * from public.health_daily order by day desc;
create or replace view public.health_daily as
select
  day,
  count(*)                                             as installs,
  count(*) filter (where parse_errors > 0)             as installs_with_parse_errors,
  round(
    100.0 * count(*) filter (where parse_errors > 0) / nullif(count(*), 0)
  , 1)                                                 as pct_with_parse_errors,
  count(*) filter (where not log_found)                as installs_no_log,
  sum(matches_last_24h)                                as matches_recorded,
  count(*) filter (where matches_last_24h = 0)         as installs_recording_nothing
from public.health_pings
group by day;

comment on view public.health_daily is
  'The parser-break alarm. A jump in pct_with_parse_errors or in '
  'installs_recording_nothing means an Arena update likely changed the log format.';

-- Version spread, so a bad release is visible.
create or replace view public.health_versions as
select day, app_version, parser_version, count(*) as installs
from public.health_pings
group by day, app_version, parser_version;

-- ---------------------------------------------------------------------------
-- Retention: 180 days (docs/BACKEND-PHASE-2.md §7.1). Schedule with pg_cron:
--   select cron.schedule('health-prune', '0 4 * * *',
--     $$delete from public.health_pings where day < current_date - 180$$);
-- ---------------------------------------------------------------------------

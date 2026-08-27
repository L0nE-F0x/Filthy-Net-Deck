-- Clean up matches uploaded under the wrong format (the `"ladder"` bug).
--
-- ⚠️ NOT A MIGRATION. Deliberately not in `supabase/migrations/`: this is a data
-- repair whose correct moment depends on clients having updated and re-synced,
-- which no migration runner can know. Run it by hand, in order, reading the
-- counts as you go.
--
-- ---------------------------------------------------------------------------
-- WHAT HAPPENED
-- ---------------------------------------------------------------------------
-- `sync.ts formatFor` resolved a match's format with `id.includes("ladder")`.
-- `Historic_Ladder` contains "ladder"; so do `Alchemy_Ladder` and
-- `Timeless_Ladder`, and `Brawl` fell through to the featured format. Every one
-- of those uploaded into `shared_matches` as **standard**.
--
-- Fixed client-side: `metaFormatOf` returns null for any uncovered queue and
-- `buildSharedMatch` drops the row, so no new bad rows can arrive from an
-- updated client.
--
-- ---------------------------------------------------------------------------
-- HOW BAD IS IT, ACTUALLY — read this before deciding to run anything
-- ---------------------------------------------------------------------------
-- 1. `rebuild_matchup_rollup(window_days => 30)` only reads matches from the
--    last 30 days, and it DELETEs and rewrites the whole rollup each run. So
--    once updated clients stop sending bad rows, the published numbers clean
--    themselves within 30 days with no action at all.
-- 2. The rollup is further gated by trust >= 1, a 5% per-user cap per cell, and
--    the app's own MIN_GAMES floor — and per `docs/WEB-PLATFORM.md` gate G2 has
--    not tripped, so none of this is on the public site yet.
--
-- Which means: the raw rows are wrong, the published output largely is not, and
-- there is no emergency. The reason to run the DELETE is that `shared_matches`
-- should not hold rows claiming a format that never happened.
--
-- ---------------------------------------------------------------------------
-- WHAT CANNOT BE DONE
-- ---------------------------------------------------------------------------
-- `shared_matches` does not store the Arena queue id — by design, it is not in
-- the upload allowlist. So a row cannot say for itself whether it was Historic.
-- The only handle is `my_deck_hash` joined to `decks`, which since migration
-- 20260827120000 carries the true format. That identifies a bad match ONLY when
-- the same user also backed up that deck. Matches whose deck was never synced
-- are unreachable and stay as they are — stated plainly rather than papered
-- over with a heuristic.
--
-- ---------------------------------------------------------------------------
-- WHEN TO RUN
-- ---------------------------------------------------------------------------
-- After the release ships AND users have opened the app at least once, so their
-- decks have re-synced under true formats. `deckSyncFingerprint` includes
-- `format`, so that re-upsert happens by itself on the first launch. Give it a
-- week or two; the query is idempotent and safe to repeat.

-- ---------------------------------------------------------------------------
-- STEP 1 — diagnose. Read-only. Run this first and look at the numbers.
-- ---------------------------------------------------------------------------
select
  d.format                                             as real_format,
  m.format                                             as uploaded_as,
  count(*)                                             as rows_affected,
  count(*) filter (where m.ended_at >= now() - interval '30 days')
                                                       as still_in_rollup_window,
  count(distinct m.user_id)                            as users
from public.shared_matches m
join public.decks d
  on d.user_id = m.user_id
 and d.deck_hash = m.my_deck_hash
where d.format not in ('standard', 'pioneer')
group by 1, 2
order by rows_affected desc;

-- Expect `real_format` to be historic / alchemy / timeless / brawl and
-- `uploaded_as` to be standard. If `still_in_rollup_window` is 0, the published
-- rollup is already clean and step 3 is optional tidying.


-- ---------------------------------------------------------------------------
-- STEP 2 — delete the identifiable bad rows.
-- ---------------------------------------------------------------------------
-- Scoped by the same join as the diagnostic, so it removes exactly the rows
-- step 1 counted and nothing else. It cannot touch a genuine Standard or
-- Pioneer match: those decks' rows do not satisfy the `not in` predicate.
--
-- These matches will NOT come back. An updated client rejects them before
-- upload, and the `bbi.cloud.uploadedThrough` watermark has long since passed
-- them — both of which is the intended end state.

-- begin;   -- uncomment to review the count before committing

delete from public.shared_matches m
using public.decks d
where d.user_id = m.user_id
  and d.deck_hash = m.my_deck_hash
  and d.format not in ('standard', 'pioneer');

-- commit;


-- ---------------------------------------------------------------------------
-- STEP 3 — rebuild the published numbers.
-- ---------------------------------------------------------------------------
-- The rollup is a full DELETE-and-rewrite, so this republishes from whatever
-- `shared_matches` now holds. Skip only if step 1 showed
-- `still_in_rollup_window = 0`.

select public.rebuild_matchup_rollup(30);


-- ---------------------------------------------------------------------------
-- STEP 4 — confirm nothing uncovered survives in the window.
-- ---------------------------------------------------------------------------
select count(*) as remaining_identifiable_bad_rows
from public.shared_matches m
join public.decks d
  on d.user_id = m.user_id
 and d.deck_hash = m.my_deck_hash
where d.format not in ('standard', 'pioneer');
-- Expect 0.

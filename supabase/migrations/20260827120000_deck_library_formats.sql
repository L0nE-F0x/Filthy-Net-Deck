-- Deck library: file a deck under the format it was actually played in.
--
-- Slice 7 (20260811190000) constrained `decks.format` to ('standard','pioneer')
-- because those are the two formats the app ships a metagame for. That was the
-- wrong question to ask of a decklist, and the client-side resolver made it
-- worse:
--
--     if (id.includes("standard") || id.includes("ladder")) return "standard";
--
-- `Historic_Ladder` contains "ladder". `Alchemy_Ladder` and `Timeless_Ladder`
-- did too, and `Brawl` fell through to the featured format. So every deck from
-- every constructed queue arrived here labelled **standard**, and a Historic
-- deck published to /u/<handle>/<slug> rendered a "standard" chip.
--
-- ⚠️ This widens the DECK LIBRARY only. `shared_matches.format` is untouched and
-- stays ('standard','pioneer'): crowd matchup aggregates are joined on
-- archetype slugs that only exist for the covered formats, and a Historic game
-- counted in a Standard cell is exactly the noise the honest-aggregates rule
-- forbids. The client now rejects those matches outright rather than relabelling
-- them (`sync.ts formatFor` → `metaFormatOf`).
--
-- Deliberately NOT added: 'limited'. A draft deck is a sealed pool that no
-- longer exists, so an archived Arena import of one would list cards the user
-- does not own. And no 'unknown': the whole point of this change is to stop
-- writing a format nobody verified.
--
-- Existing mislabelled rows heal themselves. `deckSyncFingerprint` includes
-- `format`, so the first sync after this ships sees a changed fingerprint and
-- re-upserts the library on (user_id, deck_hash) with the true labels.

-- Drop by *definition*, not by name. The old constraint was declared inline on
-- the column, so Postgres named it — `decks_format_check` on a clean create,
-- but a suffixed name if the table was ever rebuilt. Adding the new constraint
-- while an unrecognised old one survived would leave both in force and reject
-- 'historic' anyway, with nothing in this file to explain why.
do $$
declare
  c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
     where nsp.nspname = 'public'
       and rel.relname = 'decks'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%format%'
  loop
    execute format('alter table public.decks drop constraint %I', c.conname);
  end loop;
end
$$;

alter table public.decks
  add constraint decks_format_check
  check (format in ('standard', 'pioneer', 'historic', 'alchemy', 'timeless', 'brawl'));

-- `public_profile_decks` selects `d.format` straight through and has no format
-- predicate of its own, so published Historic/Brawl decks render their real
-- format with no view change. Re-stated here only so the next reader does not
-- go looking for a missing half of this migration.

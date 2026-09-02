/**
 * The thing that actually triggers an upload.
 *
 * Kept separate from `sync.ts` so the upload logic stays pure and testable
 * while this side owns the messy parts: pulling live state out of the store,
 * resolving Arena card ids to names, and building the inference candidate set.
 *
 * Every path is a no-op unless the user is signed in *and* opted in — checked
 * inside `uploadNewMatches`, not here, so there is exactly one gate.
 */

import { useAppStore } from "../../store/useAppStore";
import { inferenceCandidatesFromBundle } from "../deckHelpers";
import { inferOpponentArchetype } from "../opponentArchetype";
import { peekSeenCard, resolveArenaMetaBatch } from "../arenaMeta";
import { getOpponentNote } from "../matchupNotes";
import { MIN_INFER_CONFIDENCE } from "./personalMatchups";
import {
  backupMatches,
  fetchBackupMatches,
  fetchCloudDecks,
  uploadDecks,
  uploadNewMatches,
  type UploadOutcome,
} from "./sync";
import type { CloudDeck } from "./deckSync";
import type { TrackedMatch } from "../../types/tracker";

/**
 * Upload whatever is new. Safe to call on launch and after each match — the
 * watermark and the in-flight guard in `sync.ts` make repeats cheap.
 *
 * Never throws: a backend problem must not surface in the app, and the next
 * trigger simply retries.
 */
export async function syncMatchesNow(): Promise<UploadOutcome> {
  const empty = { attempted: 0, uploaded: 0, skipped: 0 };
  try {
    const state = useAppStore.getState();
    // `trackerLocal`, not `trackerMatches`: you contribute what this machine
    // played. Re-uploading a restored match would be wrong twice over — it was
    // already sent by the machine that played it, and the restored copy has no
    // `opponentSeen`, so inference would produce `opp_archetype: null` and the
    // row would be strictly worse than the one already there. Backing it up
    // again is likewise a no-op it does not need to discover at runtime.
    const matches = state.trackerLocal;
    if (!matches.length) return empty;

    const meta = state.meta;

    // Resolve the cards the opponents revealed so inference has names to work
    // with. Bounded to what we might upload; the cache makes repeats free.
    const ids = new Set<number>();
    for (const m of matches) {
      for (const id of m.opponentSeen ?? []) ids.add(id);
    }
    if (ids.size) await resolveArenaMetaBatch([...ids]);

    // Candidates differ by Bo1/Bo3, and a match knows its own. Build both once
    // rather than per match — this is the expensive part.
    const bo1 = inferenceCandidatesFromBundle(meta, "bo1");
    const bo3 = inferenceCandidatesFromBundle(meta, "bo3");

    const oppArchetypeFor = (m: TrackedMatch) => {
      // A manual tag is the user's own label and beats a guess, exactly as on
      // the Matchups page — the two must agree or the personal and community
      // numbers would be keyed differently.
      const manual = getOpponentNote(m.opponentName)?.tag?.trim();
      if (manual) return { name: manual, confidence: 1 };

      if (!m.opponentSeen?.length) return { name: null, confidence: null };
      const candidates = (m.bestOf ?? 1) >= 3 ? bo3 : bo1;
      if (!candidates.length) return { name: null, confidence: null };
      const guess = inferOpponentArchetype(
        m.opponentSeen,
        (id) => peekSeenCard(id),
        candidates,
        {
          minConfidence: MIN_INFER_CONFIDENCE,
          basicLandTypes: m.opponentBasics,
        },
      );
      return guess
        ? { name: guess.archetype, confidence: guess.confidence }
        : { name: null, confidence: null };
    };

    const outcome = await uploadNewMatches({
      matches,
      meta,
      decks: [...bo1, ...bo3],
      oppArchetypeFor,
    });

    // Decklists ride the same opt-in and the same trigger. Deliberately after
    // the matches — matches feed the crowd data everyone shares, decks are the
    // user's own backup, so if only one of the two gets through it should be
    // the one other people are waiting on. Its own guards make it cheap when
    // the library has not changed.
    void uploadDecks({ matches, meta, decks: [...bo1, ...bo3] });

    // The history backup, same opt-in again. Takes the raw list rather than
    // anything inferred above: it stores what the tracker recorded, so none of
    // the archetype work applies to it. Fire-and-forget for the same reason as
    // decks — a machine that fails to back up still gets its own matches into
    // the crowd rollup, which is the part other people are waiting on.
    void backupMatches({ matches });

    return outcome;
  } catch {
    return empty;
  }
}

/**
 * Deck lists the user has backed up, newest first. Empty unless signed in and
 * opted in — the same single gate as everything else here.
 */
export async function cloudDecksNow(): Promise<CloudDeck[]> {
  try {
    return await fetchCloudDecks();
  } catch {
    return [];
  }
}

/**
 * The account's backed-up history, for merging into whatever this machine
 * parsed locally.
 *
 * Returns the cloud's copy raw — the merge itself lives in `backupSync` so it
 * can be tested without a network, and the store owns when to apply it. Empty
 * for signed out, opted out, offline, or a first machine with nothing to
 * restore, all of which are ordinary.
 */
export async function restoreMatchesNow(): Promise<TrackedMatch[]> {
  try {
    return await fetchBackupMatches();
  } catch {
    return [];
  }
}

// `formatForMatch` used to live here — `formatIdForEvent(m.eventId) ?? "standard"`,
// the same line that put Historic games in Standard's matchup cells. It had no
// importers left, so it is deleted rather than repaired: a dead export that
// still encodes the wrong rule is a trap for whoever reaches for it next.
// Live callers use `services/arenaFormat`: `metaFormatOf` for anything that
// joins crowd data, `localFormatOf` for a local page scoped to one format.

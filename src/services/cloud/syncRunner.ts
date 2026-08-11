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
import { inferenceCandidatesFromBundle, formatIdForEvent } from "../deckHelpers";
import { inferOpponentArchetype } from "../opponentArchetype";
import { peekSeenCard, resolveArenaMetaBatch } from "../arenaMeta";
import { getOpponentNote } from "../matchupNotes";
import { MIN_INFER_CONFIDENCE } from "./personalMatchups";
import { uploadNewMatches, type UploadOutcome } from "./sync";
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
    const matches = state.trackerMatches;
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

    return await uploadNewMatches({
      matches,
      meta,
      decks: [...bo1, ...bo3],
      oppArchetypeFor,
    });
  } catch {
    return empty;
  }
}

/** Format for a match, shared with the Matchups page's view of the same data. */
export function formatForMatch(m: TrackedMatch) {
  return formatIdForEvent(m.eventId) ?? "standard";
}

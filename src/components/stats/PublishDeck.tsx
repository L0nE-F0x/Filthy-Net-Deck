/**
 * Publish one deck to the player's public profile page.
 *
 * Deliberately quiet: the control only appears once the deck has actually been
 * backed up to the cloud, because publishing a list the server does not have
 * would fail with nothing useful to say. Everyone else — signed out, sharing
 * off, or synced-but-not-yet-uploaded — sees nothing at all rather than a
 * disabled button advertising a feature they have not opted into.
 */

import { useEffect, useState } from "react";
import { useAppStore } from "../../store/useAppStore";

export function PublishDeck({ deckHash }: { deckHash: string | undefined }) {
  const authName = useAppStore((s) => s.authName);
  const [known, setKnown] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!authName || !deckHash) {
      setKnown(false);
      return;
    }
    let cancelled = false;
    void import("../../services/cloud/syncRunner")
      .then((m) => m.cloudDecksNow())
      .then((decks) => {
        if (cancelled) return;
        const mine = decks.find((d) => d.deckHash === deckHash);
        setKnown(Boolean(mine));
        setIsPublic(Boolean(mine?.isPublic));
      })
      .catch(() => {
        /* leave the control hidden — never guess at published state */
      });
    return () => {
      cancelled = true;
    };
  }, [authName, deckHash]);

  if (!authName || !deckHash || !known) return null;

  const toggle = async (on: boolean) => {
    setBusy(true);
    setMsg(null);
    // Optimistic, then reconciled: the server is the authority on whether the
    // row actually changed (it returns false when the deck is not there).
    setIsPublic(on);
    try {
      const m = await import("../../services/cloud/sync");
      const ok = await m.setDeckPublic(deckHash, on);
      if (!ok) {
        setIsPublic(!on);
        setMsg("That deck isn't backed up yet — play a match with it and try again.");
      } else {
        const cache = await import("../../services/cloud/useCloudDecks");
        cache.clearCloudDeckCache();
      }
    } catch (e) {
      setIsPublic(!on);
      setMsg(e instanceof Error ? e.message : "Could not update that.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        className={`btn btn-sm ${isPublic ? "" : "btn-ghost"}`}
        disabled={busy}
        title={
          isPublic
            ? "Showing on your public profile page. Click to take it down."
            : "Show this deck on your public profile page — name, format and size only, never your match history."
        }
        onClick={() => void toggle(!isPublic)}
      >
        {isPublic ? "On your profile" : "Show on profile"}
      </button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </span>
  );
}

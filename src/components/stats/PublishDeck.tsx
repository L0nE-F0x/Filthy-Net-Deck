/**
 * Publish one deck to the player's public profile page.
 *
 * Deliberately quiet: the control only appears once the deck has actually been
 * backed up to the cloud, because publishing a list the server does not have
 * would fail with nothing useful to say. Everyone else — signed out, sharing
 * off, or synced-but-not-yet-uploaded — sees nothing at all rather than a
 * disabled button advertising a feature they have not opted into.
 *
 * Since v3.1.8 publishing also uploads the **decklist as Arena import text**, so
 * a viewer can copy it off the page and play it. That text has to be built
 * here: the server stores arena card ids and has no id→name map, so it cannot
 * render a list of its own (migration 20260820120000). Which means publishing
 * now has a failure mode worth saying out loud — if Scryfall has not resolved
 * every id yet, the list would read `4 Card 103529`, so this refuses rather
 * than publishing something nobody can import.
 */

import { useEffect, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { toArenaDecklist } from "../../services/arenaExport";
import { copyToClipboard } from "../../services/arenaImport";
import { SITE_ORIGIN } from "../../services/site";

export function PublishDeck({ deckHash }: { deckHash: string | undefined }) {
  const authName = useAppStore((s) => s.authName);
  const [known, setKnown] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [handle, setHandle] = useState<string | null>(null);

  useEffect(() => {
    if (!authName || !deckHash) {
      setKnown(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const [runner, sync] = await Promise.all([
        import("../../services/cloud/syncRunner"),
        import("../../services/cloud/sync"),
      ]);
      // The handle is what turns a deck into a readable link, and it lives on
      // the profile rather than the deck row. Fetched alongside, tolerated as
      // null — `/d/<id>` still resolves without it.
      const [decks, profile] = await Promise.all([
        runner.cloudDecksNow(),
        sync.fetchProfileSettings().catch(() => null),
      ]);
      if (cancelled) return;
      const mine = decks.find((d) => d.deckHash === deckHash);
      setHandle(profile?.handle ?? null);
      setKnown(Boolean(mine));
      setIsPublic(Boolean(mine?.isPublic));
      setUrl(
        mine?.isPublic
          ? deckUrl(profile?.handle ?? null, mine.slug, mine.publicId)
          : null,
      );
    })().catch(() => {
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
    setCopied(false);
    // Optimistic, then reconciled: the server is the authority on whether the
    // row actually changed (it returns false when the deck is not there).
    setIsPublic(on);
    if (!on) setUrl(null);
    try {
      const [runner, sync] = await Promise.all([
        import("../../services/cloud/syncRunner"),
        import("../../services/cloud/sync"),
      ]);

      let list: string | null = null;
      if (on) {
        const decks = await runner.cloudDecksNow();
        const mine = decks.find((d) => d.deckHash === deckHash);
        if (!mine) {
          setIsPublic(false);
          setMsg("That deck isn't backed up yet — play a match with it and try again.");
          return;
        }
        const { resolveArenaCards } = await import("../../services/arenaCards");
        const cards = await resolveArenaCards([...mine.main, ...(mine.side ?? [])]);
        const built = toArenaDecklist(mine.main, mine.side, cards);
        if (!built.text || built.unresolved > 0) {
          // Better no page than a page with card names nobody can import.
          setIsPublic(false);
          setMsg(
            `Still looking up ${built.unresolved} card${built.unresolved === 1 ? "" : "s"} — ` +
              "open this deck again in a minute and publish then.",
          );
          return;
        }
        list = built.text;
      }

      const ok = await sync.setDeckPublic(deckHash, on, list);
      if (!ok) {
        setIsPublic(!on);
        setMsg("That deck isn't backed up yet — play a match with it and try again.");
        return;
      }

      const cache = await import("../../services/cloud/useCloudDecks");
      cache.clearCloudDeckCache();
      if (on) {
        // Re-read rather than guess: the slug is assigned by the server, and it
        // carries a `-2` suffix when another of your decks already took the name.
        const fresh = (await runner.cloudDecksNow()).find((d) => d.deckHash === deckHash);
        setUrl(deckUrl(handle, fresh?.slug ?? null, fresh?.publicId ?? null));
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
        className={`btn btn-sm ${isPublic ? "btn-primary" : "btn-ghost"}`}
        disabled={busy}
        title={
          isPublic
            ? "Showing on your public profile page, with a copyable decklist. Click to take it down."
            : "Publish this deck to your public profile page — name, format, size and the decklist, so anyone with the link can copy it into Arena. Never your match history."
        }
        onClick={() => void toggle(!isPublic)}
      >
        {isPublic ? "On your profile" : "Publish decklist"}
      </button>
      {isPublic && url && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          title={`Copy ${url} — paste it into a video description or a tweet`}
          onClick={() => {
            void copyToClipboard(url).then((ok) => {
              setCopied(ok);
              if (!ok) setMsg("Could not reach the clipboard.");
            });
          }}
        >
          {copied ? "Link copied" : "Copy link"}
        </button>
      )}
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </span>
  );
}

/**
 * The shareable URL — the readable `/u/<handle>/<slug>` form when both halves
 * are known, since that is what goes in a video description.
 *
 * `/d/<id>` is the fallback rather than the default: it 301s to the same page,
 * so it is always correct, but it says nothing about whose deck it is. Either
 * form survives a rename — the server assigns the slug once and keeps it.
 */
function deckUrl(
  handle: string | null,
  slug: string | null,
  publicId: string | null,
): string | null {
  if (handle && slug) return `${SITE_ORIGIN}/u/${handle}/${slug}`;
  return publicId ? `${SITE_ORIGIN}/d/${publicId}` : null;
}

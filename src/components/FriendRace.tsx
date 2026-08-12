/**
 * Phase 5 — the seasonal friend race, on the Climb page because that is where
 * the ladder already lives.
 *
 * Shows nothing at all unless the player is signed in and has at least one
 * friend. A social feature that renders an empty invitation on every screen is
 * clutter for the overwhelming majority who will never use it; the way in is
 * Settings, where the friend code lives.
 */

import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { winrateFavor } from "../services/ranks";
import type { FriendLine } from "../services/cloud/friends";

export function FriendRace({ seasonOrdinal }: { seasonOrdinal?: number | null }) {
  const authName = useAppStore((s) => s.authName);
  const [lines, setLines] = useState<FriendLine[] | null>(null);
  const [scope, setScope] = useState<"season" | "all">("season");

  useEffect(() => {
    if (!authName) {
      setLines(null);
      return;
    }
    let cancelled = false;
    const season = scope === "season" ? (seasonOrdinal ?? null) : null;
    void import("../services/cloud/friends")
      .then(async (m) => m.rankFriends(await m.friendLines(season)))
      .then((rows) => {
        if (!cancelled) setLines(rows);
      })
      .catch(() => {
        /* a backend problem must not break the Climb page */
      });
    return () => {
      cancelled = true;
    };
  }, [authName, scope, seasonOrdinal]);

  // Already ordered by `rankFriends` — sorting lives in the service so it is
  // testable, and this component only renders.
  const ranked = useMemo(() => lines ?? [], [lines]);

  // One line is just you — that is not a race, and not worth a panel.
  if (!authName || ranked.length < 2) return null;

  return (
    <div className="panel">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="dash-title m-0">Friends</h3>
        <span className="flex items-center gap-1">
          <button
            type="button"
            className={`btn btn-sm ${scope === "season" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setScope("season")}
            title="This ranked season only"
          >
            Season
          </button>
          <button
            type="button"
            className={`btn btn-sm ${scope === "all" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setScope("all")}
            title="Everything they have shared"
          >
            All time
          </button>
        </span>
      </div>
      <table className="friend-table">
        <thead>
          <tr>
            <th></th>
            <th>Player</th>
            <th className="num">Matches</th>
            <th className="num">W–L</th>
            <th className="num">Win rate</th>
            <th>Best rank</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((l, i) => {
            const decided = l.wins + l.losses;
            const rate = decided ? l.wins / decided : null;
            return (
              <tr key={l.userId} className={l.isMe ? "friend-me" : ""}>
                <td className="num friend-pos">{i + 1}</td>
                <td className="truncate">
                  {l.name}
                  {l.isMe && <span className="text-xs text-muted"> · you</span>}
                </td>
                <td className="num">{l.matches}</td>
                <td className="num">
                  {l.wins}–{l.losses}
                </td>
                <td className="num">
                  {rate != null ? (
                    <strong className={`favor-${winrateFavor(rate)}`}>
                      {(rate * 100).toFixed(0)}%
                    </strong>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="truncate">{l.bestRank ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-muted m-0 mt-2">
        Only what each player chose to share. A friend with sharing switched off
        shows zeroes — nothing is inferred about them.
      </p>
    </div>
  );
}

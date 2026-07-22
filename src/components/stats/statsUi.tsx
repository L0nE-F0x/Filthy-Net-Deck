import { useEffect, useState } from "react";
import { isLandName } from "../../services/landNames";
import {
  resolveArenaCards,
  type ArenaCardInfo,
} from "../../services/arenaCards";
import { winrateFavor } from "../../services/ranks";
import type { ArtRef } from "../CardArt";
import type { MatchResult } from "../../types/tracker";

export function pickArenaPreview(
  main: number[] | undefined,
  cards: Record<number, ArenaCardInfo>,
  max = 4,
): ArtRef[] {
  if (!main?.length) return [];
  const counts = new Map<number, number>();
  for (const id of main) counts.set(id, (counts.get(id) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const spells: ArtRef[] = [];
  const lands: ArtRef[] = [];
  for (const [id] of ranked) {
    const info = cards[id];
    if (!info?.name) continue;
    const ref: ArtRef = { name: info.name, scryfallId: info.scryfallId };
    if (isLandName(info.name)) lands.push(ref);
    else spells.push(ref);
  }
  return [...spells, ...lands].slice(0, max);
}

export function useArenaCardMap(ids: number[]): Record<number, ArenaCardInfo> {
  const [cards, setCards] = useState<Record<number, ArenaCardInfo>>({});
  const key = ids.slice().sort((a, b) => a - b).join(",");
  useEffect(() => {
    if (ids.length === 0) {
      setCards({});
      return;
    }
    let alive = true;
    void resolveArenaCards(ids).then((map) => {
      if (alive) setCards(map);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return cards;
}

export const RESULT_LABEL: Record<MatchResult, string> = {
  win: "Win",
  loss: "Loss",
  draw: "Draw",
  unknown: "?",
};

export type SortDir = "asc" | "desc";

/** Click a column header: same key flips direction; new key uses its default. */
export function nextSort<K extends string>(
  key: K,
  current: { key: K; dir: SortDir },
  defaults: Record<K, SortDir>,
): { key: K; dir: SortDir } {
  if (current.key === key) {
    return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  }
  return { key, dir: defaults[key] };
}

export function SortHeaderBtn({
  label,
  active,
  dir,
  align = "left",
  onClick,
  className = "",
  tip,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  align?: "left" | "right" | "center";
  onClick: () => void;
  className?: string;
  /** Longer hover help (defaults to sort-by label). */
  tip?: string;
}) {
  const marker = active ? (dir === "asc" ? "▲" : "▼") : "";
  const sortState = active
    ? dir === "asc"
      ? "ascending — click to reverse"
      : "descending — click to reverse"
    : "click to sort";
  return (
    <button
      type="button"
      className={`sort-head-btn align-${align}${active ? " active" : ""}${className ? ` ${className}` : ""}`}
      onClick={onClick}
      title={tip ? `${tip} (${sortState})` : `Sort by ${label} (${sortState})`}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      {label}
      <span className={`sort-marker${active ? " on" : ""}`} aria-hidden="true">
        {marker}
      </span>
    </button>
  );
}

/** One labelled winrate bar — shared by deck rows and the splits panel. */
export function RateBar({
  wins,
  losses,
  tip,
}: {
  wins: number;
  losses: number;
  tip?: string;
}) {
  const decided = wins + losses;
  const rate = decided > 0 ? wins / decided : 0;
  const defaultTip =
    decided > 0
      ? `${wins}W–${losses}L · ${Math.round(rate * 100)}% of decided games`
      : "No decided games yet";
  return (
    <>
      <span className="mu-track" title={tip ?? defaultTip}>
        <span
          className={`mu-fill favor-${winrateFavor(rate)}`}
          style={{ width: `${Math.max(4, rate * 100)}%`, display: "block" }}
        />
      </span>
      <span className="deck-wr-score" title={tip ?? defaultTip}>
        {wins}W {losses}L
        <strong className={`favor-${winrateFavor(rate)}`}>
          {decided > 0 ? ` ${(rate * 100).toFixed(0)}%` : " —"}
        </strong>
      </span>
    </>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { deckKey, gameScore, queueLabel, timeAgo } from "../../services/tracker";
import type { TrackedMatch } from "../../types/tracker";
import { inferOpponentArchetype } from "../../services/opponentArchetype";
import { peekArenaMeta, resolveArenaMetaBatch } from "../../services/arenaMeta";
import { decksForMode } from "../../services/deckHelpers";
import {
  MATCH_SORT_DEFAULTS,
  sortMatches,
  type MatchSortKey,
} from "../../services/matchHistorySort";
import {
  RESULT_LABEL,
  nextSort,
  SortHeaderBtn,
  type SortDir,
} from "./statsUi";

function MatchRow({
  m,
  onOpponent,
  onDeck,
  oppArch,
}: {
  m: TrackedMatch;
  onOpponent: (name: string) => void;
  onDeck: (key: string) => void;
  oppArch?: string | null;
}) {
  const onPlay = m.games.length === 1 ? m.games[0]?.onPlay : undefined;
  return (
    <div className="match-row">
      <span className={`result-chip ${m.result}`}>{RESULT_LABEL[m.result]}</span>
      <button
        type="button"
        className="match-opponent link-btn text-left"
        title={m.opponentPlatform ?? "Open in Matchup Lab"}
        onClick={() => onOpponent(m.opponentName ?? "Unknown")}
      >
        vs {m.opponentName ?? "Unknown"}
        {oppArch ? (
          <span className="text-muted font-normal"> · {oppArch}</span>
        ) : null}
      </button>
      <span className="match-detail">
        <button
          type="button"
          className="link-btn"
          onClick={() => onDeck(deckKey(m))}
        >
          {m.deckName ?? "Unknown deck"}
        </button>
        <span className="text-muted"> · {queueLabel(m.eventId)}</span>
        {m.games.length > 1 && <span className="text-muted"> · {gameScore(m)}</span>}
        {onPlay !== undefined && (
          <span className="text-muted"> · {onPlay ? "on the play" : "on the draw"}</span>
        )}
      </span>
      <span className="match-when" title={new Date(m.endedAt).toLocaleString()}>
        {m.myRank && <span className="text-muted">{m.myRank} · </span>}
        {timeAgo(m.endedAt)}
      </span>
    </div>
  );
}

export function MatchHistory({
  matches,
  onOpponent,
  onDeck,
}: {
  matches: TrackedMatch[];
  onOpponent: (name: string) => void;
  onDeck: (key: string) => void;
}) {
  const meta = useAppStore((s) => s.meta);
  const mode = useAppStore((s) => s.mode);
  const dailyFormatId = useAppStore((s) => s.dailyFormatId);
  const [visible, setVisible] = useState(30);
  const [sort, setSort] = useState<{ key: MatchSortKey; dir: SortDir }>({
    key: "when",
    dir: "desc",
  });
  const [namesTick, setNamesTick] = useState(0);

  const candidates = useMemo(() => {
    if (!meta) return [];
    const fmt =
      meta.formats.find((f) => f.id === dailyFormatId) ??
      meta.formats.find((f) => f.featured) ??
      meta.formats[0];
    if (!fmt) return [];
    return decksForMode(fmt, mode, meta.decks);
  }, [meta, mode, dailyFormatId]);

  useEffect(() => {
    const ids = new Set<number>();
    for (const m of matches) {
      for (const id of m.opponentSeen ?? []) ids.add(id);
    }
    if (ids.size === 0) return;
    let cancelled = false;
    void resolveArenaMetaBatch([...ids]).then(() => {
      if (!cancelled) setNamesTick((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [matches]);

  const archByMatch = useMemo(() => {
    void namesTick;
    const map = new Map<string, string>();
    if (!candidates.length) return map;
    const resolve = (id: number) => peekArenaMeta(id)?.name ?? null;
    for (const m of matches) {
      if (!m.opponentSeen?.length) continue;
      const g = inferOpponentArchetype(m.opponentSeen, resolve, candidates, {
        minHits: 2,
        minConfidence: 0.3,
      });
      if (g) map.set(m.matchId, g.archetype);
    }
    return map;
  }, [matches, candidates, namesTick]);

  const sorted = useMemo(
    () => sortMatches(matches, sort.key, sort.dir),
    [matches, sort.key, sort.dir],
  );

  const setCol = (key: MatchSortKey) =>
    setSort((cur) => nextSort(key, cur, MATCH_SORT_DEFAULTS));

  return (
    <div className="panel">
      <h3 className="dash-title">Match history</h3>
      <div className="match-rows">
        <div className="match-row match-sort-head" role="row">
          <SortHeaderBtn
            label="Result"
            active={sort.key === "result"}
            dir={sort.dir}
            onClick={() => setCol("result")}
          />
          <SortHeaderBtn
            label="Opponent"
            active={sort.key === "opponent"}
            dir={sort.dir}
            onClick={() => setCol("opponent")}
          />
          <SortHeaderBtn
            label="Deck"
            active={sort.key === "deck"}
            dir={sort.dir}
            onClick={() => setCol("deck")}
          />
          <SortHeaderBtn
            label="When"
            active={sort.key === "when"}
            dir={sort.dir}
            align="right"
            onClick={() => setCol("when")}
          />
        </div>
        {sorted.slice(0, visible).map((m) => (
          <MatchRow
            key={m.matchId}
            m={m}
            onOpponent={onOpponent}
            onDeck={onDeck}
            oppArch={archByMatch.get(m.matchId)}
          />
        ))}
      </div>
      {sorted.length > visible && (
        <button
          type="button"
          className="btn btn-ghost btn-sm mt-3"
          onClick={() => setVisible((v) => v + 50)}
        >
          Show more ({sorted.length - visible} older)
        </button>
      )}
    </div>
  );
}

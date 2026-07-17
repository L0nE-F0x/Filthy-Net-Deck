import { useEffect, useMemo, useState } from "react";
import {
  fetchMetaHistory,
  seriesForArchetype,
  topMovers,
  type HistoryPoint,
} from "../services/metaHistory";
import { useAppStore } from "../store/useAppStore";
import { decksForMode } from "../services/deckHelpers";

/** Compact 30-day meta-share spark bars for the active format board. */
export function MetaShareTimeline() {
  const meta = useAppStore((s) => s.meta);
  const mode = useAppStore((s) => s.mode);
  const dailyFormatId = useAppStore((s) => s.dailyFormatId);
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchMetaHistory(
      import.meta.env.DEV ? window.location.origin : undefined,
    ).then((h) => {
      if (!alive) return;
      setPoints(h?.points ?? []);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const fmt =
    meta?.formats.find((f) => f.id === dailyFormatId) ??
    meta?.formats.find((f) => f.featured) ??
    meta?.formats[0];

  const board = useMemo(() => {
    if (!meta || !fmt) return [];
    return decksForMode(fmt, mode, meta.decks).slice(0, 5);
  }, [meta, fmt, mode]);

  const movers = useMemo(() => {
    if (!fmt) return [];
    return topMovers(points, { format: fmt.id, mode, limit: 4 });
  }, [points, fmt, mode]);

  if (!fmt || !loaded || points.length === 0) return null;

  return (
    <section className="panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <div>
          <p className="eyebrow m-0">Meta-share timeline</p>
          <h3 className="text-sm font-semibold m-0">
            {fmt.name} · {mode.toUpperCase()} · last ~30 days
          </h3>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {board.map((d) => {
          const series = seriesForArchetype(points, {
            format: fmt.id,
            mode,
            archetype: d.archetype || d.name,
            days: 30,
          });
          const max = Math.max(1, ...series.map((p) => p.pct));
          return (
            <div key={d.id} className="meta-hist-row">
              <div className="flex justify-between gap-2 text-xs mb-0.5">
                <span className="font-medium truncate">{d.name}</span>
                <span className="text-muted shrink-0">
                  {series.length
                    ? `${series[series.length - 1].pct.toFixed(1)}%`
                    : d.metaShare != null
                      ? `${d.metaShare}%`
                      : "—"}
                </span>
              </div>
              <div className="meta-hist-bars" aria-hidden="true">
                {series.length === 0 ? (
                  <i style={{ width: "4px", opacity: 0.2 }} />
                ) : (
                  series.map((p) => (
                    <i
                      key={p.date}
                      title={`${p.date}: ${p.pct}%`}
                      style={{ height: `${Math.max(8, (p.pct / max) * 100)}%` }}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
      {movers.length > 0 && (
        <p className="text-xs text-muted m-0 mt-3 leading-relaxed">
          Movers:{" "}
          {movers.map((m, i) => (
            <span key={m.archetype}>
              {i > 0 ? " · " : ""}
              <strong className="text-foam">{m.archetype}</strong>{" "}
              <span className={m.delta >= 0 ? "text-good" : "text-poor"}>
                {m.delta >= 0 ? "+" : ""}
                {m.delta.toFixed(1)}pp
              </span>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

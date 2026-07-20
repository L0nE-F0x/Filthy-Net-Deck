import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { buildLocalCoachChips } from "../services/localCoach";
import { peekArenaMeta, resolveArenaMetaBatch } from "../services/arenaMeta";
/**
 * Deterministic coach notes on Daily — no LLM, real aggregates only.
 */
export function LocalCoachStrip() {
  const matches = useAppStore((s) => s.trackerMatches);
  const meta = useAppStore((s) => s.meta);
  const mode = useAppStore((s) => s.mode);
  const setPage = useAppStore((s) => s.setPage);

  const allIds = useMemo(() => {
    const s = new Set<number>();
    for (const m of matches) {
      for (const id of m.opponentSeen ?? []) s.add(id);
    }
    return [...s];
  }, [matches]);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!allIds.length) return;
    let cancelled = false;
    void resolveArenaMetaBatch(allIds).then(() => {
      if (!cancelled) setTick((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [allIds]);

  const resolveName = useMemo(() => {
    void tick;
    return (id: number) => peekArenaMeta(id)?.name ?? null;
  }, [tick]);

  const chips = useMemo(
    () =>
      buildLocalCoachChips({
        matches,
        meta,
        resolveName,
        mode,
      }),
    [matches, meta, resolveName, mode],
  );

  if (chips.length === 0) return null;

  return (
    <section className="local-coach panel" aria-label="Grounded notes">
      <div className="local-coach-head">
        <p className="eyebrow m-0">Grounded notes</p>
        <span className="text-xs text-muted">From your log + today&apos;s board · no AI</span>
      </div>
      <ul className="local-coach-chips">
        {chips.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className={`local-coach-chip kind-${c.kind}`}
              onClick={() => {
                if (!c.nav) return;
                setPage(c.nav);
              }}
            >
              <strong>{c.label}</strong>
              <span>{c.detail}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

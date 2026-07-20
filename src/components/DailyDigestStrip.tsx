import { useEffect, useMemo, useRef } from "react";
import { useAppStore } from "../store/useAppStore";
import {
  buildDailyDigest,
  readLastOpenAt,
  writeLastOpenAt,
} from "../services/dailyDigest";

/**
 * D2 (light) — 2–3 chips: your recent record, rank path, top meta mover.
 * Local only; stamps last-open after first paint so the next visit gets a
 * real "since last open" window.
 */
export function DailyDigestStrip({
  formatId,
}: {
  formatId: string | null | undefined;
}) {
  const matches = useAppStore((s) => s.trackerMatches);
  const mode = useAppStore((s) => s.mode);
  const metaDiff = useAppStore((s) => s.metaDiff);
  const stamped = useRef(false);

  // Capture last-open once per mount so chips stay stable for this visit.
  const lastOpenMs = useMemo(() => readLastOpenAt(), []);

  const { window, chips } = useMemo(
    () =>
      buildDailyDigest({
        matches,
        nowMs: Date.now(),
        lastOpenMs,
        metaChanges: metaDiff.changes,
        formatId,
        mode,
      }),
    [matches, lastOpenMs, metaDiff.changes, formatId, mode],
  );

  useEffect(() => {
    if (stamped.current) return;
    stamped.current = true;
    // Defer stamp so a quick remount still sees the previous visit window.
    const t = globalThis.setTimeout(() => writeLastOpenAt(Date.now()), 1500);
    return () => globalThis.clearTimeout(t);
  }, []);

  if (chips.length === 0) return null;

  return (
    <section className="daily-digest panel" aria-label="Since you last looked">
      <div className="daily-digest-head">
        <p className="eyebrow m-0">Catch up</p>
        <span className="daily-digest-window">{window.label}</span>
      </div>
      <ul className="daily-digest-chips">
        {chips.map((c) => (
          <li key={c.id} className={`daily-digest-chip kind-${c.kind}`}>
            <strong>{c.label}</strong>
            <span>{c.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

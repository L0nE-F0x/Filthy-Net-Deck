import { useMemo } from "react";
import { useAppStore } from "../store/useAppStore";
import { buildSpoilerPulse, totalNewCount } from "../services/setPulse";

export function SpoilerPulse() {
  const sets = useAppStore((s) => s.sets);
  const setsNewByCode = useAppStore((s) => s.setsNewByCode);
  const setPage = useAppStore((s) => s.setPage);

  const items = useMemo(
    () => buildSpoilerPulse(sets, setsNewByCode),
    [sets, setsNewByCode],
  );
  const newTotal = useMemo(() => totalNewCount(setsNewByCode), [setsNewByCode]);

  if (!items.length && newTotal === 0) return null;

  const top = items[0];
  if (!top) return null;

  // Estimated Arena dates are a paper−3d guess — say "expected", not "hits".
  const estimated = top.arenaConfidence === "estimated";
  let headline = top.name;
  let detail = "";
  if (top.kind === "arena_today") {
    detail = estimated ? "expected on Arena today" : "hits Arena today";
  } else if (top.kind === "arena_tomorrow") {
    detail = estimated ? "expected on Arena tomorrow" : "hits Arena tomorrow";
  } else if (top.kind === "arena_soon" && top.arenaIn != null) {
    detail = `Arena in ${top.arenaIn}d${estimated ? " (est.)" : ""}`;
  } else {
    detail = "spoilers live";
  }

  const extra =
    items.length > 1 ? ` · +${items.length - 1} more set${items.length > 2 ? "s" : ""}` : "";
  const newBit =
    newTotal > 0
      ? ` · ${newTotal} new card${newTotal === 1 ? "" : "s"} since last visit`
      : top.spoiledCount > 0
        ? ` · ${top.spoiledCount} spoiled`
        : "";

  return (
    <button
      type="button"
      className="spoiler-pulse"
      onClick={() => setPage("sets")}
    >
      <span className="spoiler-pulse-badge">Set Radar</span>
      <span className="spoiler-pulse-copy">
        <strong>{headline}</strong>
        <span className="spoiler-pulse-detail">
          {" "}
          {detail}
          {newBit}
          {extra}
        </span>
      </span>
      <span className="spoiler-pulse-cta">Open →</span>
    </button>
  );
}

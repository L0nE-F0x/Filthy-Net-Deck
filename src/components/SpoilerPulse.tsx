import { useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import {
  buildSpoilerPulse,
  dismissSpoilerPulse,
  isSpoilerPulseDismissed,
  totalNewCount,
} from "../services/setPulse";
import { useLocale } from "../i18n";

export function SpoilerPulse() {
  const { t } = useLocale();
  const sets = useAppStore((s) => s.sets);
  const setsNewByCode = useAppStore((s) => s.setsNewByCode);
  const setPage = useAppStore((s) => s.setPage);
  const [gone, setGone] = useState(false);

  const items = useMemo(
    () => buildSpoilerPulse(sets, setsNewByCode),
    [sets, setsNewByCode],
  );
  const newTotal = useMemo(() => totalNewCount(setsNewByCode), [setsNewByCode]);

  if (!items.length && newTotal === 0) return null;

  const top = items[0];
  if (!top) return null;
  if (gone || isSpoilerPulseDismissed(top)) return null;

  // Estimated Arena dates are a paper−3d guess — say "expected", not "hits".
  const estimated = top.arenaConfidence === "estimated";
  const headline = top.name;
  let detail: string;
  if (top.kind === "arena_today") {
    detail = estimated ? t("pulses.arenaTodayEst") : t("pulses.arenaToday");
  } else if (top.kind === "arena_tomorrow") {
    detail = estimated ? t("pulses.arenaTomorrowEst") : t("pulses.arenaTomorrow");
  } else if (top.kind === "arena_soon" && top.arenaIn != null) {
    detail = estimated
      ? t("pulses.arenaInEst", { n: top.arenaIn })
      : t("pulses.arenaIn", { n: top.arenaIn });
  } else {
    detail = t("pulses.spoilersLive");
  }

  const extraN = items.length - 1;
  const extra =
    extraN > 0
      ? ` · ${extraN === 1 ? t("pulses.moreSet", { n: extraN }) : t("pulses.moreSets", { n: extraN })}`
      : "";
  const newBit =
    newTotal > 0
      ? ` · ${newTotal === 1 ? t("pulses.newCard", { n: newTotal }) : t("pulses.newCards", { n: newTotal })}`
      : top.spoiledCount > 0
        ? ` · ${t("pulses.spoiled", { n: top.spoiledCount })}`
        : "";

  const openSets = () => {
    dismissSpoilerPulse(top);
    setGone(true);
    setPage("sets");
  };

  return (
    <div className="spoiler-pulse" role="status">
      <span className="spoiler-pulse-badge">{t("pulses.setRadar")}</span>
      <button type="button" className="spoiler-pulse-open" onClick={openSets}>
        <span className="spoiler-pulse-copy">
          <strong>{headline}</strong>
          <span className="spoiler-pulse-detail">
            {" "}
            {detail}
            {newBit}
            {extra}
          </span>
        </span>
        <span className="spoiler-pulse-cta">{t("pulses.openSets")}</span>
      </button>
      <button
        type="button"
        className="ban-pulse-dismiss"
        aria-label={t("pulses.dismissRadar")}
        title="Dismiss"
        onClick={() => {
          dismissSpoilerPulse(top);
          setGone(true);
        }}
      >
        ✕
      </button>
    </div>
  );
}

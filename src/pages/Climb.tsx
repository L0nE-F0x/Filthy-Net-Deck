import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import {
  currentSeasonKey,
  deckKey,
  seasonKeyOf,
  seasonLabel,
  timeAgo,
} from "../services/tracker";
import {
  buildRankSeries,
  estimateMatchesPerStep,
  formatRank,
  nextRankLabel,
  rankLabelFromScore,
  winrateFavor,
  type RankPoint,
} from "../services/ranks";
import {
  buildClimbLegs,
  currentStreak,
  deckClimbSummaries,
  deckColorIndex,
  longestStreak,
  previousSeasonSummary,
  type ClimbLeg,
  type DeckClimbSummary,
} from "../services/climbStats";
import type { TrackedMatch } from "../types/tracker";
import { TrackerOnboarding } from "../components/TrackerOnboarding";
import { CountUp } from "../components/CountUp";
import { ShareActionButton } from "../components/ShareMenu";
import { downloadClimbSharePng } from "../services/shareCards";

/** Chart / legend palette — distinct enough on dark and light themes. */
const DECK_PALETTE = [
  "#d4a84b",
  "#4a7fd4",
  "#34d399",
  "#f87171",
  "#a78bfa",
  "#fbbf24",
  "#2dd4bf",
  "#fb7185",
  "#60a5fa",
  "#c084fc",
];

function tally(matches: TrackedMatch[]) {
  const wins = matches.filter((m) => m.result === "win").length;
  const losses = matches.filter((m) => m.result === "loss").length;
  const decided = wins + losses;
  return { wins, losses, decided, rate: decided > 0 ? wins / decided : null };
}

function deckSwatch(key: string): string {
  return DECK_PALETTE[deckColorIndex(key, DECK_PALETTE.length)];
}

/**
 * Monotone cubic (Fritsch–Carlson) path through points. Smooths the curve
 * without overshooting past any data point.
 */
function monotonePath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const d = pts[i + 1].x - pts[i].x || 1e-6;
    dx.push(d);
    slope.push((pts[i + 1].y - pts[i].y) / d);
  }
  const tan: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    tan.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  }
  tan.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tan[i] = 0;
      tan[i + 1] = 0;
      continue;
    }
    const a = tan[i] / slope[i];
    const b = tan[i + 1] / slope[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      tan[i] = tau * a * slope[i];
      tan[i + 1] = tau * b * slope[i];
    }
  }
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d +=
      ` C ${(pts[i].x + h).toFixed(1)} ${(pts[i].y + tan[i] * h).toFixed(1)}` +
      ` ${(pts[i + 1].x - h).toFixed(1)} ${(pts[i + 1].y - tan[i + 1] * h).toFixed(1)}` +
      ` ${pts[i + 1].x.toFixed(1)} ${pts[i + 1].y.toFixed(1)}`;
  }
  return d;
}

function RankChart({
  series,
  highlightDeckKey,
  onOpenDeck,
}: {
  series: RankPoint[];
  highlightDeckKey: string | null;
  onOpenDeck: (deckKey: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  if (series.length === 0) {
    return (
      <div className="climb-chart empty">
        <p className="text-sm text-muted m-0">
          No rank samples yet — Arena only stamps rank on some matches. Keep laddering with
          detailed logs on.
        </p>
      </div>
    );
  }

  const w = 680;
  const h = 250;
  const padL = 66;
  const padR = 18;
  const padT = 16;
  const padB = 26;

  const scores = series.map((p) => p.rank.score);
  let lo = Math.floor(Math.min(...scores));
  let hi = Math.ceil(Math.max(...scores));
  if (hi - lo < 2) {
    lo = Math.max(0, lo - 1);
    hi = lo + 2;
  }

  const minT = series[0].at;
  const maxT = series[series.length - 1].at;
  const spanT = Math.max(1, maxT - minT);

  const xOf = (t: number) => padL + ((t - minT) / spanT) * (w - padL - padR);
  const yOf = (s: number) => padT + (1 - (s - lo) / (hi - lo)) * (h - padT - padB);

  const pts = series.map((p) => ({ x: xOf(p.at), y: yOf(p.rank.score) }));
  const line = monotonePath(pts);
  const baseline = h - padB;
  const area =
    series.length > 1
      ? `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${baseline.toFixed(1)}` +
        ` L ${pts[0].x.toFixed(1)} ${baseline.toFixed(1)} Z`
      : "";

  let step = 1;
  while ((hi - lo) / step > 6) step *= 2;
  const yTicks: { s: number; label: string; y: number }[] = [];
  for (let s = lo; s <= hi; s += step) {
    if (s > 20) break;
    yTicks.push({ s, label: rankLabelFromScore(s), y: yOf(s) });
  }

  const dayMs = 86_400_000;
  const nX = spanT < dayMs ? 2 : 4;
  const xTicks = Array.from({ length: nX }, (_, i) => {
    const t = minT + (spanT * i) / (nX - 1);
    return {
      t,
      x: xOf(t),
      label: new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    };
  });

  const dotIdx: number[] = [];
  for (let i = 0; i < series.length; i++) {
    if (
      i === 0 ||
      i === series.length - 1 ||
      series[i].rank.score !== series[i - 1].rank.score ||
      series[i].deckKey !== series[i - 1].deckKey
    ) {
      dotIdx.push(i);
    }
  }
  const dotR = dotIdx.length > 40 ? 2.5 : 3.5;

  let peakIdx = 0;
  for (let i = 1; i < series.length; i++) {
    if (series[i].rank.score > series[peakIdx].rank.score) peakIdx = i;
  }
  const lastIdx = series.length - 1;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = ((e.clientX - rect.left) / rect.width) * w;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.abs(pts[i].x - mx);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setHover(best);
  };

  const hovered = hover != null ? series[hover] : null;
  const hoverPt = hover != null ? pts[hover] : null;
  const tipLines = hovered
    ? [
        formatRank(hovered.rank),
        hovered.deckName || "Unknown deck",
        new Date(hovered.at).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
      ]
    : [];
  const tipW = Math.max(120, ...tipLines.map((t) => t.length * 6.6 + 16));
  const tipH = tipLines.length * 14 + 12;
  const tipX = hoverPt ? Math.min(Math.max(hoverPt.x - tipW / 2, padL), w - padR - tipW) : 0;
  const tipY = hoverPt
    ? hoverPt.y - tipH - 10 < padT
      ? hoverPt.y + 14
      : hoverPt.y - tipH - 10
    : 0;

  return (
    <div className="climb-chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        className="climb-svg"
        role="img"
        aria-label="Rank over time by deck"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="climbFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="climb-fill-hi" />
            <stop offset="100%" className="climb-fill-lo" />
          </linearGradient>
        </defs>

        {yTicks.map((t) => (
          <g key={t.s}>
            <line x1={padL} x2={w - padR} y1={t.y} y2={t.y} className="climb-grid" />
            <text x={padL - 8} y={t.y + 3} className="climb-axis" textAnchor="end">
              {t.label}
            </text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <g key={i}>
            <line x1={t.x} x2={t.x} y1={padT} y2={baseline} className="climb-grid-v" />
            <text
              x={t.x}
              y={h - 8}
              className="climb-axis"
              textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
            >
              {t.label}
            </text>
          </g>
        ))}

        {area && <path d={area} className="climb-area" fill="url(#climbFill)" />}
        <path d={line} className="climb-line" fill="none" />

        {/* Per-segment colored underlines between consecutive samples */}
        {pts.slice(0, -1).map((p, i) => {
          const a = series[i];
          const b = series[i + 1];
          const q = pts[i + 1];
          const key = a.deckKey || b.deckKey || "?";
          const faded = highlightDeckKey && key !== highlightDeckKey;
          return (
            <line
              key={`${a.matchId}-${b.matchId}`}
              x1={p.x}
              y1={p.y}
              x2={q.x}
              y2={q.y}
              stroke={deckSwatch(key)}
              strokeWidth={faded ? 1.5 : 3}
              strokeOpacity={faded ? 0.25 : 0.9}
              strokeLinecap="round"
            />
          );
        })}

        {dotIdx.map((i) => {
          const p = series[i];
          const key = p.deckKey || "?";
          const faded = highlightDeckKey != null && key !== highlightDeckKey;
          const isNow = i === lastIdx;
          if (isNow) return null;
          return (
            <circle
              key={p.matchId}
              cx={pts[i].x}
              cy={pts[i].y}
              r={dotR}
              fill={deckSwatch(key)}
              opacity={faded ? 0.3 : 1}
              className="climb-dot-deck"
              style={{ cursor: p.deckKey ? "pointer" : "default" }}
              onClick={(e) => {
                e.stopPropagation();
                if (p.deckKey) onOpenDeck(p.deckKey);
              }}
            />
          );
        })}

        {peakIdx !== lastIdx && (
          <g className="climb-peak">
            <circle cx={pts[peakIdx].x} cy={pts[peakIdx].y} r={4.5} />
            <text x={pts[peakIdx].x} y={pts[peakIdx].y - 9} textAnchor="middle">
              peak
            </text>
          </g>
        )}

        <g className="climb-now">
          <circle className="climb-now-pulse" cx={pts[lastIdx].x} cy={pts[lastIdx].y} r={5} />
          <circle
            className="climb-now-dot"
            cx={pts[lastIdx].x}
            cy={pts[lastIdx].y}
            r={4}
            fill={series[lastIdx].deckKey ? deckSwatch(series[lastIdx].deckKey) : undefined}
            style={{ cursor: series[lastIdx].deckKey ? "pointer" : "default" }}
            onClick={() => {
              if (series[lastIdx].deckKey) onOpenDeck(series[lastIdx].deckKey!);
            }}
          />
        </g>

        {hoverPt && hovered && (
          <g className="climb-hover">
            <line x1={hoverPt.x} x2={hoverPt.x} y1={padT} y2={baseline} className="climb-cross" />
            <circle
              cx={hoverPt.x}
              cy={hoverPt.y}
              r={5}
              fill={hovered.deckKey ? deckSwatch(hovered.deckKey) : "var(--color-gold-400)"}
              className="climb-hover-dot"
            />
            <g transform={`translate(${tipX.toFixed(1)} ${tipY.toFixed(1)})`}>
              <rect width={tipW} height={tipH} rx={6} className="climb-tip-bg" />
              {tipLines.map((line, i) => (
                <text
                  key={i}
                  x={tipW / 2}
                  y={14 + i * 14}
                  textAnchor="middle"
                  className={i === 0 ? "climb-tip-text" : "climb-tip-sub"}
                >
                  {line}
                </text>
              ))}
            </g>
          </g>
        )}
      </svg>
      {hovered?.deckKey && (
        <button
          type="button"
          className="climb-chart-cta"
          onClick={() => onOpenDeck(hovered.deckKey!)}
        >
          Open {hovered.deckName || "deck"} stats →
        </button>
      )}
    </div>
  );
}

function LegCard({
  leg,
  index,
  onOpen,
  highlighted,
  onHover,
}: {
  leg: ClimbLeg;
  index: number;
  onOpen: () => void;
  highlighted: boolean;
  onHover: (on: boolean) => void;
}) {
  const rankTrail =
    leg.startRank && leg.endRank
      ? `${formatRank(leg.startRank)} → ${formatRank(leg.endRank)}`
      : leg.endRank
        ? formatRank(leg.endRank)
        : "No rank stamp";

  return (
    <button
      type="button"
      className={`climb-leg${highlighted ? " is-hot" : ""}`}
      onClick={onOpen}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      title="Open this deck in My Stats"
    >
      <span className="climb-leg-idx" style={{ background: deckSwatch(leg.deckKey) }}>
        {index + 1}
      </span>
      <span className="climb-leg-body">
        <span className="climb-leg-name">{leg.deckName}</span>
        <span className="climb-leg-rank">{rankTrail}</span>
        <span className="climb-leg-meta">
          {leg.wins}W {leg.losses}L
          {leg.rate != null && (
            <strong className={`favor-${winrateFavor(leg.rate)}`}>
              {" "}
              {(leg.rate * 100).toFixed(0)}%
            </strong>
          )}
          {" · "}
          {leg.matches} game{leg.matches === 1 ? "" : "s"}
          {" · "}
          {timeAgo(leg.endAt)}
        </span>
      </span>
      <span
        className={`climb-leg-delta${
          leg.delta == null
            ? " muted"
            : leg.delta > 0
              ? " up"
              : leg.delta < 0
                ? " down"
                : " muted"
        }`}
      >
        {leg.delta == null
          ? "—"
          : leg.delta === 0
            ? "flat"
            : `${leg.delta > 0 ? "▲" : "▼"} ${Math.abs(leg.delta).toFixed(leg.delta % 1 ? 1 : 0)}`}
      </span>
    </button>
  );
}

function DeckClimbRow({
  d,
  onOpen,
  highlighted,
  onHover,
}: {
  d: DeckClimbSummary;
  onOpen: () => void;
  highlighted: boolean;
  onHover: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`climb-deck-card${highlighted ? " is-hot" : ""}`}
      onClick={onOpen}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <span className="climb-deck-swatch" style={{ background: deckSwatch(d.key) }} />
      <span className="climb-deck-main">
        <span className="climb-deck-title">{d.name}</span>
        <span className="climb-deck-sub">
          {d.startRank && d.endRank
            ? `${formatRank(d.startRank)} → ${formatRank(d.endRank)}`
            : d.endRank
              ? formatRank(d.endRank)
              : "No rank stamps"}
          {d.legs > 1 ? ` · ${d.legs} stretches` : ""}
        </span>
      </span>
      <span className="climb-deck-wr">
        <span className="mu-track climb-deck-track">
          <span
            className={`mu-fill favor-${winrateFavor(d.rate ?? 0)}`}
            style={{ width: `${Math.max(4, (d.rate ?? 0) * 100)}%` }}
          />
        </span>
        <span>
          {d.wins}W {d.losses}L
          {d.rate != null && (
            <strong className={`favor-${winrateFavor(d.rate)}`}>
              {" "}
              {(d.rate * 100).toFixed(0)}%
            </strong>
          )}
        </span>
      </span>
      <span
        className={`climb-deck-delta${
          d.delta > 0 ? " up" : d.delta < 0 ? " down" : " muted"
        }`}
      >
        {d.delta > 0 ? "▲" : d.delta < 0 ? "▼" : "·"}{" "}
        {d.delta === 0
          ? "flat"
          : `${Math.abs(d.delta).toFixed(d.delta % 1 ? 1 : 0)} step`}
      </span>
      <span className="climb-deck-go">Stats →</span>
    </button>
  );
}

/** One metric in the season-over-season comparison row. */
function SeasonCompareCell({
  label,
  now,
  deltaNum,
  deltaSuffix,
}: {
  label: string;
  now: string;
  deltaNum: number | null;
  deltaSuffix: string;
}) {
  const cls =
    deltaNum == null || deltaNum === 0
      ? "text-muted"
      : deltaNum > 0
        ? "favor-favored"
        : "favor-unfavored";
  const delta =
    deltaNum == null
      ? "—"
      : `${deltaNum > 0 ? "+" : ""}${deltaNum}${deltaSuffix ? ` ${deltaSuffix}` : ""}`;
  return (
    <div className="season-compare-cell">
      <span className="season-compare-label">{label}</span>
      <strong className="season-compare-now">{now}</strong>
      <span className={`season-compare-delta ${cls}`}>{delta}</span>
    </div>
  );
}

export function Climb() {
  const matches = useAppStore((s) => s.trackerMatches);
  const refreshTracker = useAppStore((s) => s.refreshTracker);
  const openStatsDeck = useAppStore((s) => s.openStatsDeck);
  const [season, setSeason] = useState<string | null>(null);
  const [hoverDeck, setHoverDeck] = useState<string | null>(null);

  useEffect(() => {
    void refreshTracker();
  }, [refreshTracker]);

  const seasons = useMemo(
    () => [...new Set(matches.map((m) => seasonKeyOf(m.endedAt)))].sort().reverse(),
    [matches],
  );
  const seasonKey =
    season ?? (seasons.includes(currentSeasonKey()) ? currentSeasonKey() : "all");

  const seasonMatches = useMemo(
    () =>
      seasonKey === "all"
        ? matches
        : matches.filter((m) => seasonKeyOf(m.endedAt) === seasonKey),
    [matches, seasonKey],
  );

  // Rank series with deck identity attached for chart color + tooltips.
  const series = useMemo(() => {
    const enriched = seasonMatches.map((m) => ({
      endedAt: m.endedAt,
      matchId: m.matchId,
      myRank: m.myRank,
      deckKey: deckKey(m),
      deckName: m.deckName,
      result: m.result,
    }));
    return buildRankSeries(enriched);
  }, [seasonMatches]);

  const overall = useMemo(() => tally(seasonMatches), [seasonMatches]);
  const estimate = useMemo(
    () => estimateMatchesPerStep(seasonMatches),
    [seasonMatches],
  );
  const decks = useMemo(() => deckClimbSummaries(seasonMatches), [seasonMatches]);
  const legs = useMemo(() => buildClimbLegs(seasonMatches), [seasonMatches]);

  const current = series.length ? series[series.length - 1].rank : null;
  const peak = series.length
    ? series.reduce((best, p) => (p.rank.score > best.rank.score ? p : best), series[0]).rank
    : null;
  const start = series.length ? series[0].rank : null;
  const seasonDelta = current && start ? current.score - start.score : null;

  const nextLabel = current ? nextRankLabel(current) : null;
  const matchesToNext =
    current && nextLabel ? Math.max(1, Math.ceil(estimate.matchesPerStep)) : null;

  const last10 = seasonMatches
    .filter((m) => m.result === "win" || m.result === "loss")
    .slice(0, 10);
  const form = tally(last10);

  const streak = useMemo(() => currentStreak(seasonMatches), [seasonMatches]);
  const bestWinStreak = useMemo(
    () => longestStreak(seasonMatches, "win"),
    [seasonMatches],
  );
  const prevSeason = useMemo(
    () => (seasonKey === "all" ? null : previousSeasonSummary(matches, seasonKey)),
    [matches, seasonKey],
  );

  const goDeck = (key: string) => openStatsDeck(key);

  if (matches.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <div className="panel">
          <p className="eyebrow">Climb Tracker</p>
          <h2 className="text-xl font-semibold m-0 tracking-tight">Climb with a deck story</h2>
          <p className="text-sm text-muted m-0 mt-2 leading-relaxed max-w-xl">
            See which list carried each stretch of the ladder — then open that deck in My Stats
            with one click. Rank graph, peak vs current, and games-to-next-rank from your own
            history.
          </p>
        </div>
        <div className="panel">
          <TrackerOnboarding />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="panel lab-intro">
        <div>
          <p className="eyebrow m-0">Climb Tracker</p>
          <h2 className="text-lg font-semibold m-0 tracking-tight">Rank path by deck</h2>
          <p className="text-sm text-muted m-0 mt-1 leading-relaxed">
            Hover the curve for rank + deck. Click a stretch or deck row to open{" "}
            <strong className="text-foam">My Stats</strong> for that list.
          </p>
          <div className="share-row mt-2">
            <ShareActionButton
              label="Share climb story"
              detail="Rank path card for this season — branded PNG"
              onShare={() => downloadClimbSharePng(matches, seasonKey)}
            />
          </div>
        </div>
        <div className="lab-intro-stats">
          <div>
            <strong className="text-gold-300">{current ? formatRank(current) : "—"}</strong>
            <span>current</span>
          </div>
          <div>
            <strong>{peak ? formatRank(peak) : "—"}</strong>
            <span>peak</span>
          </div>
          <div>
            <strong
              className={
                seasonDelta == null
                  ? ""
                  : seasonDelta > 0
                    ? "favor-favored"
                    : seasonDelta < 0
                      ? "favor-unfavored"
                      : ""
              }
            >
              {seasonDelta == null
                ? "—"
                : `${seasonDelta > 0 ? "+" : ""}${seasonDelta.toFixed(seasonDelta % 1 ? 1 : 0)}`}
            </strong>
            <span>steps</span>
          </div>
        </div>
      </div>

      {seasons.length > 1 && (
        <div className="filter-bar mb-0">
          {seasons.map((s) => (
            <button
              key={s}
              type="button"
              className={`filter-chip${seasonKey === s ? " active" : ""}`}
              onClick={() => setSeason(s)}
            >
              {seasonLabel(s)}
            </button>
          ))}
          <button
            type="button"
            className={`filter-chip${seasonKey === "all" ? " active" : ""}`}
            onClick={() => setSeason("all")}
          >
            All time
          </button>
        </div>
      )}

      <div className="stat-tiles climb-tiles">
        <div className="panel stat-tile">
          <span className="stat-num text-gold-300">
            {current ? formatRank(current) : "—"}
          </span>
          <span className="stat-label">
            Current{series.length ? ` · ${timeAgo(series[series.length - 1].at)}` : ""}
          </span>
        </div>
        <div className="panel stat-tile">
          <span className="stat-num">{peak ? formatRank(peak) : "—"}</span>
          <span className="stat-label">Peak in range</span>
        </div>
        <div className="panel stat-tile">
          {overall.rate != null ? (
            <CountUp
              className={`stat-num favor-${winrateFavor(overall.rate)}`}
              value={overall.rate * 100}
              decimals={0}
              suffix="%"
            />
          ) : (
            <span className="stat-num">—</span>
          )}
          <span className="stat-label">
            Season WR · {overall.wins}W {overall.losses}L
          </span>
        </div>
        <div className="panel stat-tile">
          <span className="stat-num">
            {matchesToNext != null ? `~${matchesToNext}` : current?.tier === "Mythic" ? "∞" : "—"}
          </span>
          <span className="stat-label">
            {nextLabel
              ? `Matches to ${nextLabel}`
              : current?.tier === "Mythic"
                ? "Mythic — no next step"
                : "Matches to next rank"}
            {estimate.source === "history" && matchesToNext != null ? " · from your climb" : ""}
          </span>
        </div>
      </div>

      <div className="panel">
        <h3 className="dash-title">Rank over time</h3>
        <RankChart
          series={series}
          highlightDeckKey={hoverDeck}
          onOpenDeck={goDeck}
        />
        {start && current && (
          <p className="text-xs text-muted m-0 mt-2">
            Started at <strong className="text-foam">{formatRank(start)}</strong>
            {series.length > 1 && (
              <>
                {" "}
                · {series.length} rank samples ·{" "}
                {seasonDelta != null && seasonDelta >= 0 ? "up" : "down"}{" "}
                {seasonDelta != null ? Math.abs(seasonDelta).toFixed(seasonDelta % 1 ? 1 : 0) : "0"}{" "}
                step{Math.abs(seasonDelta ?? 0) === 1 ? "" : "s"}
                {legs.length > 0 && (
                  <>
                    {" "}
                    · {legs.length} deck stretch{legs.length === 1 ? "" : "es"}
                  </>
                )}
              </>
            )}
          </p>
        )}
      </div>

      {legs.length > 0 && (
        <div className="panel">
          <h3 className="dash-title">Climb path</h3>
          <p className="text-xs text-muted m-0 mb-3 leading-relaxed">
            Chronological stretches on each deck — what you piloted from{" "}
            {start ? formatRank(start) : "start"} to{" "}
            {current ? formatRank(current) : "now"}. Click any stretch for full deck stats.
          </p>
          <div className="climb-leg-list">
            {legs.map((leg, i) => (
              <LegCard
                key={`${leg.deckKey}-${leg.startAt}-${i}`}
                leg={leg}
                index={i}
                onOpen={() => goDeck(leg.deckKey)}
                highlighted={hoverDeck === leg.deckKey}
                onHover={(on) => setHoverDeck(on ? leg.deckKey : null)}
              />
            ))}
          </div>
        </div>
      )}

      {form.decided > 0 && (
        <div className="panel">
          <h3 className="dash-title">Recent form · last {form.decided}</h3>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="wl-dots">
              {last10.map((m) => (
                <button
                  key={m.matchId}
                  type="button"
                  className={`wl-dot ${m.result} climb-form-dot`}
                  title={`${m.result} · ${m.deckName ?? "?"} · ${m.myRank ?? "no rank"} · ${timeAgo(m.endedAt)} — open deck`}
                  onClick={() => goDeck(deckKey(m))}
                />
              ))}
            </span>
            <span className="text-sm">
              {form.wins}W {form.losses}L
              {form.rate != null && (
                <strong className={`favor-${winrateFavor(form.rate)}`}>
                  {" "}
                  {(form.rate * 100).toFixed(0)}%
                </strong>
              )}
            </span>
            {streak.length >= 2 && (
              <span
                className={`climb-streak ${streak.type === "win" ? "streak-win" : "streak-loss"}`}
              >
                {streak.length}
                {streak.type === "win" ? "W" : "L"} streak
              </span>
            )}
          </div>
          {streak.type === "loss" && streak.length >= 3 && (
            <p className="text-xs text-muted m-0 mt-2 leading-relaxed">
              {streak.length} losses in a row — the ladder protects your rank inside a tier, but a
              short break or a deck switch often resets tilt better than one more queue.
            </p>
          )}
          {streak.type === "win" &&
            bestWinStreak >= 3 &&
            streak.length === bestWinStreak && (
              <p className="text-xs text-muted m-0 mt-2 leading-relaxed">
                {streak.length}-win streak — your best run this range. Ride it.
              </p>
            )}
        </div>
      )}

      {prevSeason && (overall.decided > 0 || prevSeason.rate != null) && (
        <div className="panel">
          <h3 className="dash-title">
            {seasonLabel(seasonKey)} vs {seasonLabel(prevSeason.seasonKey)}
          </h3>
          <div className="season-compare">
            <SeasonCompareCell
              label="Win rate"
              now={overall.rate != null ? `${(overall.rate * 100).toFixed(0)}%` : "—"}
              deltaNum={
                overall.rate != null && prevSeason.rate != null
                  ? Math.round((overall.rate - prevSeason.rate) * 100)
                  : null
              }
              deltaSuffix="pts"
            />
            <SeasonCompareCell
              label="Peak rank"
              now={peak ? formatRank(peak) : "—"}
              deltaNum={
                peak && prevSeason.peakScore != null
                  ? Math.round((peak.score - prevSeason.peakScore) * 10) / 10
                  : null
              }
              deltaSuffix="steps"
            />
            <SeasonCompareCell
              label="Games"
              now={String(overall.decided)}
              deltaNum={overall.decided - (prevSeason.wins + prevSeason.losses)}
              deltaSuffix=""
            />
          </div>
        </div>
      )}

      <div className="panel">
        <h3 className="dash-title">Decks that climb</h3>
        <p className="text-xs text-muted m-0 mb-3 leading-relaxed">
          Rank step change is first→last stamp while on that deck. Click a row to open full deck
          stats (curve, list, match history).
        </p>
        {decks.length === 0 ? (
          <p className="text-sm text-muted m-0">No deck data in this range.</p>
        ) : (
          <div className="climb-deck-list">
            {decks.map((d) => (
              <DeckClimbRow
                key={d.key}
                d={d}
                onOpen={() => goDeck(d.key)}
                highlighted={hoverDeck === d.key}
                onHover={(on) => setHoverDeck(on ? d.key : null)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { useMemo, useRef, useState } from "react";
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
  parseRank,
  rankLabelFromScore,
  winrateFavor,
  type RankPoint,
} from "../services/ranks";
import type { TrackedMatch } from "../types/tracker";

function tally(matches: TrackedMatch[]) {
  const wins = matches.filter((m) => m.result === "win").length;
  const losses = matches.filter((m) => m.result === "loss").length;
  const decided = wins + losses;
  return { wins, losses, decided, rate: decided > 0 ? wins / decided : null };
}

/**
 * Monotone cubic (Fritsch–Carlson) path through points. Smooths the curve
 * without overshooting past any data point, so ranks never appear to dip
 * below/above values that were actually hit.
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

function RankChart({ series }: { series: RankPoint[] }) {
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

  // One label per whole rank step; thin them out when the range is tall.
  let step = 1;
  while ((hi - lo) / step > 6) step *= 2;
  const yTicks: { s: number; label: string; y: number }[] = [];
  for (let s = lo; s <= hi; s += step) {
    if (s > 20) break; // no labels above Mythic
    yTicks.push({ s, label: rankLabelFromScore(s), y: yOf(s) });
  }

  // 4 date ticks across the time span (fewer when everything is one day).
  const dayMs = 86_400_000;
  const nX = spanT < dayMs ? 2 : 4;
  const xTicks = Array.from({ length: nX }, (_, i) => {
    const t = minT + (spanT * i) / (nX - 1);
    return { t, x: xOf(t), label: new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" }) };
  });

  // Dots only where the rank actually changed (plus endpoints) — a plateau
  // of identical samples reads as a clean line instead of a bead chain.
  const dotIdx: number[] = [];
  for (let i = 0; i < series.length; i++) {
    if (
      i === 0 ||
      i === series.length - 1 ||
      series[i].rank.score !== series[i - 1].rank.score
    ) {
      dotIdx.push(i);
    }
  }
  const dotR = dotIdx.length > 40 ? 2 : 3;

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
  const tipText = hovered
    ? `${formatRank(hovered.rank)} · ${new Date(hovered.at).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}`
    : "";
  const tipW = tipText.length * 6.4 + 16;
  const tipX = hoverPt ? Math.min(Math.max(hoverPt.x - tipW / 2, padL), w - padR - tipW) : 0;
  const tipY = hoverPt ? (hoverPt.y - 34 < padT ? hoverPt.y + 14 : hoverPt.y - 34) : 0;

  return (
    <div className="climb-chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        className="climb-svg"
        role="img"
        aria-label="Rank over time"
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

        {dotIdx.map((i) =>
          i === lastIdx ? null : (
            <circle
              key={series[i].matchId}
              cx={pts[i].x}
              cy={pts[i].y}
              r={dotR}
              className="climb-dot"
            />
          ),
        )}

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
          <circle className="climb-now-dot" cx={pts[lastIdx].x} cy={pts[lastIdx].y} r={4} />
        </g>

        {hoverPt && (
          <g className="climb-hover">
            <line x1={hoverPt.x} x2={hoverPt.x} y1={padT} y2={baseline} className="climb-cross" />
            <circle cx={hoverPt.x} cy={hoverPt.y} r={4.5} className="climb-hover-dot" />
            <g transform={`translate(${tipX.toFixed(1)} ${tipY.toFixed(1)})`}>
              <rect width={tipW} height={20} rx={6} className="climb-tip-bg" />
              <text x={tipW / 2} y={13.5} textAnchor="middle" className="climb-tip-text">
                {tipText}
              </text>
            </g>
          </g>
        )}
      </svg>
    </div>
  );
}

interface DeckClimb {
  key: string;
  name: string;
  matches: number;
  wins: number;
  losses: number;
  rate: number | null;
  /** Net rank score change across matches with this deck that had rank stamps nearby. */
  delta: number;
}

function deckClimbStats(matches: TrackedMatch[]): DeckClimb[] {
  // Assign each rank sample to the deck of that match; delta = score change to next sample overall
  // attributed proportionally is hard — simpler: for each deck, score of last ranked match with
  // that deck minus first ranked match with that deck, plus winrate as secondary.
  const byDeck = new Map<string, TrackedMatch[]>();
  for (const m of matches) {
    const k = deckKey(m);
    let list = byDeck.get(k);
    if (!list) {
      list = [];
      byDeck.set(k, list);
    }
    list.push(m);
  }

  const out: DeckClimb[] = [];
  for (const [key, list] of byDeck) {
    const t = tally(list);
    const ranked = list
      .filter((m) => parseRank(m.myRank))
      .sort((a, b) => a.endedAt - b.endedAt);
    let delta = 0;
    if (ranked.length >= 2) {
      const first = parseRank(ranked[0].myRank)!;
      const last = parseRank(ranked[ranked.length - 1].myRank)!;
      delta = last.score - first.score;
    }
    out.push({
      key,
      name: list.find((m) => m.deckName)?.deckName ?? "Unknown deck",
      matches: list.length,
      wins: t.wins,
      losses: t.losses,
      rate: t.rate,
      delta,
    });
  }
  return out.sort((a, b) => b.delta - a.delta || (b.rate ?? 0) - (a.rate ?? 0));
}

export function Climb() {
  const matches = useAppStore((s) => s.trackerMatches);
  const status = useAppStore((s) => s.trackerStatus);
  const [season, setSeason] = useState<string | null>(null);

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

  const series = useMemo(() => buildRankSeries(seasonMatches), [seasonMatches]);
  const overall = useMemo(() => tally(seasonMatches), [seasonMatches]);
  const estimate = useMemo(
    () => estimateMatchesPerStep(seasonMatches),
    [seasonMatches],
  );
  const decks = useMemo(() => deckClimbStats(seasonMatches), [seasonMatches]);

  const current = series.length ? series[series.length - 1].rank : null;
  const peak = series.length
    ? series.reduce((best, p) => (p.rank.score > best.rank.score ? p : best), series[0]).rank
    : null;
  const start = series.length ? series[0].rank : null;
  const seasonDelta =
    current && start ? current.score - start.score : null;

  const nextLabel = current ? nextRankLabel(current) : null;
  const matchesToNext =
    current && nextLabel
      ? Math.max(1, Math.ceil(estimate.matchesPerStep))
      : null;

  // Recent form (last 10 decided)
  const last10 = seasonMatches
    .filter((m) => m.result === "win" || m.result === "loss")
    .slice(0, 10);
  const form = tally(last10);

  if (matches.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <div className="panel">
          <p className="eyebrow">Climb Tracker</p>
          <h2 className="text-xl font-semibold m-0 tracking-tight">Watch the rank move</h2>
          <p className="text-sm text-muted m-0 mt-2 leading-relaxed max-w-xl">
            Season rank graph, peak vs current, games-to-next-rank estimates, and which of your
            decks actually push you up the ladder. Built from Arena ranks stamped on your matches.
          </p>
        </div>
        {status?.logFound && status.detailedLogs !== false ? (
          <div className="empty-state">
            <h2 className="text-lg font-semibold m-0 mb-2">No matches yet</h2>
            <p className="text-sm text-muted max-w-md mx-auto leading-relaxed">
              Play ranked with Filthy Net Deck open — rank samples appear as matches complete.
            </p>
          </div>
        ) : (
          <div className="panel">
            <p className="text-sm text-muted m-0 leading-relaxed">
              Climb needs the desktop tracker. Check <strong className="text-foam">My Stats</strong>{" "}
              for Arena log status.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="panel lab-intro">
        <div>
          <p className="eyebrow m-0">Climb Tracker</p>
          <h2 className="text-lg font-semibold m-0 tracking-tight">Rank path this season</h2>
          <p className="text-sm text-muted m-0 mt-1 leading-relaxed">
            Every rank Arena stamps on a match becomes a point on the curve. Estimates use your
            own step history when possible — not a global formula.
          </p>
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
          <span
            className={`stat-num ${overall.rate != null ? `favor-${winrateFavor(overall.rate)}` : ""}`}
          >
            {overall.rate != null ? `${(overall.rate * 100).toFixed(0)}%` : "—"}
          </span>
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
        <RankChart series={series} />
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
              </>
            )}
          </p>
        )}
      </div>

      {form.decided > 0 && (
        <div className="panel">
          <h3 className="dash-title">Recent form · last {form.decided}</h3>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="wl-dots">
              {last10.map((m) => (
                <span
                  key={m.matchId}
                  className={`wl-dot ${m.result}`}
                  title={`${m.result} · ${m.deckName ?? "?"} · ${timeAgo(m.endedAt)}`}
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
          </div>
        </div>
      )}

      <div className="panel">
        <h3 className="dash-title">Decks that climb</h3>
        {decks.length === 0 ? (
          <p className="text-sm text-muted m-0">No deck data in this range.</p>
        ) : (
          <div className="meta-bars">
            {decks.map((d) => (
              <div key={d.key} className="meta-bar-row deck-wr-row climb-deck-row">
                <span className="meta-bar-label">
                  <span className="meta-bar-name" title={d.name}>
                    {d.name}
                  </span>
                  <span className="text-muted text-[11px]">{d.matches} games</span>
                </span>
                <span className="mu-track">
                  <span
                    className={`mu-fill favor-${winrateFavor(d.rate ?? 0)}`}
                    style={{
                      width: `${Math.max(4, (d.rate ?? 0) * 100)}%`,
                      display: "block",
                    }}
                  />
                </span>
                <span className="deck-wr-score">
                  {d.wins}W {d.losses}L
                  {d.rate != null && (
                    <strong className={`favor-${winrateFavor(d.rate)}`}>
                      {" "}
                      {(d.rate * 100).toFixed(0)}%
                    </strong>
                  )}
                  <span
                    className={
                      d.delta > 0
                        ? "favor-favored"
                        : d.delta < 0
                          ? "favor-unfavored"
                          : "text-muted"
                    }
                    style={{ marginLeft: "0.35rem" }}
                  >
                    {d.delta > 0 ? "▲" : d.delta < 0 ? "▼" : "·"}{" "}
                    {d.delta === 0
                      ? "flat"
                      : `${Math.abs(d.delta).toFixed(d.delta % 1 ? 1 : 0)} step`}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted m-0 mt-2">
          Step change is first→last rank sample while on that deck. Win rate fills the bar.
        </p>
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
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

function RankChart({ series }: { series: RankPoint[] }) {
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

  const padX = 28;
  const padY = 18;
  const w = 640;
  const h = 200;
  const scores = series.map((p) => p.rank.score);
  let minS = Math.min(...scores);
  let maxS = Math.max(...scores);
  if (maxS - minS < 1) {
    minS = Math.max(0, minS - 1);
    maxS = maxS + 1;
  }
  const minT = series[0].at;
  const maxT = series[series.length - 1].at;
  const spanT = Math.max(1, maxT - minT);

  const xOf = (t: number) => padX + ((t - minT) / spanT) * (w - padX * 2);
  const yOf = (s: number) => padY + (1 - (s - minS) / (maxS - minS)) * (h - padY * 2);

  const line = series
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(p.at).toFixed(1)} ${yOf(p.rank.score).toFixed(1)}`)
    .join(" ");

  // Area under the curve
  const area =
    line +
    ` L ${xOf(series[series.length - 1].at).toFixed(1)} ${(h - padY).toFixed(1)}` +
    ` L ${xOf(series[0].at).toFixed(1)} ${(h - padY).toFixed(1)} Z`;

  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => {
    const s = minS + ((maxS - minS) * i) / yTicks;
    return { s, label: rankLabelFromScore(s), y: yOf(s) };
  });

  return (
    <div className="climb-chart">
      <svg viewBox={`0 0 ${w} ${h}`} className="climb-svg" role="img" aria-label="Rank over time">
        {ticks.map((t) => (
          <g key={t.s}>
            <line
              x1={padX}
              x2={w - padX}
              y1={t.y}
              y2={t.y}
              className="climb-grid"
            />
            <text x={4} y={t.y + 3} className="climb-axis">
              {t.label}
            </text>
          </g>
        ))}
        <path d={area} className="climb-area" />
        <path d={line} className="climb-line" fill="none" />
        {series.map((p) => (
          <circle
            key={p.matchId}
            cx={xOf(p.at)}
            cy={yOf(p.rank.score)}
            r={series.length > 40 ? 2.5 : 3.5}
            className="climb-dot"
          >
            <title>
              {formatRank(p.rank)} · {new Date(p.at).toLocaleString()}
            </title>
          </circle>
        ))}
      </svg>
      <div className="climb-chart-foot">
        <span>{new Date(series[0].at).toLocaleDateString()}</span>
        <span>{new Date(series[series.length - 1].at).toLocaleDateString()}</span>
      </div>
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

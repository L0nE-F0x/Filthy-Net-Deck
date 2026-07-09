import type { Deck, FormatMeta } from "../types/meta";

export function MetaShareBars({ decks }: { decks: Deck[] }) {
  const max = Math.max(1, ...decks.map((d) => d.metaShare ?? 0));
  return (
    <div className="meta-bars">
      {decks.map((d) => {
        const pct = d.metaShare ?? 0;
        return (
          <div key={d.id} className="meta-bar-row">
            <div className="meta-bar-label" title={d.name}>
              <span className="meta-bar-rank">#{d.rank ?? "—"}</span>
              <span className="meta-bar-name">{d.name}</span>
            </div>
            <div className="meta-bar-track">
              <div
                className="meta-bar-fill"
                style={{ width: `${(pct / max) * 100}%` }}
              />
            </div>
            <div className="meta-bar-pct">{pct ? `${pct}%` : "—"}</div>
          </div>
        );
      })}
    </div>
  );
}

export function TierDonut({ decks }: { decks: Deck[] }) {
  const t1 = decks.filter((d) => d.tier === 1).length;
  const t2 = decks.filter((d) => d.tier === 2).length;
  const t3 = decks.filter((d) => d.tier === 3).length;
  const total = Math.max(1, t1 + t2 + t3);
  const p1 = (t1 / total) * 100;
  const p2 = (t2 / total) * 100;
  // conic: gold, azure, muted
  const gradient = `conic-gradient(
    var(--color-gold-500) 0% ${p1}%,
    var(--color-azure-500) ${p1}% ${p1 + p2}%,
    var(--color-ink-600) ${p1 + p2}% 100%
  )`;
  return (
    <div className="tier-donut-wrap">
      <div className="tier-donut" style={{ background: gradient }} />
      <div className="tier-donut-legend">
        <span>
          <i className="dot t1" /> Tier 1 · {t1}
        </span>
        <span>
          <i className="dot t2" /> Tier 2 · {t2}
        </span>
        <span>
          <i className="dot t3" /> Tier 3 · {t3}
        </span>
      </div>
    </div>
  );
}

export function ColorIdentityBars({ decks }: { decks: Deck[] }) {
  const counts: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  for (const d of decks) {
    if (!d.colors.length) counts.C += 1;
    for (const c of d.colors) counts[c] = (counts[c] ?? 0) + 1;
  }
  const max = Math.max(1, ...Object.values(counts));
  const order = ["W", "U", "B", "R", "G", "C"];
  const labels: Record<string, string> = {
    W: "White",
    U: "Blue",
    B: "Black",
    R: "Red",
    G: "Green",
    C: "Colorless",
  };
  return (
    <div className="color-id-bars">
      {order.map((c) => (
        <div key={c} className="color-id-col" title={`${labels[c]}: ${counts[c]} decks`}>
          <div className="color-id-track">
            <div
              className={`color-id-fill pip-${c.toLowerCase()}`}
              style={{ height: `${(counts[c] / max) * 100}%` }}
            />
          </div>
          <span className="color-id-label">{c}</span>
          <span className="color-id-n">{counts[c] || ""}</span>
        </div>
      ))}
    </div>
  );
}

export function AnalysisPanel({
  fmt,
  decks,
  mode,
}: {
  fmt: FormatMeta;
  decks: Deck[];
  mode: "bo1" | "bo3";
}) {
  const top = decks[0];
  const avgShare =
    decks.reduce((s, d) => s + (d.metaShare ?? 0), 0) / Math.max(1, decks.length);
  const aggressive = decks.filter((d) =>
    /prowess|aggro|landfall|tempo|spells|spellemental|heroic|burn/i.test(d.name + d.archetype),
  ).length;
  const controlling = decks.filter((d) =>
    /control|midrange|domain|lessons|excruciator|beanstalk/i.test(d.name + d.archetype),
  ).length;
  const modeHint =
    mode === "bo1"
      ? "Bo1 rewards consistency and linear plans — expect faster shells higher on the list."
      : "Bo3 rewards interaction and sideboards — control and midrange climb when they have answers.";

  const bullets: string[] = [];
  if (top) {
    bullets.push(
      `${top.name} leads today’s ${mode.toUpperCase()} board${top.metaShare != null ? ` at ~${top.metaShare}% meta share` : ""}.`,
    );
  }
  bullets.push(
    `Field texture: ~${aggressive} linear/aggro-leaning vs ~${controlling} midrange/control shells in the top 8.`,
  );
  bullets.push(
    `Average listed share across the 8: ${avgShare.toFixed(1)}% — ${avgShare > 8 ? "concentrated top-heavy meta" : "spread-out / diverse field"}.`,
  );
  if (fmt.metaNotes) bullets.push(fmt.metaNotes);
  bullets.push(modeHint);

  // Matchup matrix teaser from #1 deck
  const mu = top?.matchups ?? [];

  return (
    <div className="analysis-panel">
      <h3 className="analysis-title">Intel brief · {fmt.name}</h3>
      <ul className="analysis-list">
        {bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
      {mu.length > 0 && top && (
        <div className="analysis-mu">
          <div className="text-xs uppercase tracking-wide text-muted mb-2">
            {top.name} · matchup lean
          </div>
          <div className="mu-bars">
            {mu.map((m) => {
              const score =
                m.favor === "favored" ? 75 : m.favor === "even" ? 50 : 25;
              return (
                <div key={m.vs} className="mu-bar-row">
                  <span className="mu-vs">vs {m.vs}</span>
                  <div className="mu-track">
                    <div
                      className={`mu-fill favor-${m.favor}`}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                  <span className={`mu-label favor-${m.favor}`}>{m.favor}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

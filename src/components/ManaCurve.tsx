import { buildManaCurve } from "../services/manaCurve";
import type { CardEntry } from "../types/meta";

export function ManaCurve({ cards }: { cards: CardEntry[] }) {
  const curve = buildManaCurve(cards);
  const max = Math.max(1, ...curve.map((b) => b.count));

  return (
    <div className="mana-curve">
      <div className="mana-curve-bars">
        {curve.map((b) => (
          <div key={b.cmc} className="mana-curve-col" title={`${b.count} at CMC ${b.cmc}${b.cmc === 7 ? "+" : ""}`}>
            <div className="mana-curve-bar-wrap">
              <div
                className="mana-curve-bar"
                style={{ height: `${(b.count / max) * 100}%` }}
              />
            </div>
            <span className="mana-curve-label">{b.cmc === 7 ? "7+" : b.cmc}</span>
            <span className="mana-curve-count">{b.count || ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ColorPie({ colors }: { colors: string[] }) {
  if (!colors.length) {
    return <div className="color-pie mono">Colorless / lands</div>;
  }
  const slice = 100 / colors.length;
  const stops = colors
    .map((c, i) => {
      const hue =
        c === "W"
          ? "#f0e6d0"
          : c === "U"
            ? "#3b82f6"
            : c === "B"
              ? "#1f1f24"
              : c === "R"
                ? "#dc2626"
                : c === "G"
                  ? "#16a34a"
                  : "#94a3b8";
      return `${hue} ${i * slice}% ${(i + 1) * slice}%`;
    })
    .join(", ");
  return (
    <div
      className="color-pie"
      style={{ background: `conic-gradient(${stops})` }}
      title={colors.join(" / ")}
      aria-label={`Colors ${colors.join(" ")}`}
    />
  );
}

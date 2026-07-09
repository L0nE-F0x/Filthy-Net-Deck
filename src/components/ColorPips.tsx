import type { ManaColor } from "../types/meta";
import { colorPipClass } from "../services/scryfall";

export function ColorPips({ colors }: { colors: ManaColor[] }) {
  if (!colors.length) return null;
  return (
    <span className="color-pips" aria-label={`Colors: ${colors.join(", ")}`}>
      {colors.map((c) => (
        <span key={c} className={`pip ${colorPipClass(c)}`} title={c} />
      ))}
    </span>
  );
}

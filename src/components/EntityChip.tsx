import type { ReactNode } from "react";

/** Shared clickable entity presentation (I2). */
export function EntityChip({
  label,
  sub,
  onClick,
  color,
  title,
  muted,
}: {
  label: string;
  sub?: string;
  onClick?: () => void;
  color?: string;
  title?: string;
  muted?: boolean;
}): ReactNode {
  const cls = `entity-chip${onClick ? " is-clickable" : ""}${muted ? " is-muted" : ""}`;
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} title={title ?? label}>
        {color ? <span className="entity-chip-swatch" style={{ background: color }} /> : null}
        <span className="entity-chip-label">{label}</span>
        {sub ? <span className="entity-chip-sub">{sub}</span> : null}
      </button>
    );
  }
  return (
    <span className={cls} title={title ?? label}>
      {color ? <span className="entity-chip-swatch" style={{ background: color }} /> : null}
      <span className="entity-chip-label">{label}</span>
      {sub ? <span className="entity-chip-sub">{sub}</span> : null}
    </span>
  );
}

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export type ShareMenuOption = {
  id: string;
  label: string;
  detail?: string;
  disabled?: boolean;
};

/** Optional status string returned by onPick / onShare (e.g. "Image copied"). */
export type ShareStatus = void | string | { message?: string };

function statusFrom(result: ShareStatus, fallback: string): string {
  if (typeof result === "string" && result.trim()) return result;
  if (result && typeof result === "object" && result.message?.trim()) {
    return result.message;
  }
  return fallback;
}

type Props = {
  /** Primary button label, e.g. "Share deck card". */
  label: string;
  /** Short helper under the button in the closed state (optional). */
  hint?: string;
  options: ShareMenuOption[];
  /**
   * Called with option id; may be async — menu shows busy until settled.
   * Return a string (or `{ message }`) to customize the success status line.
   */
  onPick: (id: string) => ShareStatus | Promise<ShareStatus>;
  /** Visual weight of the trigger. */
  variant?: "primary" | "ghost";
  className?: string;
  /** Optional leading icon glyph (emoji or character). */
  icon?: ReactNode;
};

/**
 * Branded share popover — replaces native <select> (invisible options in dark mode).
 * Use anywhere we generate a PNG / share card.
 */
export function ShareMenu({
  label,
  hint,
  options,
  onPick,
  variant = "ghost",
  className = "",
  icon = "↗",
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (id: string) => {
    setBusy(true);
    setStatus("Rendering…");
    setOpen(false);
    void Promise.resolve(onPick(id))
      .then((r) => setStatus(statusFrom(r, "Saved PNG")))
      .catch((e) =>
        setStatus(e instanceof Error ? e.message : "Could not render"),
      )
      .finally(() => {
        setBusy(false);
        window.setTimeout(() => setStatus(null), 4200);
      });
  };

  return (
    <div className={`share-menu${open ? " is-open" : ""} ${className}`.trim()} ref={rootRef}>
      <button
        type="button"
        className={`btn btn-sm share-menu-trigger ${variant === "primary" ? "btn-primary" : "btn-ghost"}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        disabled={busy || options.length === 0}
        onClick={() => setOpen((v) => !v)}
        title={hint}
      >
        <span className="share-menu-icon" aria-hidden="true">
          {icon}
        </span>
        <span>{busy ? "Rendering…" : label}</span>
        <span className="share-menu-chevron" aria-hidden="true">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {status && <span className="share-menu-status" role="status">{status}</span>}
      {open && (
        <div id={menuId} className="share-menu-panel" role="menu" aria-label={label}>
          {hint && <p className="share-menu-hint">{hint}</p>}
          <ul className="share-menu-list">
            {options.map((opt) => (
              <li key={opt.id}>
                <button
                  type="button"
                  role="menuitem"
                  className="share-menu-item"
                  disabled={opt.disabled || busy}
                  onClick={() => pick(opt.id)}
                >
                  <strong>{opt.label}</strong>
                  {opt.detail && <em>{opt.detail}</em>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Single-action share (theme card, simple one-shot PNG). */
export function ShareActionButton(props: {
  label: string;
  detail?: string;
  onShare: () => ShareStatus | Promise<ShareStatus>;
  variant?: "primary" | "ghost";
  className?: string;
}) {
  // Fire immediately with the same chrome as multi-option share menus.
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  return (
    <div
      className={`share-menu share-menu-single ${props.className ?? ""}`.trim()}
      title={props.detail}
    >
      <button
        type="button"
        className={`btn btn-sm share-menu-trigger ${props.variant === "primary" ? "btn-primary" : "btn-ghost"}`}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setStatus("Rendering…");
          void Promise.resolve(props.onShare())
            .then((r) => setStatus(statusFrom(r, "Saved PNG")))
            .catch((e) =>
              setStatus(e instanceof Error ? e.message : "Could not render"),
            )
            .finally(() => {
              setBusy(false);
              window.setTimeout(() => setStatus(null), 4200);
            });
        }}
      >
        <span className="share-menu-icon" aria-hidden="true">
          ↗
        </span>
        <span>{busy ? "Rendering…" : props.label}</span>
      </button>
      {status && <span className="share-menu-status" role="status">{status}</span>}
    </div>
  );
}

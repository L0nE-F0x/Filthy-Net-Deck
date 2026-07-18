import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { SKINS, type SkinId } from "../services/theme";

/** Tiny sidebar control → planeswalker accent skins (orthogonal to dark/light). */
export function PlaneswalkerThemes() {
  const skin = useAppStore((s) => s.prefs.skin);
  const setSkin = useAppStore((s) => s.setSkin);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  const pick = (id: SkinId) => {
    setSkin(id);
    setOpen(false);
  };

  const current = SKINS.find((s) => s.id === skin) ?? SKINS[0];

  return (
    <div className="pw-themes" ref={rootRef}>
      <button
        type="button"
        className={`pw-themes-btn${open ? " is-open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Themes · ${current.name}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="pw-themes-swatches" aria-hidden="true">
          {current.swatches.map((c) => (
            <i key={c} style={{ background: c }} />
          ))}
        </span>
        Themes
      </button>

      {open && (
        <div className="pw-themes-menu" role="menu" aria-label="Planeswalker themes">
          <p className="pw-themes-menu-head">
            Planeswalker themes
            <span>Dark / Light still apply</span>
          </p>
          <ul className="pw-themes-list">
            {SKINS.map((s) => {
              const active = s.id === skin;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    className={`pw-themes-option${active ? " is-active" : ""}`}
                    onClick={() => pick(s.id)}
                  >
                    <span className="pw-themes-option-swatches" aria-hidden="true">
                      {s.swatches.map((c) => (
                        <i key={c} style={{ background: c }} />
                      ))}
                    </span>
                    <span className="pw-themes-option-copy">
                      <strong>{s.name}</strong>
                      <em>{s.walker}</em>
                      <span>{s.blurb}</span>
                    </span>
                    {active ? <span className="pw-themes-check">✓</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

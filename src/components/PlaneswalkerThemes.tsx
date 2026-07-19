import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { SKINS, type SkinId } from "../services/theme";
import { downloadThemeSharePng } from "../services/shareCards";

/**
 * Sidebar themes control. Expands inline inside the sidebar only —
 * never as a floating panel over the main content.
 */
export function PlaneswalkerThemes() {
  const skin = useAppStore((s) => s.prefs.skin);
  const setSkin = useAppStore((s) => s.setSkin);
  const [open, setOpen] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
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
    <div className={`pw-themes${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className={`pw-themes-btn${open ? " is-open" : ""}`}
        aria-expanded={open}
        aria-controls="pw-themes-panel"
        title={`Themes · ${current.name}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="pw-themes-swatches" aria-hidden="true">
          {current.swatches.map((c) => (
            <i key={c} style={{ background: c }} />
          ))}
        </span>
        <span className="pw-themes-btn-label">
          Themes
          <em>{current.name}</em>
        </span>
        <span className="pw-themes-chevron" aria-hidden="true">
          {open ? "▾" : "▴"}
        </span>
      </button>

      {open && (
        <div
          id="pw-themes-panel"
          className="pw-themes-panel"
          role="listbox"
          aria-label="Planeswalker themes"
        >
          <p className="pw-themes-hint">Dark / Light still apply</p>
          <ul className="pw-themes-list">
            {SKINS.map((s) => {
              const active = s.id === skin;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`pw-themes-option${active ? " is-active" : ""}`}
                    title={s.blurb}
                    onClick={() => pick(s.id)}
                  >
                    <span className="pw-themes-option-swatches" aria-hidden="true">
                      {s.swatches.map((c) => (
                        <i key={c} style={{ background: c }} />
                      ))}
                    </span>
                    <span className="pw-themes-option-copy">
                      <strong>
                        {s.name}
                        {active ? <span className="pw-themes-check"> ✓</span> : null}
                      </strong>
                      <span className="pw-themes-option-blurb">{s.blurb}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="pw-themes-share">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setShareMsg("…");
                void downloadThemeSharePng(skin)
                  .then(() => setShareMsg("PNG saved"))
                  .catch(() => setShareMsg("Failed"));
              }}
            >
              Share {current.name} card
            </button>
            {shareMsg && <span className="pw-themes-share-msg">{shareMsg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

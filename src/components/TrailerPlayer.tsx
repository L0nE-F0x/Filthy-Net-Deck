import { useEffect, useRef, type ReactNode } from "react";
import {
  type SetTrailer,
  youtubeEmbedUrl,
  youtubeWatchUrl,
} from "../services/setTrailers";
import { openExternal } from "../services/openExternal";

export function TrailerPlayer({
  trailer,
  setName,
  onClose,
}: {
  trailer: SetTrailer;
  setName: string;
  onClose: () => void;
}): ReactNode {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  const title = trailer.title || `${setName} — Official trailer`;

  return (
    <div
      className="trailer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="trailer-panel"
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="trailer-head">
          <div className="trailer-head-copy">
            <span className="trailer-eyebrow">Official WotC trailer</span>
            <h3 className="trailer-title">{title}</h3>
            <p className="trailer-sub">{setName}</p>
          </div>
          <div className="trailer-head-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void openExternal(youtubeWatchUrl(trailer.youtubeId))}
            >
              YouTube ↗
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm trailer-close"
              onClick={onClose}
              aria-label="Close trailer"
            >
              ✕
            </button>
          </div>
        </header>
        <div className="trailer-frame-wrap">
          <iframe
            className="trailer-frame"
            src={youtubeEmbedUrl(trailer.youtubeId)}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
        <footer className="trailer-foot">
          <span>Press Esc to close · content from Magic: The Gathering on YouTube</span>
        </footer>
      </div>
    </div>
  );
}

/** Compact play chip used on set cards / future rows. */
export function TrailerButton({
  onClick,
  label = "View trailer",
}: {
  onClick: () => void;
  label?: string;
}): ReactNode {
  return (
    <button type="button" className="btn btn-trailer btn-sm" onClick={onClick}>
      <span className="trailer-play-icon" aria-hidden="true">
        ▶
      </span>
      {label}
    </button>
  );
}

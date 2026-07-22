import { useEffect, useState } from "react";
import { resolveImageById, scryfallCdnUrl, type ArtSize } from "../services/scryfall";

/**
 * Card image addressed by scryfall id, with a recovery step.
 *
 * The constructed CDN URL is right ~99% of the time and costs no request. The
 * rare miss (a card whose bare, unversioned path 404s) used to render as a
 * broken-image box; here it retries once through the API, which returns a
 * versioned URL that does resolve, and only then falls back to a placeholder.
 */
export function ScryfallImg({
  scryfallId,
  name,
  size = "normal",
  imageVersion,
  className = "",
  loading,
}: {
  scryfallId: string;
  name: string;
  size?: ArtSize;
  imageVersion?: string | null;
  className?: string;
  loading?: "lazy" | "eager";
}) {
  const [src, setSrc] = useState(() => scryfallCdnUrl(scryfallId, size, imageVersion));
  const [recovering, setRecovering] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSrc(scryfallCdnUrl(scryfallId, size, imageVersion));
    setRecovering(false);
    setFailed(false);
  }, [scryfallId, size, imageVersion]);

  if (failed) {
    return (
      <div className={`card-art-fallback ${className}`} title={`${name} (art unavailable)`}>
        <span>{name.slice(0, 1).toUpperCase()}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      loading={loading}
      className={className || undefined}
      onError={() => {
        // One recovery attempt only — a second error means the API URL failed too.
        if (recovering) {
          setFailed(true);
          return;
        }
        setRecovering(true);
        void resolveImageById(scryfallId, size).then((uri) => {
          if (uri && uri !== src) setSrc(uri);
          else setFailed(true);
        });
      }}
    />
  );
}

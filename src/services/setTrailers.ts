/**
 * Official WotC announce trailers for sets on the radar / Future Standard.
 * Curated only — never invent a video ID. Prefer the Magic: The Gathering
 * YouTube channel. Matched by set code (Scryfall) or exact set name (roadmap).
 *
 * Also mirrored into the sets feed when the pipeline has set-trailers.json;
 * this client map is the fallback for older feeds and offline.
 */

export interface SetTrailer {
  youtubeId: string;
  title: string;
}

/** Known official announce trailers (as of 2026-07-18). */
const BY_CODE: Record<string, SetTrailer> = {
  // Add Scryfall set codes here as trailers ship and we verify them.
};

const BY_NAME: Record<string, SetTrailer> = {
  "nauctis: the sunken realm": {
    youtubeId: "jPaHUxive30",
    title: "Nauctis: Sunken Realm Announce Trailer",
  },
  "kamigawa: titanbreach": {
    youtubeId: "cC6ebvZg-_Q",
    title: "Kamigawa: Titanbreach Announce Trailer",
  },
  zhalfir: {
    youtubeId: "ZaUhdKIc-yQ",
    title: "Zhalfir Announce Trailer",
  },
};

function normName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function trailerForSet(opts: {
  code?: string | null;
  name?: string | null;
  /** Feed-attached trailer wins when present. */
  feedTrailer?: SetTrailer | null;
}): SetTrailer | null {
  if (opts.feedTrailer?.youtubeId) {
    return {
      youtubeId: opts.feedTrailer.youtubeId,
      title: opts.feedTrailer.title || "Official announce trailer",
    };
  }
  if (opts.code) {
    const byCode = BY_CODE[opts.code.toLowerCase()];
    if (byCode) return byCode;
  }
  if (opts.name) {
    const byName = BY_NAME[normName(opts.name)];
    if (byName) return byName;
  }
  return null;
}

/** Privacy-friendly embed URL (no related videos from other channels). */
export function youtubeEmbedUrl(youtubeId: string): string {
  const id = encodeURIComponent(youtubeId);
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&autoplay=1`;
}

export function youtubeWatchUrl(youtubeId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeId)}`;
}

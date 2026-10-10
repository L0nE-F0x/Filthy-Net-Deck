/**
 * Official WotC announce trailers for sets on the radar / Future Standard.
 * Curated only — never invent a video ID. Prefer the Magic: The Gathering
 * YouTube channel. Matched by set code (Scryfall) or exact set name (roadmap).
 *
 * Also mirrored into the sets feed when the pipeline has set-trailers.json;
 * this client map is the fallback for older feeds and offline.
 *
 * Z5 upkeep: when WotC posts a new announce trailer, add it to BY_CODE and/or
 * BY_NAME here (and pipeline set-trailers.json when the feed should carry it).
 * Run setTrailers.test.ts after edits — never invent IDs.
 */

export interface SetTrailer {
  youtubeId: string;
  title: string;
}

/** Known official announce trailers (as of 2026-07-18). */
const BY_CODE: Record<string, SetTrailer> = {
  // Add Scryfall set codes here as trailers ship and we verify them.
  // Verified 2026-10-10 via YouTube oEmbed: author "Magic: The Gathering" (@mtg).
  mdd: {
    youtubeId: "srkVFoW4t08",
    title: "Marvel: Darkhold Destiny Official Announcement",
  },
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

/**
 * Page that redirects into the embed. YouTube error 153 is a missing
 * Referer. Linux and macOS production loads the app from `tauri://`, which
 * sends none, so those builds frame this https page and it steps into the
 * player. `http:` / `https:` pages (dev server, Windows `tauri.localhost`)
 * already send one and embed directly.
 */
export const YOUTUBE_EMBED_BRIDGE = "https://filthy-net-deck.com/yt-embed.html";

/** Privacy-friendly embed URL (no related videos from other channels). */
export function youtubeEmbedUrl(youtubeId: string, pageProtocol?: string): string {
  const id = youtubeId.trim();
  const direct = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0&autoplay=1`;
  const protocol =
    pageProtocol ??
    (typeof location === "undefined" ? "https:" : location.protocol);
  if (protocol === "http:" || protocol === "https:") return direct;
  if (!/^[\w-]{11}$/.test(id)) return direct;
  return `${YOUTUBE_EMBED_BRIDGE}?v=${id}`;
}

export function youtubeWatchUrl(youtubeId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeId)}`;
}

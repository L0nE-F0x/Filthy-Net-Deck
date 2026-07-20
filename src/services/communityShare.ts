/**
 * A5 — close the share loop: PNG save / Discord paste / X compose, with
 * captions that seed the public meta site (SEO funnel).
 *
 * Pure helpers + browser APIs only. No network except opening the system
 * browser for X. Captions never invent stats — callers pass real aggregates.
 */

import { openExternal } from "./openExternal";
import { copyToClipboard } from "./arenaImport";

/** Canonical marketing origin (OG + meta-web live here). */
export const SITE_URL = "https://filthy-net-deck.com";

export const DOWNLOAD_URL = `${SITE_URL}/#download`;

export type ShareDestination = "save" | "copy-image" | "post-x";

export type ShareResult =
  | { ok: true; destination: ShareDestination; message: string }
  | { ok: false; destination: ShareDestination; message: string };

/** Public meta hub for a format (`standard` / `pioneer`). */
export function metaWebFormatUrl(formatId: string): string {
  const id = (formatId || "standard").toLowerCase();
  return `${SITE_URL}/meta-web/${id}.html`;
}

/** Public meta page for one deck id (from today's feed). */
export function metaWebDeckUrl(deckId: string): string {
  return `${SITE_URL}/meta-web/deck/${encodeURIComponent(deckId)}.html`;
}

/** X / Twitter web intent (text only — attach the PNG manually). */
export function xIntentUrl(text: string): string {
  const u = new URL("https://x.com/intent/tweet");
  u.searchParams.set("text", text);
  return u.toString();
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Copy a PNG blob for Discord / chat paste. WebView2 + Chromium support this. */
export async function copyImageToClipboard(
  blob: Blob,
): Promise<"ok" | "unsupported" | "error"> {
  try {
    if (
      typeof ClipboardItem === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.write !== "function"
    ) {
      return "unsupported";
    }
    const png =
      blob.type === "image/png"
        ? blob
        : blob.slice(0, blob.size, "image/png");
    // Chromium accepts a Promise-wrapped blob for ClipboardItem values.
    const item = new ClipboardItem({
      "image/png": Promise.resolve(png),
    });
    await navigator.clipboard.write([item]);
    return "ok";
  } catch {
    return "error";
  }
}

/**
 * Deliver a rendered share card to the chosen destination.
 * For `post-x`: opens compose with caption, and also downloads the PNG so the
 * user can attach it (web intent cannot attach local files).
 */
export async function deliverShare(opts: {
  destination: ShareDestination;
  blob: Blob;
  filename: string;
  caption: string;
}): Promise<ShareResult> {
  const { destination, blob, filename, caption } = opts;

  if (destination === "save") {
    try {
      downloadBlob(blob, filename);
      return {
        ok: true,
        destination,
        message: "Saved PNG — drop it into Discord or X",
      };
    } catch (e) {
      return {
        ok: false,
        destination,
        message: e instanceof Error ? e.message : "Could not save PNG",
      };
    }
  }

  if (destination === "copy-image") {
    const r = await copyImageToClipboard(blob);
    if (r === "ok") {
      return {
        ok: true,
        destination,
        message: "Image copied — paste in Discord",
      };
    }
    // Fallback: still save so the user isn't stuck.
    try {
      downloadBlob(blob, filename);
      return {
        ok: true,
        destination,
        message:
          r === "unsupported"
            ? "Clipboard image unsupported here — PNG saved instead"
            : "Could not copy image — PNG saved instead",
      };
    } catch (e) {
      return {
        ok: false,
        destination,
        message: e instanceof Error ? e.message : "Could not copy or save image",
      };
    }
  }

  // post-x: download + open intent with caption (includes site link).
  try {
    downloadBlob(blob, filename);
  } catch {
    /* still try to open X */
  }
  try {
    await openExternal(xIntentUrl(caption));
    return {
      ok: true,
      destination,
      message: "Opened X — attach the saved PNG",
    };
  } catch (e) {
    return {
      ok: false,
      destination,
      message: e instanceof Error ? e.message : "Could not open X",
    };
  }
}

/** Menu options shared by recap / climb / matchup share menus. */
export function communityShareOptions(extraDetail?: string): {
  id: ShareDestination;
  label: string;
  detail: string;
}[] {
  const seed = extraDetail ? ` · ${extraDetail}` : "";
  return [
    {
      id: "save",
      label: "Save PNG",
      detail: `Downloads folder${seed}`,
    },
    {
      id: "copy-image",
      label: "Copy image",
      detail: "Paste straight into Discord",
    },
    {
      id: "post-x",
      label: "Post on X",
      detail: "Opens compose + saves PNG to attach",
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Caption builders (pure — unit-tested)                               */
/* ------------------------------------------------------------------ */

function wrLabel(wins: number, losses: number): string {
  const d = wins + losses;
  if (!d) return `${wins}–${losses}`;
  return `${wins}–${losses} (${Math.round((wins / d) * 100)}%)`;
}

export function recapCaption(input: {
  wins: number;
  losses: number;
  rankDeltaLabel?: string | null;
  bestDeckName?: string | null;
}): string {
  const bits = [
    `My week in Arena: ${wrLabel(input.wins, input.losses)}`,
    input.rankDeltaLabel ? input.rankDeltaLabel : null,
    input.bestDeckName ? `Best deck: ${input.bestDeckName}` : null,
    `Tracked locally with Filthy Net Deck`,
    DOWNLOAD_URL,
  ].filter(Boolean);
  return bits.join(" · ");
}

export function climbCaption(input: {
  seasonLabel: string;
  wins: number;
  losses: number;
  rankNow?: string | null;
  rankPeak?: string | null;
}): string {
  const bits = [
    `Climb: ${input.seasonLabel}`,
    wrLabel(input.wins, input.losses),
    input.rankNow ? `Now ${input.rankNow}` : null,
    input.rankPeak && input.rankPeak !== input.rankNow
      ? `Peak ${input.rankPeak}`
      : null,
    `Filthy Net Deck · free Arena companion`,
    DOWNLOAD_URL,
  ].filter(Boolean);
  return bits.join(" · ");
}

export function matchupCaption(input: {
  deckName: string;
  wins: number;
  losses: number;
  /** Top rows already sorted by sample size. */
  topLines: { archetype: string; wins: number; losses: number }[];
  /** When the strongest matchup maps to today's meta, seed SEO. */
  metaDeckUrl?: string | null;
}): string {
  const lines = input.topLines
    .slice(0, 3)
    .map((r) => `${r.archetype} ${r.wins}–${r.losses}`)
    .join(", ");
  const bits = [
    `${input.deckName}: ${wrLabel(input.wins, input.losses)} overall`,
    lines ? `vs ${lines}` : null,
    `Personal matchups · cards actually seen · Filthy Net Deck`,
    input.metaDeckUrl || DOWNLOAD_URL,
  ].filter(Boolean);
  return bits.join(" · ");
}

export function deckCardCaption(input: {
  deckName: string;
  wins: number;
  losses: number;
  scopeLabel: string;
}): string {
  return [
    `${input.deckName} · ${wrLabel(input.wins, input.losses)} · ${input.scopeLabel}`,
    `Deck card from Filthy Net Deck`,
    DOWNLOAD_URL,
  ].join(" · ");
}

/** Copy caption text alone (for chats that already have the image). */
export async function copyCaption(text: string): Promise<boolean> {
  return copyToClipboard(text);
}

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauri } from "./appUpdater";
import type { TrackedMatch, TrackerStatus } from "../types/tracker";

export async function fetchTrackerStatus(): Promise<TrackerStatus | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<TrackerStatus>("tracker_status");
  } catch {
    return null;
  }
}

export async function fetchTrackerMatches(): Promise<TrackedMatch[]> {
  if (!isTauri()) return [];
  try {
    return await invoke<TrackedMatch[]>("tracker_matches");
  } catch {
    return [];
  }
}

export async function clearTrackerHistory(): Promise<void> {
  if (!isTauri()) return;
  await invoke("tracker_clear");
}

/** Permanently delete specific matches (backend rewrites + tombstones them). */
export async function deleteTrackerMatches(matchIds: string[]): Promise<void> {
  if (!isTauri()) return;
  await invoke("tracker_delete_matches", { matchIds });
}

export async function subscribeTracker(handlers: {
  onMatch: (m: TrackedMatch) => void;
  onStatus: (s: TrackerStatus) => void;
}): Promise<UnlistenFn[]> {
  if (!isTauri()) return [];
  const unlisteners = await Promise.all([
    listen<TrackedMatch>("tracker:match", (e) => handlers.onMatch(e.payload)),
    listen<TrackerStatus>("tracker:status", (e) => handlers.onStatus(e.payload)),
  ]);
  return unlisteners;
}

/** Friendly label for an Arena queue id, e.g. "Traditional_Ladder" → "Standard Ranked · Bo3". */
export function queueLabel(eventId: string): string {
  const KNOWN: Record<string, string> = {
    Ladder: "Standard Ranked",
    Traditional_Ladder: "Standard Ranked · Bo3",
    Play: "Play",
    Traditional_Play: "Play · Bo3",
    Brawl: "Brawl",
    Unknown: "Unknown queue",
  };
  if (KNOWN[eventId]) return KNOWN[eventId];
  const bo3 = eventId.includes("Traditional");
  let parts = eventId.split("_").filter((p) => p && p !== "Traditional");
  let kind = "";
  if (parts.includes("Ladder")) {
    kind = "Ranked";
    parts = parts.filter((p) => p !== "Ladder");
  } else if (parts.includes("Play")) {
    kind = "Play";
    parts = parts.filter((p) => p !== "Play");
  }
  const label = [parts.join(" "), kind].filter(Boolean).join(" ").trim() || eventId;
  return bo3 ? `${label} · Bo3` : label;
}

/**
 * Stable identity for "the same deck" across renames and card edits:
 * Arena's DeckId when we caught it, else the name, else the list fingerprint.
 */
export function deckKey(m: TrackedMatch): string {
  return m.deckId ?? m.deckName ?? m.deckHash ?? "unknown";
}

/** Arena ranked seasons reset monthly — key a match to its calendar month. */
export function seasonKeyOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function currentSeasonKey(): string {
  return seasonKeyOf(Date.now());
}

/** "2026-07" → "Jul 2026" (or "This season" for the current month). */
export function seasonLabel(key: string): string {
  if (key === currentSeasonKey()) return "This season";
  const [y, m] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, 1).toLocaleString(undefined, {
    month: "short",
    year: "numeric",
  });
}

export function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
}

/** "2–1" game score from the local player's perspective. */
export function gameScore(m: TrackedMatch): string {
  const wins = m.games.filter((g) => g.winningTeamId === m.myTeamId).length;
  const losses = m.games.filter(
    (g) => g.winningTeamId != null && g.winningTeamId !== m.myTeamId,
  ).length;
  return `${wins}–${losses}`;
}

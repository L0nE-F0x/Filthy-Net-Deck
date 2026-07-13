/** Mirrors src-tauri/src/tracker.rs (serde camelCase). */

export interface TrackedGame {
  winningTeamId?: number;
  reason?: string;
  /** True when the local player was on the play for this game. */
  onPlay?: boolean;
}

export type MatchResult = "win" | "loss" | "draw" | "unknown";

export interface TrackedMatch {
  matchId: string;
  /** Unix ms. */
  startedAt: number;
  endedAt: number;
  /** Raw Arena queue id, e.g. "Ladder" or "Traditional_Ladder". */
  eventId: string;
  bestOf: number;
  opponentName?: string;
  opponentPlatform?: string;
  myTeamId: number;
  myPlayerName?: string;
  games: TrackedGame[];
  result: MatchResult;
  resultReason?: string;
  deckName?: string;
  deckId?: string;
  /** Fingerprint of the game-1 mainboard — stable across renames. */
  deckHash?: string;
  /** Constructed rank when the match was recorded, e.g. "Diamond 1". */
  myRank?: string;
}

export interface TrackerStatus {
  logPath: string;
  logFound: boolean;
  /** null until the log says either way. */
  detailedLogs: boolean | null;
  lastEventAt: number | null;
  matchesRecorded: number;
  /** Non-zero after an Arena update likely means the log format changed. */
  parseErrors: number;
  localPlayer: string | null;
  backfillDone: boolean;
}

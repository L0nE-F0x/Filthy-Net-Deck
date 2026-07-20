/** Mirrors src-tauri/src/tracker.rs (serde camelCase). */

export interface TrackedGame {
  winningTeamId?: number;
  reason?: string;
  /** True when the local player was on the play for this game. */
  onPlay?: boolean;
  /** Times the local player mulliganed this game (0 = kept 7). */
  mulligans?: number;
  /** Turn number of the local player's first land on the battlefield. */
  firstLandTurn?: number;
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
  /** Game-1 submitted mainboard as Arena card ids (repeats = quantity). */
  deckMain?: number[];
  /** Game-1 sideboard as Arena card ids. */
  deckSide?: number[];
  /** Arena ranked season ordinal (seasons reset monthly). */
  seasonOrdinal?: number;
  /**
   * Distinct Arena grpIds observed on the opponent seat this match
   * (battlefield / gy / exile / stack / hand). Used to infer meta archetype.
   */
  opponentSeen?: number[];
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

/** In-match snapshot for the always-on-top HUD (mirrors Rust LiveMatch). */
export type LiveMatchPhase = "playing" | "ended" | "idle";

export interface LiveCardCount {
  /** Arena grpId. */
  grpId: number;
  remaining: number;
  total: number;
}

export interface LiveMatch {
  matchId: string;
  phase: LiveMatchPhase;
  /** Unix ms. */
  startedAt: number;
  eventId: string;
  bestOf: number;
  opponentName?: string;
  opponentPlatform?: string;
  myPlayerName?: string;
  myRank?: string;
  deckName?: string;
  deckId?: string;
  deckHash?: string;
  /** Present when phase is "ended". */
  result?: MatchResult;
  /** Cards still in library (mainboard). */
  library?: LiveCardCount[];
  libraryTotal?: number;
  /** Opponent grpIds seen so far this match. */
  opponentSeen?: number[];
  /** Current turn number (GRE turnInfo) — absent until turn 1 registers. */
  turn?: number;
  /** Local player on the play this game (absent until turn 1 locks). */
  onPlay?: boolean;
  /** Mulligans taken this game (0 = kept opening hand). */
  mulligans?: number;
}

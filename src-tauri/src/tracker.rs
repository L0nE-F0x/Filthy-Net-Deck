//! Local winrate tracker: tails MTG Arena's Player.log, extracts matches, and
//! persists them to a JSONL file in the app data dir. Fully offline — nothing
//! ever leaves the machine.
//!
//! Requires "Detailed Logs (Plugin Support)" enabled in Arena's account
//! options; the tracker detects the state from the log itself and surfaces it
//! to the UI instead of guessing.
//!
//! Log anatomy (verified against a live 2026.60 client log):
//! - `[UnityCrossThreadLogger]...: Match to <accountId>: <MessageName>` header
//!   lines, with the JSON payload on the NEXT line as a single bare-JSON line.
//! - `matchGameRoomStateChangedEvent` carries the whole match lifecycle:
//!   `MatchGameRoomStateType_Playing` (players, matchId, queue eventId) and
//!   `MatchGameRoomStateType_MatchCompleted` (`finalMatchResult.resultList`
//!   with per-game and per-match `winningTeamId`).
//! - `authenticateResponse.clientId` identifies the local account.
//! - `EventGetCoursesV2`/`EventJoin` responses carry `CourseDeckSummary`
//!   (deck name) plus `CourseDeck.MainDeck` per queue.
//! - GRE `connectResp.deckMessage.deckCards` is the exact submitted list.
//! - Bare rank JSON is recognizable by its `constructedClass` key.
//! - Payload `timestamp` is unix ms on match events but .NET ticks on auth
//!   events — disambiguated by magnitude.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};

const MATCHES_FILE: &str = "tracker-matches.jsonl";
/// Tombstones for user-deleted matches: without them a restart would re-record
/// deleted matches straight back out of the Arena logs during backfill.
const DELETED_FILE: &str = "tracker-deleted.json";
const POLL_INTERVAL_MS: u64 = 1500;
/// Guard against a corrupt log producing an unbounded "line".
const MAX_LINE_BYTES: usize = 8 * 1024 * 1024;
const DOTNET_EPOCH_TICKS: u64 = 621_355_968_000_000_000;

// ---------------------------------------------------------------------------
// Public data types (serialized to the frontend)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TrackedGame {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub winning_team_id: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// True when the local player was on the play for this game.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub on_play: Option<bool>,
    /// Times the local player mulliganed this game (0 = kept 7). None if unknown.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mulligans: Option<u32>,
    /// Turn number of the local player's first land on the battlefield.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_land_turn: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackedMatch {
    pub match_id: String,
    /// Unix ms.
    pub started_at: u64,
    pub ended_at: u64,
    /// Raw Arena queue id, e.g. "Ladder" or "Traditional_Ladder".
    pub event_id: String,
    pub best_of: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub opponent_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub opponent_platform: Option<String>,
    pub my_team_id: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub my_player_name: Option<String>,
    pub games: Vec<TrackedGame>,
    /// "win" | "loss" | "draw" | "unknown"
    pub result: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deck_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deck_id: Option<String>,
    /// Fingerprint of the game-1 submitted mainboard — stable across renames.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deck_hash: Option<String>,
    /// Local player's constructed rank when the match was recorded, e.g. "Diamond 1".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub my_rank: Option<String>,
    /// Game-1 submitted mainboard as Arena card ids (repeats = quantity).
    /// Only game 1 is registered — later games are post-sideboard lists.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deck_main: Option<Vec<u32>>,
    /// Game-1 sideboard as Arena card ids.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deck_side: Option<Vec<u32>>,
    /// Arena ranked season ordinal (from rank payloads; seasons reset monthly).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub season_ordinal: Option<u32>,
    /// Distinct Arena grpIds observed on the *opponent* seat this match
    /// (battlefield / gy / exile / stack / hand). Used client-side to infer
    /// meta archetype. Empty when detailed logs never revealed opponent cards.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opponent_seen: Option<Vec<u32>>,
    /// Basic land types Arena itself reported for opponent permanents this
    /// match, e.g. `["Island","Swamp"]` (sorted, de-duplicated).
    ///
    /// Read from the game object's own `subtypes` rather than resolved from
    /// `grpId`: basic-land grpIds are *not* stable identities (verified
    /// 2026-08-11 — an object Arena described as `SubType_Swamp` carried grpId
    /// 87457, which the card API resolves to Island). Arena's own type line is
    /// the only trustworthy colour signal a basic carries.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opponent_basics: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TrackerStatus {
    pub log_path: String,
    pub log_found: bool,
    /// None until the log tells us either way.
    pub detailed_logs: Option<bool>,
    /// Unix ms of the last Arena event we parsed (any kind).
    pub last_event_at: Option<u64>,
    pub matches_recorded: usize,
    /// Lines that looked like tracker-relevant events but failed to parse.
    /// Non-zero after an Arena update likely means the format changed.
    pub parse_errors: u64,
    pub local_player: Option<String>,
    pub backfill_done: bool,
}

/// One mainboard line still in (or known for) the library tracker.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LiveCardCount {
    /// Arena grpId / card id.
    pub grp_id: u32,
    /// Copies still believed to be in the library.
    pub remaining: u32,
    /// Copies registered in the opening mainboard for this game.
    pub total: u32,
}

/// Live in-match snapshot for the always-on-top HUD.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LiveMatch {
    pub match_id: String,
    /// "playing" | "ended" | "idle"
    pub phase: String,
    pub started_at: u64,
    pub event_id: String,
    pub best_of: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub opponent_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub opponent_platform: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub my_player_name: Option<String>,
    /// Rank stamped when this match *started* — where the player sat down.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub my_rank: Option<String>,
    /// Freshest rank the log has reported, which after a ranked match is the
    /// one it just earned. `my_rank` is frozen at match start, so this is the
    /// only way the post-match card can show what the game actually did; the
    /// ended frame is re-emitted when Arena logs the update a beat later.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rank_now: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deck_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deck_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deck_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<String>,
    /// Cards still in library (mainboard tracker). Empty when unknown.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub library: Vec<LiveCardCount>,
    /// Sum of `library.remaining` (quick badge).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub library_total: Option<u32>,
    /// Current game's sideboard (from GRE `sideboardCards`). Empty in Bo1.
    /// Counts are static for the game — they do not track mid-game zone moves.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sideboard: Vec<LiveCardCount>,
    /// Sum of sideboard card copies (quick badge).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sideboard_total: Option<u32>,
    /// Opponent grpIds seen so far this match (sorted).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub opponent_seen: Vec<u32>,
    /// Basic land types Arena reported for opponent permanents (sorted).
    /// See `TrackedMatch::opponent_basics` — the overlay infers live, so it
    /// needs the same evidence the finished match carries.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub opponent_basics: Vec<String>,
    /// Current turn number (GRE turnInfo) — None until turn 1 registers.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn: Option<u32>,
    /// Local player on the play this game (None until turn 1 locks).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub on_play: Option<bool>,
    /// Mulligans taken this game (0 = kept opening hand).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mulligans: Option<u32>,
}

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

#[derive(Default)]
pub struct TrackerData {
    pub status: TrackerStatus,
    pub matches: Vec<TrackedMatch>,
    /// Last emitted live snapshot (for mid-match overlay open).
    pub live: Option<LiveMatch>,
    recorded_ids: HashSet<String>,
    data_file: Option<PathBuf>,
    deleted_file: Option<PathBuf>,
}

pub struct TrackerShared(pub Mutex<TrackerData>);

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn tracker_status(state: State<'_, TrackerShared>) -> TrackerStatus {
    state.0.lock().expect("tracker lock").status.clone()
}

#[tauri::command]
pub fn tracker_matches(state: State<'_, TrackerShared>) -> Vec<TrackedMatch> {
    let data = state.0.lock().expect("tracker lock");
    let mut out = data.matches.clone();
    out.sort_by_key(|m| std::cmp::Reverse(m.started_at));
    out
}

#[tauri::command]
pub fn tracker_live(state: State<'_, TrackerShared>) -> Option<LiveMatch> {
    state.0.lock().expect("tracker lock").live.clone()
}

/// Export the full match history as CSV into the user's Downloads folder and
/// reveal the file in the system file manager. Returns the written path.
#[tauri::command]
pub fn tracker_export_csv(
    app: AppHandle,
    state: State<'_, TrackerShared>,
) -> Result<String, String> {
    fn csv_escape(s: &str) -> String {
        if s.contains([',', '"', '\n']) {
            format!("\"{}\"", s.replace('"', "\"\""))
        } else {
            s.to_string()
        }
    }
    let matches = {
        let data = state.0.lock().expect("tracker lock");
        let mut out = data.matches.clone();
        out.sort_by_key(|m| std::cmp::Reverse(m.started_at));
        out
    };
    if matches.is_empty() {
        return Err("No matches to export yet.".into());
    }

    let mut csv = String::from(
        "date,season,result,deck,opponent,opponent_platform,queue,best_of,games_won,games_lost,rank,game1_on_play,game1_mulligans,game1_first_land_turn,opponent_cards_seen,match_id\n",
    );
    for m in &matches {
        let wins = m
            .games
            .iter()
            .filter(|g| g.winning_team_id == Some(m.my_team_id))
            .count();
        let losses = m
            .games
            .iter()
            .filter(|g| g.winning_team_id.is_some() && g.winning_team_id != Some(m.my_team_id))
            .count();
        let g1 = m.games.first();
        let on_play = g1
            .and_then(|g| g.on_play)
            .map(|p| if p { "play" } else { "draw" })
            .unwrap_or("");
        let mulls = g1
            .and_then(|g| g.mulligans)
            .map(|n| n.to_string())
            .unwrap_or_default();
        let first_land = g1
            .and_then(|g| g.first_land_turn)
            .map(|n| n.to_string())
            .unwrap_or_default();
        // Calendar season key YYYY-MM for spreadsheet pivots (from iso_date).
        let day = iso_date(m.ended_at);
        let season = if day.len() >= 7 { &day[..7] } else { "" };
        let cards_seen = m.opponent_seen.as_ref().map(|v| v.len()).unwrap_or(0);
        csv.push_str(&format!(
            "{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{}\n",
            iso_date(m.ended_at),
            season,
            m.result,
            csv_escape(m.deck_name.as_deref().unwrap_or("")),
            csv_escape(m.opponent_name.as_deref().unwrap_or("")),
            csv_escape(m.opponent_platform.as_deref().unwrap_or("")),
            csv_escape(&m.event_id),
            m.best_of,
            wins,
            losses,
            csv_escape(m.my_rank.as_deref().unwrap_or("")),
            on_play,
            mulls,
            first_land,
            cards_seen,
            csv_escape(&m.match_id),
        ));
    }

    let dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| format!("No folder to write to: {e}"))?;
    let file = dir.join(format!(
        "filthy-net-deck-matches-{}.csv",
        iso_date(now_ms())
    ));
    fs::write(&file, csv).map_err(|e| format!("Could not write CSV: {e}"))?;
    let _ = tauri_plugin_opener::reveal_item_in_dir(&file);
    Ok(file.display().to_string())
}

/// C6 — write an anonymized parser-health file to Downloads and reveal it.
/// Contains ONLY counters and flags: no player names, no opponents, no match
/// contents, no file paths (the log path embeds the OS username). Safe to
/// attach to a public GitHub issue when the tracker misbehaves after an
/// Arena update.
#[tauri::command]
pub fn tracker_export_diagnostic(
    app: AppHandle,
    state: State<'_, TrackerShared>,
) -> Result<String, String> {
    let (status, data_file) = {
        let d = state.0.lock().expect("tracker lock");
        (d.status.clone(), d.data_file.clone())
    };
    // Count lines actually on disk. The gap between this and `matchesRecorded`
    // is the whole diagnosis: equal means persistence is healthy, and a large
    // shortfall means history exists only in memory and dies with the logs.
    let disk_count = data_file
        .as_ref()
        .and_then(|f| fs::read_to_string(f).ok())
        .map(|t| t.lines().filter(|l| !l.trim().is_empty()).count());

    let report = serde_json::json!({
        "app": "filthy-net-deck",
        "version": env!("CARGO_PKG_VERSION"),
        "platform": std::env::consts::OS,
        "generatedAt": iso_date(now_ms()),
        "privacy": "Counters and flags only — no player names, no opponents, no match data, no file paths. Safe to attach to a public GitHub issue.",
        "tracker": {
            "logFound": status.log_found,
            "detailedLogs": status.detailed_logs,
            "backfillDone": status.backfill_done,
            "matchesRecorded": status.matches_recorded,
            "parseErrors": status.parse_errors,
            "lastEventAt": status.last_event_at,
            "lastEventDate": status.last_event_at.map(iso_date),
            // Persistence health. `matchesRecorded` counts what is in MEMORY;
            // history is re-derived from Arena's logs on every launch, so a
            // broken write is invisible there until the logs rotate and the
            // un-persisted matches are gone. These two make it visible.
            "matchesOnDisk": disk_count,
            "writeErrors": write_error_count(),
            "lastWriteError": last_write_error(),
            // Non-zero means appends were failing and the reconcile pass had to
            // rewrite the file. History is intact — but something is wrong with
            // the fast path and this is the trail to it.
            "persistRepairs": persist_repair_count(),
        },
    });
    let body = serde_json::to_string_pretty(&report).map_err(|e| e.to_string())?;

    let dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| format!("No folder to write to: {e}"))?;
    let file = dir.join(format!(
        "filthy-net-deck-diagnostic-{}.json",
        iso_date(now_ms())
    ));
    fs::write(&file, body).map_err(|e| format!("Could not write diagnostic: {e}"))?;
    let _ = tauri_plugin_opener::reveal_item_in_dir(&file);
    Ok(file.display().to_string())
}

#[tauri::command]
pub fn tracker_clear(app: AppHandle, state: State<'_, TrackerShared>) -> Result<(), String> {
    let status = {
        let mut data = state.0.lock().expect("tracker lock");
        data.matches.clear();
        data.recorded_ids.clear();
        data.status.matches_recorded = 0;
        if let Some(file) = data.data_file.clone() {
            if file.exists() {
                fs::remove_file(&file).map_err(|e| e.to_string())?;
            }
        }
        // A full clear is a clean slate: drop per-match tombstones too, so the
        // documented "delete + restart re-backfills from the logs" still holds.
        if let Some(file) = data.deleted_file.clone() {
            if file.exists() {
                let _ = fs::remove_file(&file);
            }
        }
        data.status.clone()
    };
    let _ = app.emit("tracker:status", &status);
    Ok(())
}

/// Delete specific matches (e.g. one deck's history). Rewrites the JSONL and
/// tombstones the ids so log backfill can never resurrect them.
#[tauri::command]
pub fn tracker_delete_matches(
    app: AppHandle,
    state: State<'_, TrackerShared>,
    match_ids: Vec<String>,
) -> Result<usize, String> {
    let ids: HashSet<String> = match_ids.into_iter().collect();
    let (removed, status) = {
        let mut data = state.0.lock().expect("tracker lock");
        let before = data.matches.len();
        data.matches.retain(|m| !ids.contains(&m.match_id));
        let removed = before - data.matches.len();
        data.status.matches_recorded = data.matches.len();
        if removed > 0 {
            // recorded_ids keeps the ids, so the live tail also skips them.
            if let Some(file) = data.data_file.clone() {
                rewrite_matches(&file, &data.matches).map_err(|e| e.to_string())?;
            }
            if let Some(file) = data.deleted_file.clone() {
                let mut all = load_deleted(&file);
                all.extend(ids);
                save_deleted(&file, &all);
            }
        }
        (removed, data.status.clone())
    };
    if removed > 0 {
        let _ = app.emit("tracker:status", &status);
    }
    Ok(removed)
}

// ---------------------------------------------------------------------------
// Log locations
// ---------------------------------------------------------------------------

fn arena_log_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let profile = std::env::var_os("USERPROFILE")?;
        Some(
            PathBuf::from(profile)
                .join("AppData")
                .join("LocalLow")
                .join("Wizards Of The Coast")
                .join("MTGA"),
        )
    }
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var_os("HOME")?;
        Some(
            PathBuf::from(home)
                .join("Library")
                .join("Logs")
                .join("Wizards Of The Coast")
                .join("MTGA"),
        )
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        None
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Unix ms → "YYYY-MM-DD" (civil calendar), no chrono dependency.
fn iso_date(ms: u64) -> String {
    let days = (ms / 86_400_000) as i64;
    let (mut y, mut doy) = (1970i64, days);
    loop {
        let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
        let len = if leap { 366 } else { 365 };
        if doy < len {
            let months = if leap {
                [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
            } else {
                [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
            };
            let mut m = 0usize;
            while doy >= months[m] {
                doy -= months[m];
                m += 1;
            }
            return format!("{y:04}-{:02}-{:02}", m + 1, doy + 1);
        }
        doy -= len;
        y += 1;
    }
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct CourseInfo {
    deck_id: Option<String>,
    deck_name: Option<String>,
    deck_hash: Option<String>,
}

#[derive(Debug, Default)]
struct PendingMatch {
    started_at: u64,
    event_id: String,
    opponent_name: Option<String>,
    opponent_platform: Option<String>,
    my_team_id: Option<u32>,
    my_seat_id: Option<u32>,
    my_player_name: Option<String>,
    deck_name: Option<String>,
    deck_id: Option<String>,
    deck_hash: Option<String>,
    deck_main: Option<Vec<u32>>,
    deck_side: Option<Vec<u32>>,
    my_rank: Option<String>,
    season_ordinal: Option<u32>,
    /// Per-game "was I on the play", indexed by GRE connection order.
    game_on_play: Vec<Option<bool>>,
    /// Per-game mulligan count (0 = kept 7), same index order as game_on_play.
    game_mulligans: Vec<Option<u32>>,
    /// Per-game first land turn, same index order.
    game_first_land_turn: Vec<Option<u32>>,
    awaiting_first_turn: bool,
    /// Count mulligan reshuffles until turn 1 locks.
    mulligans_open: bool,
    /// Live turn number from GRE turnInfo (current game).
    cur_turn: Option<u32>,
    /// Opponent cards (grpId) revealed via GRE this match.
    opponent_seen: HashSet<u32>,
    /// Basic land types ("Swamp", …) Arena reported on opponent permanents.
    opponent_basics: HashSet<String>,
}

/// Zones that mean one of my cards has physically left the library.
/// Anything else (Limbo, Pending, Suppressed, unknown) is treated as
/// "not yet gone" — GRE parks ghost ids in Limbo, and a false draw is a
/// worse lie than a late one.
fn zone_is_out(ty: &str) -> bool {
    matches!(
        ty,
        "ZoneType_Battlefield"
            | "ZoneType_Graveyard"
            | "ZoneType_Exile"
            | "ZoneType_Stack"
            | "ZoneType_Hand"
            | "ZoneType_Command"
            | "ZoneType_Revealed"
            | "ZoneType_Sideboard"
    )
}

/// Zones that still count as "in the deck". `ZoneType_Top` is the scry /
/// surveil staging area — those cards never left.
fn zone_is_deck(ty: &str) -> bool {
    matches!(ty, "ZoneType_Library" | "ZoneType_Top")
}

/// Live mainboard-in-library tracker driven by GRE zone + gameObject diffs.
///
/// Counts are *derived* from current zone membership rather than accumulated
/// from draw events. GRE mints a brand-new `instanceId` every time a card
/// changes zone (hand → stack → battlefield → graveyard), so an
/// event-accumulating tracker decrements the same physical card once per hop —
/// which is why played lands used to vanish from the count several times over.
/// `alias` follows `AnnotationType_ObjectIdChanged` so every hop resolves back
/// to one canonical instance, and re-deriving from zones means cards shuffled
/// back into the library correctly reappear.
#[derive(Debug, Default, Clone)]
struct DeckTracker {
    /// Derived each tick: grpId -> copies still in the library.
    remaining: HashMap<u32, u32>,
    totals: HashMap<u32, u32>,
    /// zoneId -> ZoneType_* string
    zone_types: HashMap<u32, String>,
    /// zoneId -> instance ids currently in it (authoritative, replaces on each
    /// message that lists the zone).
    zone_members: HashMap<u32, HashSet<u32>>,
    /// new instanceId -> the id it replaced.
    alias: HashMap<u32, u32>,
    /// canonical instanceId -> the grpId it had on the way out of the deck.
    /// First sighting wins: an MDFC / adventure cast reports its other face's
    /// grpId, which is not the one the decklist registered.
    obj_grp: HashMap<u32, u32>,
    last_lib_count: Option<u32>,
}

impl DeckTracker {
    fn reset_from_main(&mut self, cards: &[u32]) {
        self.remaining.clear();
        self.totals.clear();
        self.reset_game_state();
        for &id in cards {
            *self.remaining.entry(id).or_default() += 1;
            *self.totals.entry(id).or_default() += 1;
        }
    }

    /// Drop everything tied to one game's object graph (ids are re-minted per
    /// game); keep the registered decklist.
    fn reset_game_state(&mut self) {
        self.zone_types.clear();
        self.zone_members.clear();
        self.alias.clear();
        self.obj_grp.clear();
        self.last_lib_count = None;
    }

    fn clear(&mut self) {
        self.remaining.clear();
        self.totals.clear();
        self.reset_game_state();
    }

    /// Walk the id-change chain back to the instance we first knew.
    /// Hop-capped so a malformed cycle can never hang the tail thread.
    fn root(&self, instance: u32) -> u32 {
        let mut id = instance;
        for _ in 0..64 {
            match self.alias.get(&id) {
                Some(&prev) if prev != id => id = prev,
                _ => break,
            }
        }
        id
    }

    fn library_count(&self) -> Option<u32> {
        self.last_lib_count
    }

    fn snapshot(&self) -> (Vec<LiveCardCount>, Option<u32>) {
        if self.totals.is_empty() {
            return (Vec::new(), None);
        }
        let mut rows: Vec<LiveCardCount> = self
            .totals
            .iter()
            .filter_map(|(&grp_id, &total)| {
                let remaining = self.remaining.get(&grp_id).copied().unwrap_or(0);
                if remaining == 0 && total == 0 {
                    return None;
                }
                // Keep exhausted lines out of the live list to stay compact.
                if remaining == 0 {
                    return None;
                }
                Some(LiveCardCount {
                    grp_id,
                    remaining,
                    total,
                })
            })
            .collect();
        rows.sort_by(|a, b| b.remaining.cmp(&a.remaining).then(a.grp_id.cmp(&b.grp_id)));
        let sum: u32 = self.remaining.values().sum();
        (rows, Some(sum))
    }

    /// Apply one GRE GameStateMessage. Returns true when remaining counts changed.
    fn apply_game_state(&mut self, gsm: &serde_json::Value, my_seat: u32) -> bool {
        // 1. Id re-mappings first: the same message carries the new object.
        if let Some(anns) = gsm.get("annotations").and_then(|a| a.as_array()) {
            for ann in anns {
                let is_id_change =
                    ann.get("type")
                        .and_then(|t| t.as_array())
                        .is_some_and(|types| {
                            types
                                .iter()
                                .any(|t| t.as_str() == Some("AnnotationType_ObjectIdChanged"))
                        });
                if !is_id_change {
                    continue;
                }
                let (mut orig, mut new) = (None, None);
                let empty: Vec<serde_json::Value> = Vec::new();
                let details = ann
                    .get("details")
                    .and_then(|d| d.as_array())
                    .unwrap_or(&empty);
                for d in details {
                    let val = d
                        .get("valueInt32")
                        .and_then(|v| v.as_array())
                        .and_then(|a| a.first())
                        .and_then(|v| v.as_u64())
                        .map(|v| v as u32);
                    match d.get("key").and_then(|k| k.as_str()) {
                        Some("orig_id") => orig = val,
                        Some("new_id") => new = val,
                        _ => {}
                    }
                }
                if let (Some(o), Some(n)) = (orig, new) {
                    if o != n {
                        self.alias.insert(n, o);
                    }
                }
            }
        }

        // 2. Zones are authoritative for where every instance currently sits.
        if let Some(zones) = gsm.get("zones").and_then(|z| z.as_array()) {
            let mut my_lib_count: Option<u32> = None;
            for z in zones {
                let Some(zid) = z.get("zoneId").and_then(|x| x.as_u64()).map(|x| x as u32) else {
                    continue;
                };
                if let Some(ty) = z.get("type").and_then(|t| t.as_str()) {
                    self.zone_types.insert(zid, ty.to_string());
                }
                if let Some(ids) = z.get("objectInstanceIds").and_then(|a| a.as_array()) {
                    self.zone_members.insert(
                        zid,
                        ids.iter()
                            .filter_map(|i| i.as_u64())
                            .map(|i| i as u32)
                            .collect(),
                    );
                }
                let owner = z
                    .get("ownerSeatId")
                    .and_then(|o| o.as_u64())
                    .map(|o| o as u32);
                let ty = z.get("type").and_then(|t| t.as_str()).unwrap_or("");
                if ty == "ZoneType_Library" && owner == Some(my_seat) {
                    let n = z
                        .get("objectInstanceIds")
                        .and_then(|a| a.as_array())
                        .map(|a| a.len() as u32)
                        .unwrap_or(0);
                    my_lib_count = Some(n);
                }
            }
            if let Some(n) = my_lib_count {
                self.last_lib_count = Some(n);
            }
        }

        // 3. Objects only teach us identity: which grpId an instance carries.
        if let Some(gos) = gsm.get("gameObjects").and_then(|g| g.as_array()) {
            for go in gos {
                if go.get("type").and_then(|t| t.as_str()) != Some("GameObjectType_Card") {
                    continue;
                }
                let owner = go
                    .get("ownerSeatId")
                    .and_then(|o| o.as_u64())
                    .map(|o| o as u32);
                if owner != Some(my_seat) {
                    continue;
                }
                let (Some(instance), Some(grp)) = (
                    go.get("instanceId")
                        .and_then(|i| i.as_u64())
                        .map(|i| i as u32),
                    go.get("grpId").and_then(|g| g.as_u64()).map(|g| g as u32),
                ) else {
                    continue;
                };
                let root = self.root(instance);
                self.obj_grp.entry(root).or_insert(grp);
                self.obj_grp.entry(instance).or_insert(grp);
            }
        }

        self.recompute()
    }

    /// Re-derive `remaining` from current zone membership. Returns true when
    /// the counts moved (the overlay only re-emits on a real change).
    fn recompute(&mut self) -> bool {
        if self.totals.is_empty() {
            return false;
        }
        // Anything sitting in the library (or staged on top of it) is still in
        // the deck no matter what stale copy of it another zone lists.
        let mut in_deck: HashSet<u32> = HashSet::new();
        for (zid, members) in &self.zone_members {
            if !zone_is_deck(self.zone_types.get(zid).map(|s| s.as_str()).unwrap_or("")) {
                continue;
            }
            for &iid in members {
                in_deck.insert(self.root(iid));
            }
        }

        let mut gone: HashMap<u32, u32> = HashMap::new();
        let mut counted: HashSet<u32> = HashSet::new();
        for (zid, members) in &self.zone_members {
            if !zone_is_out(self.zone_types.get(zid).map(|s| s.as_str()).unwrap_or("")) {
                continue;
            }
            for &iid in members {
                let root = self.root(iid);
                if in_deck.contains(&root) || !counted.insert(root) {
                    continue;
                }
                // Identity as of leaving the deck, not the face now showing.
                let Some(&grp) = self.obj_grp.get(&root).or_else(|| self.obj_grp.get(&iid)) else {
                    continue;
                };
                *gone.entry(grp).or_default() += 1;
            }
        }

        let next: HashMap<u32, u32> = self
            .totals
            .iter()
            .map(|(&grp, &total)| {
                (
                    grp,
                    total.saturating_sub(gone.get(&grp).copied().unwrap_or(0)),
                )
            })
            .collect();
        if next == self.remaining {
            return false;
        }
        self.remaining = next;
        true
    }
}

#[derive(Default)]
pub struct LogParser {
    local_user_id: Option<String>,
    local_player_name: Option<String>,
    detailed_logs: Option<bool>,
    /// Queue eventId -> last known selected deck for that queue.
    courses_by_event: HashMap<String, CourseInfo>,
    /// Deck fingerprint -> (deckId, name); survives queue switches and renames.
    courses_by_hash: HashMap<String, (Option<String>, Option<String>)>,
    current_rank: Option<String>,
    current_season: Option<u32>,
    pending: HashMap<String, PendingMatch>,
    current_match_id: Option<String>,
    /// Live library counts for the current match/game.
    deck_tracker: DeckTracker,
    /// Latest GRE `sideboardCards` for the current game (empty in Bo1).
    /// Refreshed on every `deckMessage` so G2/G3 post-board lists replace G1.
    live_sideboard: Vec<u32>,
    /// Set when the live HUD snapshot needs re-emit (avoids spamming every GRE tick).
    live_dirty: bool,
    pub parse_errors: u64,
    pub events_seen: u64,
    pub last_event_at: Option<u64>,
}

impl LogParser {
    pub fn new() -> Self {
        Self::default()
    }

    /// Arena restarted (log truncated): drop in-flight match state but keep
    /// identity, courses, and rank — they are refreshed by the new session
    /// and stale values are still the best available fallback.
    pub fn reset_session(&mut self) {
        self.pending.clear();
        self.current_match_id = None;
        self.deck_tracker.clear();
        self.live_sideboard.clear();
        self.live_dirty = true;
    }

    /// Whether the overlay should re-emit after this batch of log lines.
    pub fn consume_live_dirty(&mut self) -> bool {
        let d = self.live_dirty;
        self.live_dirty = false;
        d
    }

    pub fn detailed_logs(&self) -> Option<bool> {
        self.detailed_logs
    }

    pub fn local_player_name(&self) -> Option<String> {
        self.local_player_name.clone()
    }

    /// Snapshot of the current in-progress match (if any) for the overlay HUD.
    pub fn live_match(&self) -> Option<LiveMatch> {
        let match_id = self.current_match_id.as_ref()?;
        let pending = self.pending.get(match_id)?;
        let event_id = if pending.event_id.is_empty() {
            "Unknown".to_string()
        } else {
            pending.event_id.clone()
        };
        let best_of = if event_id.contains("Traditional") {
            3
        } else {
            1
        };
        let (library, library_total) = self.deck_tracker.snapshot();
        let (sideboard, sideboard_total) = sideboard_snapshot(&self.live_sideboard);
        Some(LiveMatch {
            match_id: match_id.clone(),
            phase: "playing".to_string(),
            started_at: if pending.started_at == 0 {
                now_ms()
            } else {
                pending.started_at
            },
            event_id,
            best_of,
            opponent_name: pending.opponent_name.clone(),
            opponent_platform: pending.opponent_platform.clone(),
            my_player_name: pending.my_player_name.clone(),
            my_rank: pending.my_rank.clone(),
            rank_now: self.current_rank.clone(),
            deck_name: pending.deck_name.clone(),
            deck_id: pending.deck_id.clone(),
            deck_hash: pending.deck_hash.clone(),
            result: None,
            library,
            library_total,
            sideboard,
            sideboard_total,
            opponent_seen: sorted_grp_ids(&pending.opponent_seen),
            opponent_basics: sorted_strings(&pending.opponent_basics),
            turn: pending.cur_turn,
            on_play: pending.game_on_play.last().copied().flatten(),
            mulligans: pending.game_mulligans.last().copied().flatten(),
        })
    }

    /// Feed one log line; returns matches completed by this line.
    pub fn feed_line(&mut self, raw: &str) -> Vec<TrackedMatch> {
        let line = raw.trim_end_matches(['\r', '\n']);
        if line.is_empty() {
            return Vec::new();
        }

        if let Some(at) = line.find("DETAILED LOGS: ") {
            let rest = &line[at + "DETAILED LOGS: ".len()..];
            self.detailed_logs = Some(rest.trim_start().starts_with("ENABLED"));
            return Vec::new();
        }

        // Header lines name the local account: "Match to <accountId>: ..."
        // Most payloads sit on the *next* line as bare JSON, but some Arena
        // builds paste the JSON on the same line after the logger prefix —
        // don't drop those.
        if line.contains("[UnityCrossThreadLogger]") {
            if let Some(at) = line.find("Match to ") {
                let rest = &line[at + "Match to ".len()..];
                if let Some(colon) = rest.find(':') {
                    let id = rest[..colon].trim();
                    if !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric()) {
                        self.local_user_id = Some(id.to_string());
                    }
                }
            }
            if let Some(brace) = line.find('{') {
                // Fall through and parse the JSON tail of this line.
                let tail = line[brace..].trim_start();
                return self.feed_json_payload(tail);
            }
            return Vec::new();
        }

        let trimmed = line.trim_start();
        if !trimmed.starts_with('{') {
            return Vec::new();
        }
        self.feed_json_payload(trimmed)
    }

    /// Route a bare-JSON Arena payload (match room, GRE, auth, courses, rank).
    fn feed_json_payload(&mut self, trimmed: &str) -> Vec<TrackedMatch> {
        // Cheap substring routing before paying for a JSON parse.
        if trimmed.contains("\"matchGameRoomStateChangedEvent\"") {
            return self.on_room_event(trimmed);
        }
        if trimmed.contains("\"authenticateResponse\"") {
            self.on_auth(trimmed);
            return Vec::new();
        }
        if trimmed.contains("\"greToClientEvent\"") {
            self.on_gre(trimmed);
            return Vec::new();
        }
        if trimmed.contains("\"CourseDeckSummary\"") {
            self.on_courses(trimmed);
            return Vec::new();
        }
        if trimmed.contains("\"constructedClass\"") {
            self.on_rank(trimmed);
            return Vec::new();
        }
        Vec::new()
    }

    fn mark_event(&mut self, payload_ts: Option<u64>) {
        self.events_seen += 1;
        self.last_event_at = Some(payload_ts.unwrap_or_else(now_ms));
    }

    fn on_auth(&mut self, line: &str) {
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else {
            self.parse_errors += 1;
            return;
        };
        self.mark_event(payload_timestamp_ms(&v));
        if let Some(id) = v
            .get("authenticateResponse")
            .and_then(|a| a.get("clientId"))
            .and_then(|c| c.as_str())
        {
            self.local_user_id = Some(id.to_string());
        }
    }

    fn on_rank(&mut self, line: &str) {
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else {
            // Rank payloads share a line shape with other bare JSON; not an error.
            return;
        };
        if let Some(season) = v.get("constructedSeasonOrdinal").and_then(|s| s.as_u64()) {
            self.current_season = Some(season as u32);
        }
        let class = v.get("constructedClass").and_then(|c| c.as_str());
        let level = v.get("constructedLevel").and_then(|l| l.as_u64());
        if let Some(class) = class {
            if class.is_empty() {
                return;
            }
            // Mythic has no divisions — Arena reports a percentile (most
            // players) or a leaderboard place (top ~1200) instead. Stamp it so
            // the Climb chart can show real movement inside Mythic. Both
            // fields are optional; absent/zero falls back to the bare class.
            if class.eq_ignore_ascii_case("mythic") {
                let place = v
                    .get("constructedLeaderboardPlace")
                    .and_then(|p| p.as_u64())
                    .filter(|p| *p > 0);
                let pct = v
                    .get("constructedPercentile")
                    .and_then(|p| p.as_f64())
                    .filter(|p| *p > 0.0 && *p <= 100.0);
                self.set_current_rank(match (place, pct) {
                    (Some(place), _) => format!("Mythic #{place}"),
                    (None, Some(pct)) => format!("Mythic {pct:.1}%"),
                    (None, None) => "Mythic".to_string(),
                });
                return;
            }
            self.set_current_rank(match level {
                Some(l) if l > 0 => format!("{class} {l}"),
                _ => class.to_string(),
            });
        }
    }

    /// Arena logs the rank a ranked match earned a beat *after* the result, so
    /// a real move has to wake the HUD — that is what lets the post-match card
    /// finish its rank path while the ended frame is still lingering.
    fn set_current_rank(&mut self, rank: String) {
        if self.current_rank.as_deref() == Some(rank.as_str()) {
            return;
        }
        self.current_rank = Some(rank);
        self.live_dirty = true;
    }

    /// Freshest rank seen in the log (not frozen to any match).
    pub fn current_rank(&self) -> Option<String> {
        self.current_rank.clone()
    }

    fn on_courses(&mut self, line: &str) {
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else {
            self.parse_errors += 1;
            return;
        };
        let mut found = Vec::new();
        collect_courses(&v, &mut found);
        for (event_name, info) in found {
            if let Some(hash) = info.deck_hash.clone() {
                self.courses_by_hash
                    .insert(hash, (info.deck_id.clone(), info.deck_name.clone()));
            }
            self.courses_by_event.insert(event_name, info);
        }
    }

    fn on_gre(&mut self, line: &str) {
        let has_deck = line.contains("\"deckMessage\"");
        let turn1_active = find_turn1_active_player(line);
        let has_gsm = line.contains("\"gameStateMessage\"");
        if !has_deck && turn1_active.is_none() && !has_gsm {
            return;
        }
        let Some(match_id) = self.current_match_id.clone() else {
            return;
        };
        // Seat needed for library tracking.
        let my_seat = self.pending.get(&match_id).and_then(|p| p.my_seat_id);

        if has_deck {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                if let Some((cards, side)) = find_deck_message(&v) {
                    // Opening list for this game — seed / re-seed the library tracker.
                    self.deck_tracker.reset_from_main(&cards);
                    // Sideboard refreshes every game so G2/G3 post-board lists show
                    // what is actually left in the board (not just the G1 register).
                    self.live_sideboard = side.clone();
                    self.live_dirty = true;
                    if let Some(pending) = self.pending.get_mut(&match_id) {
                        // New GRE connection = new game; expect its turn-1 info next.
                        pending.game_on_play.push(None);
                        pending.game_mulligans.push(Some(0));
                        pending.game_first_land_turn.push(None);
                        pending.awaiting_first_turn = true;
                        pending.mulligans_open = true;
                        pending.cur_turn = None;
                        // Only game 1 identifies the registered deck; later games
                        // are post-sideboard lists.
                        if pending.deck_hash.is_none() {
                            let hash = fingerprint(&cards);
                            if let Some((deck_id, deck_name)) = self.courses_by_hash.get(&hash) {
                                pending.deck_id = deck_id.clone();
                                if deck_name.is_some() {
                                    pending.deck_name = deck_name.clone();
                                }
                            }
                            pending.deck_hash = Some(hash);
                            pending.deck_main = Some(cards);
                            pending.deck_side = Some(side);
                        }
                    }
                }
            } else {
                self.parse_errors += 1;
            }
        }

        // Cheap gate: most GRE spam has neither library zones nor objects.
        if has_gsm
            && my_seat.is_some()
            && (line.contains("\"gameObjects\"")
                || line.contains("ZoneType_Library")
                || line.contains("\"turnInfo\""))
        {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                if let Some(my_seat) = my_seat {
                    let mut changed = false;
                    let lib_before = self.deck_tracker.library_count();
                    if let Some(msgs) = v
                        .get("greToClientEvent")
                        .and_then(|e| e.get("greToClientMessages"))
                        .and_then(|m| m.as_array())
                    {
                        for msg in msgs {
                            if let Some(gsm) = msg.get("gameStateMessage") {
                                changed |= self.deck_tracker.apply_game_state(gsm, my_seat);
                                if let Some(pending) = self.pending.get_mut(&match_id) {
                                    changed |= note_turn_number(pending, gsm);
                                    changed |= note_opponent_cards(
                                        &mut self.deck_tracker.zone_types,
                                        &mut pending.opponent_seen,
                                        &mut pending.opponent_basics,
                                        gsm,
                                        my_seat,
                                    );
                                    changed |= note_first_land(
                                        &mut self.deck_tracker.zone_types,
                                        pending,
                                        gsm,
                                        my_seat,
                                    );
                                }
                            }
                        }
                    } else if let Some(gsm) = v.get("gameStateMessage") {
                        changed |= self.deck_tracker.apply_game_state(gsm, my_seat);
                        if let Some(pending) = self.pending.get_mut(&match_id) {
                            changed |= note_turn_number(pending, gsm);
                            changed |= note_opponent_cards(
                                &mut self.deck_tracker.zone_types,
                                &mut pending.opponent_seen,
                                &mut pending.opponent_basics,
                                gsm,
                                my_seat,
                            );
                            changed |= note_first_land(
                                &mut self.deck_tracker.zone_types,
                                pending,
                                gsm,
                                my_seat,
                            );
                        }
                    }
                    // Library grew during mulligan window → count a mulligan.
                    if let Some(pending) = self.pending.get_mut(&match_id) {
                        if pending.mulligans_open {
                            if let (Some(prev), Some(now)) =
                                (lib_before, self.deck_tracker.library_count())
                            {
                                if now > prev {
                                    if let Some(slot) = pending.game_mulligans.last_mut() {
                                        let n = slot.unwrap_or(0) + 1;
                                        *slot = Some(n);
                                        changed = true;
                                    }
                                }
                            }
                        }
                    }
                    if changed {
                        self.live_dirty = true;
                    }
                }
            }
        }

        if let Some(active_seat) = turn1_active {
            if let Some(pending) = self.pending.get_mut(&match_id) {
                if pending.awaiting_first_turn {
                    pending.awaiting_first_turn = false;
                    pending.mulligans_open = false;
                    if let Some(my_seat) = pending.my_seat_id {
                        if let Some(slot) = pending.game_on_play.last_mut() {
                            *slot = Some(active_seat == my_seat);
                        }
                    }
                    // Ensure mulligan slot is frozen at least at 0.
                    if let Some(slot) = pending.game_mulligans.last_mut() {
                        if slot.is_none() {
                            *slot = Some(0);
                        }
                    }
                    // On-play / mulligan chips just became known — re-emit HUD.
                    self.live_dirty = true;
                }
            }
        }
    }

    fn on_room_event(&mut self, line: &str) -> Vec<TrackedMatch> {
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else {
            self.parse_errors += 1;
            return Vec::new();
        };
        let ts = payload_timestamp_ms(&v);
        self.mark_event(ts);
        let ts = ts.unwrap_or_else(now_ms);

        let Some(room) = v
            .get("matchGameRoomStateChangedEvent")
            .and_then(|e| e.get("gameRoomInfo"))
        else {
            self.parse_errors += 1;
            return Vec::new();
        };
        let config = room.get("gameRoomConfig");
        let match_id = config
            .and_then(|c| c.get("matchId"))
            .and_then(|m| m.as_str())
            .map(str::to_string);
        let Some(match_id) = match_id else {
            self.parse_errors += 1;
            return Vec::new();
        };
        let state_type = room
            .get("stateType")
            .and_then(|s| s.as_str())
            .unwrap_or_default();
        let players = config
            .and_then(|c| c.get("reservedPlayers"))
            .and_then(|p| p.as_array())
            .cloned()
            .unwrap_or_default();

        match state_type {
            "MatchGameRoomStateType_Playing" => {
                self.upsert_pending(&match_id, ts, &players);
                self.current_match_id = Some(match_id);
                self.live_dirty = true;
                Vec::new()
            }
            "MatchGameRoomStateType_MatchCompleted" => {
                // The completed event repeats the player list, so a match whose
                // start was in a rotated log can still be recorded whole.
                self.upsert_pending(&match_id, ts, &players);
                if self.current_match_id.as_deref() == Some(match_id.as_str()) {
                    self.current_match_id = None;
                }
                self.deck_tracker.clear();
                self.live_sideboard.clear();
                self.live_dirty = true;
                let pending = self.pending.remove(&match_id).unwrap_or_default();
                let result_list = room
                    .get("finalMatchResult")
                    .and_then(|f| f.get("resultList"))
                    .and_then(|r| r.as_array())
                    .cloned()
                    .unwrap_or_default();
                vec![finalize_match(match_id, pending, ts, &result_list)]
            }
            _ => Vec::new(),
        }
    }

    fn upsert_pending(&mut self, match_id: &str, ts: u64, players: &[serde_json::Value]) {
        let local_id = self.local_user_id.clone();
        let rank = self.current_rank.clone();
        let season = self.current_season;
        let entry = self
            .pending
            .entry(match_id.to_string())
            .or_insert_with(|| PendingMatch {
                started_at: ts,
                my_rank: rank,
                season_ordinal: season,
                ..PendingMatch::default()
            });

        for p in players {
            let user_id = p.get("userId").and_then(|u| u.as_str()).unwrap_or_default();
            let name = p
                .get("playerName")
                .and_then(|n| n.as_str())
                .map(str::to_string);
            let team = p.get("teamId").and_then(|t| t.as_u64()).map(|t| t as u32);
            let seat = p
                .get("systemSeatId")
                .and_then(|s| s.as_u64())
                .map(|s| s as u32);
            let platform = p
                .get("platformId")
                .and_then(|pl| pl.as_str())
                .map(str::to_string);
            if let Some(event) = p.get("eventId").and_then(|e| e.as_str()) {
                if entry.event_id.is_empty() {
                    entry.event_id = event.to_string();
                }
            }
            let is_me = local_id.as_deref() == Some(user_id);
            if is_me {
                entry.my_team_id = team;
                entry.my_seat_id = seat;
                entry.my_player_name = name.clone();
                if let Some(n) = name {
                    self.local_player_name = Some(n);
                }
            } else if entry.opponent_name.is_none() {
                entry.opponent_name = name;
                entry.opponent_platform = platform;
            }
        }

        // Attach the queue's selected deck once we know the queue.
        if entry.deck_name.is_none() && !entry.event_id.is_empty() {
            if let Some(course) = self.courses_by_event.get(&entry.event_id) {
                entry.deck_name = course.deck_name.clone();
                entry.deck_id = course.deck_id.clone();
            }
        }
    }
}

fn sorted_grp_ids(set: &HashSet<u32>) -> Vec<u32> {
    let mut v: Vec<u32> = set.iter().copied().collect();
    v.sort_unstable();
    v
}

fn sorted_strings(set: &HashSet<String>) -> Vec<String> {
    let mut v: Vec<String> = set.iter().cloned().collect();
    v.sort_unstable();
    v
}

/// Zones where an opponent card's grpId is "seen" by the local player.
fn zone_reveals_card(ty: &str) -> bool {
    matches!(
        ty,
        "ZoneType_Battlefield"
            | "ZoneType_Graveyard"
            | "ZoneType_Exile"
            | "ZoneType_Stack"
            | "ZoneType_Hand"
            | "ZoneType_Command"
            | "ZoneType_Revealed"
            | "ZoneType_FaceUp"
            | "ZoneType_Transient"
    )
}

/// GRE marks lands via cardTypes (string enum in modern clients).
fn object_is_land(go: &serde_json::Value) -> bool {
    if let Some(arr) = go.get("cardTypes").and_then(|t| t.as_array()) {
        for t in arr {
            if t.as_str() == Some("CardType_Land") {
                return true;
            }
        }
    }
    // Older / alternate payload shapes.
    if let Some(arr) = go.get("types").and_then(|t| t.as_array()) {
        for t in arr {
            if t.as_str() == Some("CardType_Land") || t.as_str() == Some("Land") {
                return true;
            }
        }
    }
    false
}

/// Track the live turn number. Returns true when it changed (HUD re-emit).
fn note_turn_number(pending: &mut PendingMatch, gsm: &serde_json::Value) -> bool {
    if let Some(n) = gsm
        .get("turnInfo")
        .and_then(|t| t.get("turnNumber"))
        .and_then(|n| n.as_u64())
    {
        let n = Some(n as u32);
        if pending.cur_turn != n {
            pending.cur_turn = n;
            return true;
        }
    }
    false
}

/// Record turn of first land the local player puts on the battlefield.
fn note_first_land(
    zone_types: &mut HashMap<u32, String>,
    pending: &mut PendingMatch,
    gsm: &serde_json::Value,
    my_seat: u32,
) -> bool {
    // Already recorded for this game.
    if pending
        .game_first_land_turn
        .last()
        .copied()
        .flatten()
        .is_some()
    {
        return false;
    }
    if let Some(zones) = gsm.get("zones").and_then(|z| z.as_array()) {
        for z in zones {
            let Some(zid) = z.get("zoneId").and_then(|x| x.as_u64()).map(|x| x as u32) else {
                continue;
            };
            if let Some(ty) = z.get("type").and_then(|t| t.as_str()) {
                zone_types.insert(zid, ty.to_string());
            }
        }
    }
    let Some(gos) = gsm.get("gameObjects").and_then(|g| g.as_array()) else {
        return false;
    };
    for go in gos {
        let ty = go.get("type").and_then(|t| t.as_str()).unwrap_or("");
        if ty != "GameObjectType_Card" {
            continue;
        }
        let owner = go
            .get("ownerSeatId")
            .and_then(|o| o.as_u64())
            .map(|o| o as u32);
        if owner != Some(my_seat) {
            continue;
        }
        if !object_is_land(go) {
            continue;
        }
        let zone_id = go.get("zoneId").and_then(|z| z.as_u64()).map(|z| z as u32);
        let zone_ty = zone_id
            .and_then(|z| zone_types.get(&z))
            .map(|s| s.as_str())
            .unwrap_or("");
        if zone_ty != "ZoneType_Battlefield" {
            continue;
        }
        let turn = pending.cur_turn.unwrap_or(1);
        if let Some(slot) = pending.game_first_land_turn.last_mut() {
            *slot = Some(turn);
            return true;
        }
    }
    false
}

/// Basic land type carried by a game object's own `subtypes`, if any.
///
/// Only genuine basics qualify (`SuperType_Basic`): a basic Swamp taps for
/// black and nothing else, which makes Arena's type line airtight colour
/// evidence — unlike the object's `grpId`, which for basics varies by printing
/// and art and can resolve to an entirely different land. Non-basic lands that
/// merely *have* land subtypes (shocks, duals) are deliberately excluded; those
/// resolve reliably by id and the inference already weighs them.
fn basic_land_types(go: &serde_json::Value) -> Vec<String> {
    let is_basic = go
        .get("superTypes")
        .and_then(|s| s.as_array())
        .is_some_and(|a| a.iter().any(|t| t.as_str() == Some("SuperType_Basic")));
    if !is_basic {
        return Vec::new();
    }
    let is_land = go
        .get("cardTypes")
        .and_then(|c| c.as_array())
        .is_some_and(|a| a.iter().any(|t| t.as_str() == Some("CardType_Land")));
    if !is_land {
        return Vec::new();
    }
    let Some(subs) = go.get("subtypes").and_then(|s| s.as_array()) else {
        return Vec::new();
    };
    subs.iter()
        .filter_map(|s| s.as_str())
        .filter_map(|s| s.strip_prefix("SubType_"))
        .filter(|s| matches!(*s, "Plains" | "Island" | "Swamp" | "Mountain" | "Forest"))
        .map(str::to_string)
        .collect()
}

/// Record opponent-owned cards that appear in revealed zones. Returns true if set grew.
fn note_opponent_cards(
    zone_types: &mut HashMap<u32, String>,
    seen: &mut HashSet<u32>,
    basics: &mut HashSet<String>,
    gsm: &serde_json::Value,
    my_seat: u32,
) -> bool {
    if let Some(zones) = gsm.get("zones").and_then(|z| z.as_array()) {
        for z in zones {
            let Some(zid) = z.get("zoneId").and_then(|x| x.as_u64()).map(|x| x as u32) else {
                continue;
            };
            if let Some(ty) = z.get("type").and_then(|t| t.as_str()) {
                zone_types.insert(zid, ty.to_string());
            }
        }
    }
    let Some(gos) = gsm.get("gameObjects").and_then(|g| g.as_array()) else {
        return false;
    };
    let mut changed = false;
    for go in gos {
        let ty = go.get("type").and_then(|t| t.as_str()).unwrap_or("");
        if ty != "GameObjectType_Card" {
            continue;
        }
        let owner = go
            .get("ownerSeatId")
            .and_then(|o| o.as_u64())
            .map(|o| o as u32);
        if owner.is_none() || owner == Some(my_seat) {
            continue;
        }
        let zone_id = go.get("zoneId").and_then(|z| z.as_u64()).map(|z| z as u32);
        let zone_ty = zone_id
            .and_then(|z| zone_types.get(&z))
            .map(|s| s.as_str())
            .unwrap_or("");
        if !zone_reveals_card(zone_ty) {
            continue;
        }
        for ty in basic_land_types(go) {
            if basics.insert(ty) {
                changed = true;
            }
        }
        let Some(grp) = go.get("grpId").and_then(|g| g.as_u64()).map(|g| g as u32) else {
            continue;
        };
        if grp == 0 {
            continue;
        }
        if seen.insert(grp) {
            changed = true;
        }
    }
    changed
}

fn finalize_match(
    match_id: String,
    pending: PendingMatch,
    ended_at: u64,
    result_list: &[serde_json::Value],
) -> TrackedMatch {
    let mut games = Vec::new();
    let mut match_winning_team: Option<u32> = None;
    let mut match_result_type: Option<String> = None;
    let mut match_reason: Option<String> = None;

    for entry in result_list {
        let scope = entry.get("scope").and_then(|s| s.as_str()).unwrap_or("");
        let winning = entry
            .get("winningTeamId")
            .and_then(|w| w.as_u64())
            .map(|w| w as u32);
        let reason = entry
            .get("reason")
            .and_then(|r| r.as_str())
            .map(str::to_string);
        let result_type = entry
            .get("result")
            .and_then(|r| r.as_str())
            .map(str::to_string);
        match scope {
            "MatchScope_Game" => games.push(TrackedGame {
                winning_team_id: winning,
                reason,
                on_play: None,
                mulligans: None,
                first_land_turn: None,
            }),
            "MatchScope_Match" => {
                match_winning_team = winning;
                match_result_type = result_type;
                match_reason = reason;
            }
            _ => {}
        }
    }

    for (i, on_play) in pending.game_on_play.iter().enumerate() {
        if let (Some(game), Some(v)) = (games.get_mut(i), on_play) {
            game.on_play = Some(*v);
        }
    }
    for (i, mulls) in pending.game_mulligans.iter().enumerate() {
        if let (Some(game), Some(v)) = (games.get_mut(i), mulls) {
            game.mulligans = Some(*v);
        }
    }
    for (i, turn) in pending.game_first_land_turn.iter().enumerate() {
        if let (Some(game), Some(v)) = (games.get_mut(i), turn) {
            game.first_land_turn = Some(*v);
        }
    }

    let result = match (pending.my_team_id, match_winning_team) {
        (Some(me), Some(winner)) if winner == me => "win",
        (Some(_), Some(_)) => "loss",
        _ => {
            if match_result_type.as_deref() == Some("ResultType_Draw") {
                "draw"
            } else {
                "unknown"
            }
        }
    };

    let event_id = if pending.event_id.is_empty() {
        "Unknown".to_string()
    } else {
        pending.event_id
    };
    let best_of = if event_id.contains("Traditional") {
        3
    } else {
        1
    };

    TrackedMatch {
        match_id,
        started_at: if pending.started_at == 0 {
            ended_at
        } else {
            pending.started_at
        },
        ended_at,
        event_id,
        best_of,
        opponent_name: pending.opponent_name,
        opponent_platform: pending.opponent_platform,
        my_team_id: pending.my_team_id.unwrap_or(0),
        my_player_name: pending.my_player_name,
        games,
        result: result.to_string(),
        result_reason: match_reason,
        deck_name: pending.deck_name,
        deck_id: pending.deck_id,
        deck_hash: pending.deck_hash,
        deck_main: pending.deck_main,
        deck_side: pending.deck_side,
        my_rank: pending.my_rank,
        season_ordinal: pending.season_ordinal,
        opponent_seen: {
            let mut v: Vec<u32> = pending.opponent_seen.into_iter().collect();
            v.sort_unstable();
            if v.is_empty() {
                None
            } else {
                Some(v)
            }
        },
        opponent_basics: {
            let mut v: Vec<String> = pending.opponent_basics.into_iter().collect();
            v.sort_unstable();
            if v.is_empty() {
                None
            } else {
                Some(v)
            }
        },
    }
}

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

/// Payload `timestamp` field: unix ms on match events, .NET ticks on auth
/// events. Ticks are ~6.4e17 while 2026 unix ms is ~1.8e12.
fn payload_timestamp_ms(v: &serde_json::Value) -> Option<u64> {
    let raw = v.get("timestamp")?;
    let n = match raw {
        serde_json::Value::String(s) => s.parse::<u64>().ok()?,
        serde_json::Value::Number(n) => n.as_u64()?,
        _ => return None,
    };
    if n >= 1_000_000_000_000_000 {
        Some((n.saturating_sub(DOTNET_EPOCH_TICKS)) / 10_000)
    } else {
        Some(n)
    }
}

/// Recursively collect `(InternalEventName, CourseInfo)` pairs from any JSON
/// that embeds course objects (EventGetCoursesV2, EventJoin, ...).
fn collect_courses(v: &serde_json::Value, out: &mut Vec<(String, CourseInfo)>) {
    match v {
        serde_json::Value::Object(map) => {
            let event_name = map.get("InternalEventName").and_then(|e| e.as_str());
            let summary = map.get("CourseDeckSummary").and_then(|s| s.as_object());
            if let (Some(event_name), Some(summary)) = (event_name, summary) {
                let deck_id = summary
                    .get("DeckId")
                    .and_then(|d| d.as_str())
                    .map(str::to_string);
                let deck_name = summary
                    .get("Name")
                    .and_then(|n| n.as_str())
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty());
                let deck_hash = map
                    .get("CourseDeck")
                    .and_then(|d| d.get("MainDeck"))
                    .and_then(|m| m.as_array())
                    .map(|main| {
                        let mut cards = Vec::new();
                        for c in main {
                            let id = c.get("cardId").and_then(|i| i.as_u64()).unwrap_or(0) as u32;
                            let qty = c.get("quantity").and_then(|q| q.as_u64()).unwrap_or(0);
                            for _ in 0..qty {
                                cards.push(id);
                            }
                        }
                        fingerprint(&cards)
                    });
                out.push((
                    event_name.to_string(),
                    CourseInfo {
                        deck_id,
                        deck_name,
                        deck_hash,
                    },
                ));
            }
            for child in map.values() {
                collect_courses(child, out);
            }
        }
        serde_json::Value::Array(arr) => {
            for child in arr {
                collect_courses(child, out);
            }
        }
        _ => {}
    }
}

/// Collapse raw Arena sideboard grpIds into overlay rows (qty = remaining = total).
fn sideboard_snapshot(cards: &[u32]) -> (Vec<LiveCardCount>, Option<u32>) {
    if cards.is_empty() {
        return (Vec::new(), None);
    }
    let mut totals: HashMap<u32, u32> = HashMap::new();
    for &id in cards {
        *totals.entry(id).or_default() += 1;
    }
    let mut rows: Vec<LiveCardCount> = totals
        .into_iter()
        .map(|(grp_id, total)| LiveCardCount {
            grp_id,
            remaining: total,
            total,
        })
        .collect();
    rows.sort_by(|a, b| b.remaining.cmp(&a.remaining).then(a.grp_id.cmp(&b.grp_id)));
    let sum = cards.len() as u32;
    (rows, Some(sum))
}

/// Find `connectResp.deckMessage` anywhere in a GRE payload; returns
/// `(deckCards, sideboardCards)` (sideboard empty when absent, e.g. Bo1).
fn find_deck_message(v: &serde_json::Value) -> Option<(Vec<u32>, Vec<u32>)> {
    fn ids(deck: &serde_json::Value, key: &str) -> Option<Vec<u32>> {
        deck.get(key).and_then(|c| c.as_array()).map(|cards| {
            cards
                .iter()
                .filter_map(|c| c.as_u64())
                .map(|c| c as u32)
                .collect()
        })
    }
    match v {
        serde_json::Value::Object(map) => {
            if let Some(deck) = map.get("deckMessage") {
                if let Some(cards) = ids(deck, "deckCards") {
                    return Some((cards, ids(deck, "sideboardCards").unwrap_or_default()));
                }
            }
            map.values().find_map(find_deck_message)
        }
        serde_json::Value::Array(arr) => arr.iter().find_map(find_deck_message),
        _ => None,
    }
}

/// Scan a raw GRE line for a turn-1 `turnInfo` and return its `activePlayer`
/// seat. String-level scan: GRE lines are huge and frequent, and this runs on
/// every one of them, so we avoid a full JSON parse.
fn find_turn1_active_player(line: &str) -> Option<u32> {
    let mut search_from = 0;
    while let Some(rel) = line[search_from..].find("\"turnInfo\"") {
        let start = search_from + rel;
        let open = line[start..].find('{')? + start;
        let close = line[open..].find('}')? + open;
        let body: String = line[open..=close].chars().filter(|c| *c != ' ').collect();
        if turn_number_is_one(&body) {
            if let Some(seat) = extract_u32_after(&body, "\"activePlayer\":") {
                return Some(seat);
            }
        }
        search_from = close + 1;
    }
    None
}

fn turn_number_is_one(body: &str) -> bool {
    extract_u32_after(body, "\"turnNumber\":") == Some(1)
}

fn extract_u32_after(body: &str, key: &str) -> Option<u32> {
    let at = body.find(key)? + key.len();
    let digits: String = body[at..]
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect();
    digits.parse().ok()
}

/// FNV-1a over the sorted card list — a stable deck fingerprint.
fn fingerprint(cards: &[u32]) -> String {
    let mut sorted = cards.to_vec();
    sorted.sort_unstable();
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for id in sorted {
        for byte in id.to_le_bytes() {
            hash ^= byte as u64;
            hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
        }
    }
    format!("{hash:016x}")
}

// ---------------------------------------------------------------------------
// Tail loop
// ---------------------------------------------------------------------------

pub fn start(app: AppHandle) {
    std::thread::spawn(move || run_loop(app));
}

fn run_loop(app: AppHandle) {
    let shared = app.state::<TrackerShared>();
    let dir = arena_log_dir();
    let log_path = dir.as_ref().map(|d| d.join("Player.log"));
    let prev_path = dir.as_ref().map(|d| d.join("Player-prev.log"));

    let app_data_dir = app.path().app_data_dir().ok();
    let data_file = app_data_dir.as_ref().map(|d| d.join(MATCHES_FILE));
    let deleted_file = app_data_dir.as_ref().map(|d| d.join(DELETED_FILE));

    // Load persisted history.
    {
        let mut data = shared.0.lock().expect("tracker lock");
        data.data_file = data_file.clone();
        data.deleted_file = deleted_file.clone();
        data.status.log_path = log_path
            .as_ref()
            .map(|p| p.display().to_string())
            .unwrap_or_else(|| "unsupported platform".to_string());
        // Tombstoned ids go in first so neither the JSONL load below nor the
        // log backfill can bring a deleted match back.
        if let Some(file) = &deleted_file {
            data.recorded_ids.extend(load_deleted(file));
        }
        if let Some(file) = &data_file {
            for m in load_matches(file) {
                if data.recorded_ids.insert(m.match_id.clone()) {
                    data.matches.push(m);
                }
            }
            data.status.matches_recorded = data.matches.len();
        }
    }
    emit_status(&app);

    let Some(log_path) = log_path else {
        return; // unsupported platform: status already says so
    };

    let mut parser = LogParser::new();

    // One-time backfill of the previous session so first launch isn't empty.
    if let Some(prev) = prev_path {
        if prev.exists() {
            backfill_file(&app, &mut parser, &prev);
            parser.reset_session();
        }
    }

    // Catch a file that fell behind in an earlier session, even if this one
    // never sees a new match.
    reconcile_persistence(&app);

    let mut pos: u64 = 0;
    let mut carry = String::new();

    loop {
        let meta = fs::metadata(&log_path);
        match meta {
            Ok(meta) => {
                let len = meta.len();
                if len < pos {
                    // Arena restarted and truncated the log.
                    parser.reset_session();
                    publish_live(&app, None);
                    pos = 0;
                    carry.clear();
                }
                if len > pos {
                    match read_chunk(&log_path, pos, len) {
                        Ok(chunk) => {
                            pos = len;
                            carry.push_str(&chunk);
                            let completed = drain_complete_lines(&mut carry, &mut parser);
                            let live_needed = parser.consume_live_dirty() || !completed.is_empty();
                            record_matches(&app, completed, parser.current_rank());
                            // Only re-push overlay state when match/library actually moved —
                            // GRE spam otherwise burns CPU on JSON + WebView re-renders.
                            if live_needed {
                                sync_live(&app, &parser);
                            }
                        }
                        Err(_) => {
                            // Transient read failure (AV scan, etc.) — retry next tick.
                        }
                    }
                }
                sync_status(&app, &parser, true, true);
            }
            Err(_) => {
                sync_status(&app, &parser, false, true);
            }
        }
        std::thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
    }
}

/// Feed every complete line in `carry` to the parser, leaving only the
/// trailing unterminated fragment behind. The size guard applies to that
/// fragment alone — a large chunk of complete lines (e.g. the initial
/// full-file read) must never be dropped.
fn drain_complete_lines(carry: &mut String, parser: &mut LogParser) -> Vec<TrackedMatch> {
    let mut completed = Vec::new();
    if let Some(last_nl) = carry.rfind('\n') {
        let complete: String = carry.drain(..=last_nl).collect();
        for line in complete.split('\n') {
            completed.extend(parser.feed_line(line));
        }
    }
    if carry.len() > MAX_LINE_BYTES {
        carry.clear();
    }
    completed
}

fn read_chunk(path: &Path, from: u64, to: u64) -> std::io::Result<String> {
    let mut f = fs::File::open(path)?;
    f.seek(SeekFrom::Start(from))?;
    let mut buf = vec![0u8; (to - from) as usize];
    f.read_exact(&mut buf)?;
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

fn backfill_file(app: &AppHandle, parser: &mut LogParser, path: &Path) {
    let Ok(text) = fs::read(path) else { return };
    let text = String::from_utf8_lossy(&text);
    let mut completed = Vec::new();
    for line in text.split('\n') {
        completed.extend(parser.feed_line(line));
    }
    record_matches(app, completed, parser.current_rank());
}

// ---------------------------------------------------------------------------
// Match-end desktop toast (Rust-side)
// ---------------------------------------------------------------------------
//
// This toast used to be posted by the frontend, but mid-match the main
// webview is usually tray-hidden (JS timers throttled) and Windows Focus
// Assist mutes banners while Arena runs. Posting from the tracker thread is
// immune to webview state, and the toast still queues in Action Center when
// Focus Assist suppresses the banner.

const NOTIFY_MATCH_END_FILE: &str = "notify-match-end";
static NOTIFY_MATCH_END: AtomicBool = AtomicBool::new(true);

fn notify_match_end_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|d| d.join(NOTIFY_MATCH_END_FILE))
}

/// Load the persisted toggle at startup (default on — matches the UI pref).
pub fn load_notify_match_end(app: &AppHandle) {
    let on = notify_match_end_path(app)
        .and_then(|p| fs::read_to_string(p).ok())
        .map(|s| {
            let t = s.trim();
            t != "0" && !t.eq_ignore_ascii_case("false")
        })
        .unwrap_or(true);
    NOTIFY_MATCH_END.store(on, Ordering::SeqCst);
}

fn notify_match_end_enabled() -> bool {
    NOTIFY_MATCH_END.load(Ordering::SeqCst)
}

/// Mirror of the Settings → Notifications → "Match-end toasts" toggle.
#[tauri::command]
pub fn notify_set_match_end(app: AppHandle, enabled: bool) {
    NOTIFY_MATCH_END.store(enabled, Ordering::SeqCst);
    if let Some(path) = notify_match_end_path(&app) {
        if let Some(dir) = path.parent() {
            let _ = fs::create_dir_all(dir);
        }
        let _ = fs::write(path, if enabled { b"1" as &[u8] } else { b"0" });
    }
}

/// Stable deck identity, mirroring the frontend `deckKey` (id → name → hash).
fn match_deck_key(m: &TrackedMatch) -> Option<&str> {
    m.deck_id
        .as_deref()
        .or(m.deck_name.as_deref())
        .or(m.deck_hash.as_deref())
}

/// Toast body: "Win vs Rival · 62% this season · Diamond 1".
/// `history` must already include `m` itself.
fn match_end_body(m: &TrackedMatch, history: &[TrackedMatch]) -> String {
    let result = match m.result.as_str() {
        "win" => "Win",
        "loss" => "Loss",
        "draw" => "Draw",
        _ => "Match ended",
    };
    let opp = m
        .opponent_name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("opponent");
    let mut body = format!("{result} vs {opp}");

    let season = iso_date(m.ended_at);
    let season = &season[..7]; // "YYYY-MM"
    if let Some(key) = match_deck_key(m) {
        let mut wins = 0u32;
        let mut losses = 0u32;
        for h in history {
            if &iso_date(h.ended_at)[..7] != season {
                continue;
            }
            let same_deck = match_deck_key(h) == Some(key)
                || (m.deck_hash.is_some() && h.deck_hash == m.deck_hash);
            if !same_deck {
                continue;
            }
            match h.result.as_str() {
                "win" => wins += 1,
                "loss" => losses += 1,
                _ => {}
            }
        }
        let decided = wins + losses;
        if let Some(pct) = (wins * 100).checked_div(decided) {
            body.push_str(&format!(" · {pct}% this season"));
        }
    }
    if let Some(rank) = m
        .my_rank
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        body.push_str(&format!(" · {rank}"));
    }
    body
}

fn post_match_end_toast(app: &AppHandle, body: &str) {
    // Top-most card only: Windows mutes OS banners while Arena (or any app) is
    // fullscreen, which is precisely when a match ends.
    crate::toast::show_toast(app, "Filthy Net Deck", body);
}

/// `rank_now` is the parser's freshest rank at the moment the result landed.
/// When Arena wrote the new rank in the same chunk as the match result it is
/// already the earned one; otherwise `sync_live` patches it mid-linger.
fn record_matches(app: &AppHandle, completed: Vec<TrackedMatch>, rank_now: Option<String>) {
    if completed.is_empty() {
        return;
    }
    let shared = app.state::<TrackerShared>();
    let mut fresh = Vec::new();
    {
        let mut data = shared.0.lock().expect("tracker lock");
        for m in completed {
            if !data.recorded_ids.insert(m.match_id.clone()) {
                continue;
            }
            if let Some(file) = data.data_file.clone() {
                append_match(&file, &m);
            }
            data.matches.push(m.clone());
            // Toast body while the lock is held: history already includes `m`.
            let toast = if notify_match_end_enabled() {
                Some(match_end_body(&m, &data.matches))
            } else {
                None
            };
            fresh.push((m, toast));
        }
        data.status.matches_recorded = data.matches.len();
    }
    // The append above is best-effort; this is what actually guarantees the
    // match survives the next log rotation.
    reconcile_persistence(app);
    for (m, toast) in fresh {
        // Brief "ended" live frame so the overlay can flash the result, then idle.
        let ended = LiveMatch {
            match_id: m.match_id.clone(),
            phase: "ended".to_string(),
            started_at: m.started_at,
            event_id: m.event_id.clone(),
            best_of: m.best_of,
            opponent_name: m.opponent_name.clone(),
            opponent_platform: m.opponent_platform.clone(),
            my_player_name: m.my_player_name.clone(),
            my_rank: m.my_rank.clone(),
            rank_now: rank_now.clone(),
            deck_name: m.deck_name.clone(),
            deck_id: m.deck_id.clone(),
            deck_hash: m.deck_hash.clone(),
            result: Some(m.result.clone()),
            library: Vec::new(),
            library_total: None,
            // Keep G1 sideboard on the ended frame so the HUD tab can still show
            // what was registered (library is cleared once the match ends).
            sideboard: sideboard_snapshot(m.deck_side.as_deref().unwrap_or(&[])).0,
            sideboard_total: m
                .deck_side
                .as_ref()
                .map(|s| s.len() as u32)
                .filter(|&n| n > 0),
            opponent_seen: m.opponent_seen.clone().unwrap_or_default(),
            opponent_basics: m.opponent_basics.clone().unwrap_or_default(),
            turn: None,
            on_play: m.games.last().and_then(|g| g.on_play),
            mulligans: m.games.last().and_then(|g| g.mulligans),
        };
        let mid = ended.match_id.clone();
        publish_live(app, Some(ended));
        schedule_clear_ended(app, mid);
        let _ = app.emit("tracker:match", &m);
        if let Some(body) = toast {
            post_match_end_toast(app, &body);
        }
    }
    emit_status(app);
}

fn publish_live(app: &AppHandle, live: Option<LiveMatch>) {
    let changed = {
        let shared = app.state::<TrackerShared>();
        let mut data = shared.0.lock().expect("tracker lock");
        if data.live == live {
            false
        } else {
            data.live = live.clone();
            true
        }
    };
    if !changed {
        return;
    }
    let _ = app.emit("tracker:live", &live);
    // Rust-driven show/hide so tray-hidden main WebView is not required.
    match live.as_ref().map(|l| l.phase.as_str()) {
        Some("playing") | Some("ended") => crate::overlay::show(app),
        _ => crate::overlay::hide(app),
    }
}

/// Sync overlay live state from the parser while a match is in progress.
/// Match-end flash + hide is handled in `record_matches` (with a one-shot delay).
fn sync_live(app: &AppHandle, parser: &LogParser) {
    if let Some(live) = parser.live_match() {
        publish_live(app, Some(live));
        return;
    }
    // No match in flight — but the result card may still be on screen, waiting
    // for the rank Arena logs a beat after the match. Patch that one field
    // instead of rebuilding: the frame carries the result the card is showing.
    refresh_ended_rank(app, parser.current_rank());
}

/// Update `rank_now` on a lingering "ended" frame. No-op unless the rank
/// actually moved (and never downgrades a known rank back to unknown).
fn refresh_ended_rank(app: &AppHandle, rank_now: Option<String>) {
    let Some(rank_now) = rank_now else { return };
    let updated = {
        let shared = app.state::<TrackerShared>();
        let data = shared.0.lock().expect("tracker lock");
        match data.live.as_ref() {
            Some(l) if l.phase == "ended" && l.rank_now.as_deref() != Some(rank_now.as_str()) => {
                let mut next = l.clone();
                next.rank_now = Some(rank_now);
                Some(next)
            }
            _ => None,
        }
    };
    if let Some(next) = updated {
        publish_live(app, Some(next));
    }
}

fn schedule_clear_ended(app: &AppHandle, match_id: String) {
    let app2 = app.clone();
    std::thread::spawn(move || {
        // Post-match summary on: let the result card linger (~12s). Off: the
        // original short flash. Read at schedule time; a mid-match toggle
        // applies from the next match.
        let linger_ms: u64 = if crate::overlay::is_post_match_enabled() {
            12_000
        } else {
            2_800
        };
        std::thread::sleep(Duration::from_millis(linger_ms));
        let still = {
            let shared = app2.state::<TrackerShared>();
            let data = shared.0.lock().expect("tracker lock");
            data.live
                .as_ref()
                .map(|l| l.phase == "ended" && l.match_id == match_id)
                .unwrap_or(false)
        };
        if still {
            publish_live(&app2, None);
        }
    });
}

fn sync_status(app: &AppHandle, parser: &LogParser, log_found: bool, backfill_done: bool) {
    let shared = app.state::<TrackerShared>();
    let changed = {
        let mut data = shared.0.lock().expect("tracker lock");
        let s = &mut data.status;
        let before = (
            s.log_found,
            s.detailed_logs,
            s.last_event_at,
            s.parse_errors,
            s.local_player.clone(),
            s.backfill_done,
        );
        s.log_found = log_found;
        s.detailed_logs = parser.detailed_logs();
        s.last_event_at = parser.last_event_at;
        s.parse_errors = parser.parse_errors;
        s.local_player = parser.local_player_name();
        s.backfill_done = backfill_done;
        before
            != (
                s.log_found,
                s.detailed_logs,
                s.last_event_at,
                s.parse_errors,
                s.local_player.clone(),
                s.backfill_done,
            )
    };
    if changed {
        emit_status(app);
    }
}

fn emit_status(app: &AppHandle) {
    let shared = app.state::<TrackerShared>();
    let status = shared.0.lock().expect("tracker lock").status.clone();
    let _ = app.emit("tracker:status", &status);
}

fn load_matches(file: &Path) -> Vec<TrackedMatch> {
    let Ok(text) = fs::read_to_string(file) else {
        return Vec::new();
    };
    text.lines()
        .filter_map(|l| serde_json::from_str::<TrackedMatch>(l).ok())
        .collect()
}

/// Rewrite the whole matches file (used after deletions, and by the repair
/// pass). Writes to a temp file first so a crash mid-write can't lose the
/// surviving history.
///
/// The `sync_all()` is load-bearing and was missing. `fs::write` opens, writes
/// and closes — it never fsyncs — so the rename could reach the disk while the
/// temp file's data blocks had not, replacing good history with a truncated or
/// empty file. "Temp file + rename" is only atomic if the data is durable
/// *before* the rename.
///
/// That is a small window, but this is the one function whose entire reason for
/// existing is that 348 matches were lost once already. Paying an fsync on a
/// path that runs at most once per match end is not a trade worth thinking
/// about.
fn rewrite_matches(file: &Path, matches: &[TrackedMatch]) -> std::io::Result<()> {
    if let Some(dir) = file.parent() {
        fs::create_dir_all(dir)?;
    }
    let mut out = String::new();
    for m in matches {
        if let Ok(json) = serde_json::to_string(m) {
            out.push_str(&json);
            out.push('\n');
        }
    }
    let tmp = file.with_extension("jsonl.tmp");
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(out.as_bytes())?;
        f.sync_all()?;
    }
    fs::rename(&tmp, file)
}

fn load_deleted(file: &Path) -> HashSet<String> {
    fs::read_to_string(file)
        .ok()
        .and_then(|text| serde_json::from_str::<Vec<String>>(&text).ok())
        .map(|ids| ids.into_iter().collect())
        .unwrap_or_default()
}

fn save_deleted(file: &Path, ids: &HashSet<String>) {
    if let Some(dir) = file.parent() {
        let _ = fs::create_dir_all(dir);
    }
    let mut sorted: Vec<&String> = ids.iter().collect();
    sorted.sort();
    if let Ok(json) = serde_json::to_string(&sorted) {
        let _ = fs::write(file, json);
    }
}

/// Count of match writes that failed, and the last OS error.
///
/// These exist because this function used to swallow every error. On the
/// owner's machine (2026-08-11) the app held **373 matches in memory while the
/// file on disk had 25**, last written three weeks earlier — tracking, parsing
/// and the UI all looked perfect, because history is re-derived from Arena's
/// logs on every launch. The loss only becomes visible when Arena rotates
/// `Player-prev.log` and takes the un-persisted matches with it.
///
/// A persistence failure must never be silent again.
static WRITE_ERRORS: AtomicUsize = AtomicUsize::new(0);
static LAST_WRITE_ERROR: Mutex<Option<String>> = Mutex::new(None);

/// Times the reconcile pass found the file short of memory and rewrote it.
static PERSIST_REPAIRS: AtomicUsize = AtomicUsize::new(0);

pub fn write_error_count() -> usize {
    WRITE_ERRORS.load(Ordering::SeqCst)
}

pub fn persist_repair_count() -> usize {
    PERSIST_REPAIRS.load(Ordering::SeqCst)
}

pub fn last_write_error() -> Option<String> {
    LAST_WRITE_ERROR.lock().ok().and_then(|e| e.clone())
}

fn note_write_error(what: &str, e: &dyn std::fmt::Display) {
    WRITE_ERRORS.fetch_add(1, Ordering::SeqCst);
    let msg = format!("{what}: {e}");
    eprintln!("[tracker] MATCH NOT SAVED — {msg}");
    if let Ok(mut slot) = LAST_WRITE_ERROR.lock() {
        *slot = Some(msg);
    }
}

/// Lines actually in the matches file. `None` when it cannot be read at all,
/// which is itself a persistence failure rather than "no matches yet".
fn disk_match_count(file: &Path) -> Option<usize> {
    if !file.exists() {
        return Some(0);
    }
    fs::read_to_string(file)
        .ok()
        .map(|t| t.lines().filter(|l| !l.trim().is_empty()).count())
}

/// Make the file agree with memory, rewriting it when it has fallen behind.
///
/// Appending per match is the fast path, but it has failed in the field: the
/// owner's install held **373 matches in memory against 25 on disk**, the file
/// untouched for three weeks, with no visible symptom — history is re-derived
/// from Arena's logs on every launch, so everything looked right until the logs
/// rotated. The root cause of that stall was never identified.
///
/// So rather than trusting the append, verify it. This runs after every batch:
/// if the file is short, the whole of memory is rewritten atomically (temp file
/// + rename, so an interrupted repair cannot lose what was already there).
///
/// Deleted matches are not in memory, so a repair cannot resurrect them.
///
/// Cheap by construction — a few hundred JSONL lines, once per match end — and
/// each repair is counted, so a silent write failure now shows up in the
/// diagnostic as a non-zero `persistRepairs` instead of as missing history.
fn reconcile_persistence(app: &AppHandle) {
    let shared = app.state::<TrackerShared>();
    let data = shared.0.lock().expect("tracker lock");
    let Some(file) = data.data_file.clone() else {
        // The one remaining silent path: no file to write to at all. Report it
        // rather than returning quietly, which is how this stayed invisible.
        note_write_error("no data file", &"app_data_dir did not resolve");
        return;
    };
    let in_memory = data.matches.len();
    match disk_match_count(&file) {
        Some(on_disk) if on_disk >= in_memory => {}
        Some(_) | None => match rewrite_matches(&file, &data.matches) {
            Ok(()) => {
                PERSIST_REPAIRS.fetch_add(1, Ordering::SeqCst);
                eprintln!("[tracker] rewrote match history — {in_memory} matches");
            }
            Err(e) => note_write_error("repair rewrite", &e),
        },
    }
}

fn append_match(file: &Path, m: &TrackedMatch) {
    if let Some(dir) = file.parent() {
        if let Err(e) = fs::create_dir_all(dir) {
            note_write_error("create_dir_all", &e);
            return;
        }
    }
    let json = match serde_json::to_string(m) {
        Ok(j) => j,
        Err(e) => {
            note_write_error("serialize", &e);
            return;
        }
    };
    match fs::OpenOptions::new().create(true).append(true).open(file) {
        Ok(mut f) => {
            if let Err(e) = writeln!(f, "{json}") {
                note_write_error("write", &e);
            }
        }
        Err(e) => note_write_error("open", &e),
    }
}

// ---------------------------------------------------------------------------
// Tests — fixtures are anonymized but shape-identical to a live 2026.60 log.
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    const AUTH: &str = r#"{ "transactionId": "t1", "requestId": 1, "timestamp": "639195495199502959", "authenticateResponse": { "clientId": "LOCALUSERID111111111111111", "sessionId": "s" } }"#;

    fn room_playing(match_id: &str, event: &str) -> String {
        format!(
            r#"{{ "transactionId": "t2", "requestId": 2, "timestamp": "1783952720500", "matchGameRoomStateChangedEvent": {{ "gameRoomInfo": {{ "gameRoomConfig": {{ "reservedPlayers": [ {{ "userId": "OPPONENTUSERID11111111111", "playerName": "Rival", "systemSeatId": 1, "teamId": 1, "courseId": "Avatar_Basic_JaceBeleren", "sessionId": "x", "platformId": "AndroidPhone", "eventId": "{event}" }}, {{ "userId": "LOCALUSERID111111111111111", "playerName": "Hero", "systemSeatId": 2, "teamId": 2, "courseId": "Avatar_Basic_Kaito", "sessionId": "y", "platformId": "Windows", "eventId": "{event}" }} ], "matchId": "{match_id}" }}, "stateType": "MatchGameRoomStateType_Playing", "players": [] }} }} }}"#
        )
    }

    fn room_completed(
        match_id: &str,
        event: &str,
        games: &[(u32, &str)],
        match_winner: u32,
    ) -> String {
        let mut results: Vec<String> = games
            .iter()
            .map(|(w, r)| {
                format!(
                    r#"{{ "scope": "MatchScope_Game", "result": "ResultType_WinLoss", "winningTeamId": {w}, "reason": "{r}" }}"#
                )
            })
            .collect();
        results.push(format!(
            r#"{{ "scope": "MatchScope_Match", "result": "ResultType_WinLoss", "winningTeamId": {match_winner}, "reason": "ResultReason_Game" }}"#
        ));
        format!(
            r#"{{ "transactionId": "t3", "requestId": 3, "timestamp": "1783953022767", "matchGameRoomStateChangedEvent": {{ "gameRoomInfo": {{ "gameRoomConfig": {{ "reservedPlayers": [ {{ "userId": "OPPONENTUSERID11111111111", "playerName": "Rival", "systemSeatId": 1, "teamId": 1, "eventId": "{event}" }}, {{ "userId": "LOCALUSERID111111111111111", "playerName": "Hero", "systemSeatId": 2, "teamId": 2, "eventId": "{event}" }} ], "matchId": "{match_id}" }}, "stateType": "MatchGameRoomStateType_MatchCompleted", "finalMatchResult": {{ "matchId": "{match_id}", "matchCompletedReason": "MatchCompletedReasonType_Success", "resultList": [ {} ] }} }} }} }}"#,
            results.join(", ")
        )
    }

    const COURSES: &str = r#"{"Courses":[{"CourseId":"c1","InternalEventName":"Ladder","CourseDeckSummary":{"DeckId":"deck-1","Name":"Izzet Cauldron","Attributes":[]},"CourseDeck":{"MainDeck":[{"cardId":101,"quantity":4},{"cardId":102,"quantity":2}],"Sideboard":[{"cardId":103,"quantity":1}]}}]}"#;

    const GRE_CONNECT: &str = r#"{ "transactionId": "t4", "timestamp": "1783952720532", "greToClientEvent": { "greToClientMessages": [ { "type": "GREMessageType_ConnectResp", "systemSeatIds": [ 2 ], "connectResp": { "status": "ConnectionStatus_Success", "deckMessage": { "deckCards": [ 101, 101, 101, 101, 102, 102 ], "sideboardCards": [ 103 ] } } } ] } }"#;

    const GRE_TURN1: &str = r#"{ "transactionId": "t5", "timestamp": "1783952730000", "greToClientEvent": { "greToClientMessages": [ { "type": "GREMessageType_GameStateMessage", "gameStateMessage": { "turnInfo": { "phase": "Phase_Beginning", "step": "Step_Upkeep", "turnNumber": 1, "activePlayer": 2, "priorityPlayer": 2, "decisionPlayer": 2 } } } ] } }"#;

    const RANK: &str = r#"{"constructedSeasonOrdinal":91,"constructedClass":"Diamond","constructedLevel":1,"constructedStep":2,"constructedMatchesWon":131,"constructedMatchesLost":116,"constructedMatchesDrawn":1,"limitedSeasonOrdinal":91,"limitedLevel":4}"#;

    const RANK_MYTHIC_PCT: &str = r#"{"constructedSeasonOrdinal":91,"constructedClass":"Mythic","constructedLevel":0,"constructedStep":0,"constructedPercentile":93.4,"constructedLeaderboardPlace":0,"constructedMatchesWon":140,"constructedMatchesLost":118,"constructedMatchesDrawn":1}"#;

    const RANK_MYTHIC_PLACE: &str = r#"{"constructedSeasonOrdinal":91,"constructedClass":"Mythic","constructedLevel":0,"constructedPercentile":100.0,"constructedLeaderboardPlace":874,"constructedMatchesWon":180,"constructedMatchesLost":120}"#;

    const RANK_MYTHIC_BARE: &str =
        r#"{"constructedSeasonOrdinal":91,"constructedClass":"Mythic","constructedLevel":0}"#;

    #[test]
    fn mythic_rank_stamps_percentile_place_or_bare() {
        let mut p = LogParser::new();
        p.feed_line(RANK_MYTHIC_PCT);
        assert_eq!(p.current_rank.as_deref(), Some("Mythic 93.4%"));
        // Leaderboard place beats percentile (top ~1200 players).
        p.feed_line(RANK_MYTHIC_PLACE);
        assert_eq!(p.current_rank.as_deref(), Some("Mythic #874"));
        // No percentile / place fields at all — plain Mythic, never invented.
        p.feed_line(RANK_MYTHIC_BARE);
        assert_eq!(p.current_rank.as_deref(), Some("Mythic"));
        // Non-mythic path is untouched.
        p.feed_line(RANK);
        assert_eq!(p.current_rank.as_deref(), Some("Diamond 1"));
    }

    #[test]
    fn rank_stamp_is_frozen_at_match_start_while_rank_now_moves() {
        let mut p = LogParser::new();
        p.feed_line(AUTH);
        p.feed_line(RANK_MYTHIC_PCT);
        p.feed_line(COURSES);
        p.feed_line(&room_playing("m-1", "Ladder"));
        let live = p.live_match().expect("playing");
        assert_eq!(live.my_rank.as_deref(), Some("Mythic 93.4%"));
        assert_eq!(live.rank_now.as_deref(), Some("Mythic 93.4%"));

        // The win lands, then Arena logs the rank it earned.
        let done = p.feed_line(&room_completed(
            "m-1",
            "Ladder",
            &[(2, "ResultReason_Game")],
            2,
        ));
        assert_eq!(done.len(), 1);
        // The recorded match keeps where the player sat down…
        assert_eq!(done[0].my_rank.as_deref(), Some("Mythic 93.4%"));
        p.consume_live_dirty();
        p.feed_line(RANK_MYTHIC_PLACE);
        // …while the parser follows the ladder, and wakes the HUD so the
        // lingering result card can finish its rank path.
        assert_eq!(p.current_rank().as_deref(), Some("Mythic #874"));
        assert!(p.consume_live_dirty(), "a rank move re-emits the HUD");
    }

    #[test]
    fn unchanged_rank_line_does_not_wake_the_hud() {
        let mut p = LogParser::new();
        p.feed_line(RANK);
        p.consume_live_dirty();
        // Arena repeats the rank payload on every login/queue — noise only.
        p.feed_line(RANK);
        assert!(!p.consume_live_dirty());
        assert_eq!(p.current_rank().as_deref(), Some("Diamond 1"));
    }

    fn full_match(parser: &mut LogParser) -> Vec<TrackedMatch> {
        let mut out = Vec::new();
        out.extend(parser.feed_line(AUTH));
        out.extend(parser.feed_line(RANK));
        out.extend(parser.feed_line(COURSES));
        out.extend(parser.feed_line(&room_playing("m-1", "Ladder")));
        out.extend(parser.feed_line(GRE_CONNECT));
        out.extend(parser.feed_line(GRE_TURN1));
        out.extend(parser.feed_line(&room_completed(
            "m-1",
            "Ladder",
            &[(2, "ResultReason_Game")],
            2,
        )));
        out
    }

    #[test]
    fn live_snapshot_while_playing_then_clears() {
        let mut p = LogParser::new();
        p.feed_line(AUTH);
        p.feed_line(RANK);
        p.feed_line(COURSES);
        p.feed_line(&room_playing("m-live", "Ladder"));
        let live = p.live_match().expect("playing");
        assert_eq!(live.match_id, "m-live");
        assert_eq!(live.phase, "playing");
        assert_eq!(live.opponent_name.as_deref(), Some("Rival"));
        assert_eq!(live.deck_name.as_deref(), Some("Izzet Cauldron"));
        assert_eq!(live.my_rank.as_deref(), Some("Diamond 1"));
        p.feed_line(GRE_CONNECT);
        let live2 = p.live_match().expect("still playing");
        assert!(live2.deck_hash.is_some());
        assert_eq!(live2.library_total, Some(6)); // GRE_CONNECT deckCards length
                                                  // GRE_CONNECT includes sideboardCards: [103] — exposed for the overlay tab.
        assert_eq!(live2.sideboard_total, Some(1));
        assert_eq!(live2.sideboard.len(), 1);
        assert_eq!(live2.sideboard[0].grp_id, 103);
        assert_eq!(live2.sideboard[0].remaining, 1);
        p.feed_line(&room_completed(
            "m-live",
            "Ladder",
            &[(2, "ResultReason_Game")],
            2,
        ));
        assert!(p.live_match().is_none());
    }

    #[test]
    fn bo3_live_snapshot_reports_best_of_and_sideboard() {
        let mut p = LogParser::new();
        p.feed_line(AUTH);
        p.feed_line(&room_playing("m-bo3", "Traditional_Ladder"));
        let gre_bo3 = r#"{ "transactionId": "t4", "timestamp": "1783952720532", "greToClientEvent": { "greToClientMessages": [ { "type": "GREMessageType_ConnectResp", "systemSeatIds": [ 2 ], "connectResp": { "status": "ConnectionStatus_Success", "deckMessage": { "deckCards": [ 101, 101, 101, 101, 102, 102 ], "sideboardCards": [ 103, 103, 104 ] } } } ] } }"#;
        p.feed_line(gre_bo3);
        let live = p.live_match().expect("playing Bo3");
        assert_eq!(live.best_of, 3);
        assert_eq!(live.sideboard_total, Some(3));
        let c103 = live.sideboard.iter().find(|c| c.grp_id == 103).unwrap();
        assert_eq!(c103.remaining, 2);
        assert_eq!(c103.total, 2);
        let c104 = live.sideboard.iter().find(|c| c.grp_id == 104).unwrap();
        assert_eq!(c104.remaining, 1);
    }

    #[test]
    fn library_tracker_decrements_on_hand_draw() {
        let mut p = LogParser::new();
        p.feed_line(AUTH);
        p.feed_line(&room_playing("m-lib", "Ladder"));
        p.feed_line(GRE_CONNECT);
        let before = p.live_match().unwrap().library_total.unwrap();
        assert_eq!(before, 6);
        // Diff: my seat is 2; hand zone 35, two cards leave library.
        let gsm = r#"{ "greToClientEvent": { "greToClientMessages": [ {
            "type": "GREMessageType_GameStateMessage",
            "gameStateMessage": {
              "type": "GameStateType_Diff",
              "zones": [
                { "zoneId": 35, "type": "ZoneType_Hand", "ownerSeatId": 2, "objectInstanceIds": [1, 2] },
                { "zoneId": 36, "type": "ZoneType_Library", "ownerSeatId": 2, "objectInstanceIds": [3,4,5,6] }
              ],
              "gameObjects": [
                { "type": "GameObjectType_Card", "instanceId": 1, "grpId": 101, "zoneId": 35, "ownerSeatId": 2 },
                { "type": "GameObjectType_Card", "instanceId": 2, "grpId": 101, "zoneId": 35, "ownerSeatId": 2 }
              ]
            }
        } ] } }"#;
        p.feed_line(gsm);
        let live = p.live_match().unwrap();
        assert_eq!(live.library_total, Some(4));
        let c101 = live.library.iter().find(|c| c.grp_id == 101).unwrap();
        assert_eq!(c101.remaining, 2); // started 4, drew 2
        assert_eq!(c101.total, 4);
    }

    /// Wrap one GameStateMessage body in the GRE envelope `feed_line` expects.
    fn gre_gsm(body: &str) -> String {
        format!(
            r#"{{ "greToClientEvent": {{ "greToClientMessages": [ {{
                "type": "GREMessageType_GameStateMessage",
                "gameStateMessage": {body}
            }} ] }} }}"#
        )
    }

    /// Regression (owner report, 2026-08-07: "overlay said 6 lands left, it was
    /// off by 6"). GRE mints a NEW instanceId every time a card changes zone —
    /// hand → battlefield for a land, hand → stack → battlefield for a spell.
    /// The old event-accumulating tracker counted each hop as a separate draw,
    /// so a deck lost one phantom copy per land played.
    #[test]
    fn replayed_instance_ids_do_not_double_count() {
        let mut p = LogParser::new();
        p.feed_line(AUTH);
        p.feed_line(&room_playing("m-ids", "Ladder"));
        p.feed_line(GRE_CONNECT);
        assert_eq!(p.live_match().unwrap().library_total, Some(6));

        // Draw two copies of 101 into hand.
        p.feed_line(&gre_gsm(
            r#"{
              "type": "GameStateType_Diff",
              "zones": [
                { "zoneId": 35, "type": "ZoneType_Hand", "ownerSeatId": 2, "objectInstanceIds": [1, 2] },
                { "zoneId": 36, "type": "ZoneType_Library", "ownerSeatId": 2, "objectInstanceIds": [3,4,5,6] }
              ],
              "gameObjects": [
                { "type": "GameObjectType_Card", "instanceId": 1, "grpId": 101, "zoneId": 35, "ownerSeatId": 2 },
                { "type": "GameObjectType_Card", "instanceId": 2, "grpId": 101, "zoneId": 35, "ownerSeatId": 2 }
              ]
            }"#,
        ));
        assert_eq!(p.live_match().unwrap().library_total, Some(4));

        // Play instance 1 — Arena re-ids it 1 → 20 on the way to the battlefield.
        p.feed_line(&gre_gsm(
            r#"{
              "type": "GameStateType_Diff",
              "annotations": [
                { "affectedIds": [1], "type": ["AnnotationType_ObjectIdChanged"], "details": [
                  { "key": "orig_id", "type": "KeyValuePairValueType_int32", "valueInt32": [1] },
                  { "key": "new_id", "type": "KeyValuePairValueType_int32", "valueInt32": [20] } ] }
              ],
              "zones": [
                { "zoneId": 34, "type": "ZoneType_Battlefield", "objectInstanceIds": [20] },
                { "zoneId": 35, "type": "ZoneType_Hand", "ownerSeatId": 2, "objectInstanceIds": [2] }
              ],
              "gameObjects": [
                { "type": "GameObjectType_Card", "instanceId": 20, "grpId": 101, "zoneId": 34, "ownerSeatId": 2 }
              ]
            }"#,
        ));
        let live = p.live_match().unwrap();
        assert_eq!(live.library_total, Some(4), "playing a card is not a draw");

        // It dies: 20 → 30 into the graveyard. Still the same physical card.
        p.feed_line(&gre_gsm(
            r#"{
              "type": "GameStateType_Diff",
              "annotations": [
                { "affectedIds": [20], "type": ["AnnotationType_ObjectIdChanged"], "details": [
                  { "key": "orig_id", "type": "KeyValuePairValueType_int32", "valueInt32": [20] },
                  { "key": "new_id", "type": "KeyValuePairValueType_int32", "valueInt32": [30] } ] }
              ],
              "zones": [
                { "zoneId": 34, "type": "ZoneType_Battlefield", "objectInstanceIds": [] },
                { "zoneId": 37, "type": "ZoneType_Graveyard", "ownerSeatId": 2, "objectInstanceIds": [30] }
              ],
              "gameObjects": [
                { "type": "GameObjectType_Card", "instanceId": 30, "grpId": 101, "zoneId": 37, "ownerSeatId": 2 }
              ]
            }"#,
        ));
        let live = p.live_match().unwrap();
        assert_eq!(live.library_total, Some(4), "dying is not a draw either");
        let c101 = live.library.iter().find(|c| c.grp_id == 101).unwrap();
        assert_eq!(c101.remaining, 2);
    }

    /// A card cast as its other face (MDFC back, Adventure half) reports a
    /// different grpId than the decklist registered — the copy has to be
    /// subtracted from the face the deck actually contains.
    #[test]
    fn alternate_face_is_charged_to_the_deck_face() {
        let mut p = LogParser::new();
        p.feed_line(AUTH);
        p.feed_line(&room_playing("m-mdfc", "Ladder"));
        p.feed_line(GRE_CONNECT);
        // 101 into hand, then cast as face 999.
        p.feed_line(&gre_gsm(
            r#"{
              "zones": [
                { "zoneId": 35, "type": "ZoneType_Hand", "ownerSeatId": 2, "objectInstanceIds": [1] },
                { "zoneId": 36, "type": "ZoneType_Library", "ownerSeatId": 2, "objectInstanceIds": [3,4,5,6,7] }
              ],
              "gameObjects": [
                { "type": "GameObjectType_Card", "instanceId": 1, "grpId": 101, "zoneId": 35, "ownerSeatId": 2 }
              ]
            }"#,
        ));
        p.feed_line(&gre_gsm(
            r#"{
              "annotations": [
                { "type": ["AnnotationType_ObjectIdChanged"], "details": [
                  { "key": "orig_id", "valueInt32": [1] },
                  { "key": "new_id", "valueInt32": [40] } ] }
              ],
              "zones": [
                { "zoneId": 33, "type": "ZoneType_Stack", "objectInstanceIds": [40] },
                { "zoneId": 35, "type": "ZoneType_Hand", "ownerSeatId": 2, "objectInstanceIds": [] }
              ],
              "gameObjects": [
                { "type": "GameObjectType_Card", "instanceId": 40, "grpId": 999, "zoneId": 33, "ownerSeatId": 2 }
              ]
            }"#,
        ));
        let live = p.live_match().unwrap();
        assert_eq!(live.library_total, Some(5));
        let c101 = live.library.iter().find(|c| c.grp_id == 101).unwrap();
        assert_eq!(c101.remaining, 3, "the deck face lost the copy, not 999");
        assert!(live.library.iter().all(|c| c.grp_id != 999));
    }

    /// Shuffled / put back on top: the count has to go back up. The old
    /// tracker only ever decremented, so a Brainstorm silently ate two cards.
    #[test]
    fn cards_returned_to_library_come_back() {
        let mut p = LogParser::new();
        p.feed_line(AUTH);
        p.feed_line(&room_playing("m-back", "Ladder"));
        p.feed_line(GRE_CONNECT);
        p.feed_line(&gre_gsm(
            r#"{
              "zones": [
                { "zoneId": 35, "type": "ZoneType_Hand", "ownerSeatId": 2, "objectInstanceIds": [1, 2] },
                { "zoneId": 36, "type": "ZoneType_Library", "ownerSeatId": 2, "objectInstanceIds": [3,4,5,6] }
              ],
              "gameObjects": [
                { "type": "GameObjectType_Card", "instanceId": 1, "grpId": 101, "zoneId": 35, "ownerSeatId": 2 },
                { "type": "GameObjectType_Card", "instanceId": 2, "grpId": 101, "zoneId": 35, "ownerSeatId": 2 }
              ]
            }"#,
        ));
        assert_eq!(p.live_match().unwrap().library_total, Some(4));
        // Both go back on top of the library.
        p.feed_line(&gre_gsm(
            r#"{
              "zones": [
                { "zoneId": 35, "type": "ZoneType_Hand", "ownerSeatId": 2, "objectInstanceIds": [] },
                { "zoneId": 36, "type": "ZoneType_Library", "ownerSeatId": 2, "objectInstanceIds": [1,2,3,4,5,6] }
              ]
            }"#,
        ));
        assert_eq!(p.live_match().unwrap().library_total, Some(6));
    }

    #[test]
    fn live_exposes_turn_on_play_and_mulligans() {
        let mut p = LogParser::new();
        p.feed_line(AUTH);
        p.feed_line(&room_playing("m-hud", "Ladder"));
        p.feed_line(GRE_CONNECT);
        let live = p.live_match().expect("playing");
        assert_eq!(live.turn, None);
        assert_eq!(live.on_play, None);
        assert_eq!(live.mulligans, Some(0));

        p.feed_line(GRE_TURN1);
        let live = p.live_match().expect("playing");
        assert_eq!(live.turn, Some(1));
        assert_eq!(live.on_play, Some(true)); // active seat 2 == my seat
        assert_eq!(live.mulligans, Some(0));

        // A later turnInfo advances the live turn and flags a HUD re-emit.
        p.consume_live_dirty();
        let gsm_t7 = r#"{ "greToClientEvent": { "greToClientMessages": [ {
            "type": "GREMessageType_GameStateMessage",
            "gameStateMessage": { "turnInfo": { "phase": "Phase_Main1", "turnNumber": 7, "activePlayer": 1 } }
        } ] } }"#;
        p.feed_line(gsm_t7);
        assert!(p.consume_live_dirty(), "turn change re-emits the HUD");
        assert_eq!(p.live_match().unwrap().turn, Some(7));
    }

    #[test]
    fn records_a_win_with_deck_rank_and_play_draw() {
        let mut p = LogParser::new();
        let matches = full_match(&mut p);
        assert_eq!(matches.len(), 1);
        let m = &matches[0];
        assert_eq!(m.result, "win");
        assert_eq!(m.match_id, "m-1");
        assert_eq!(m.event_id, "Ladder");
        assert_eq!(m.best_of, 1);
        assert_eq!(m.opponent_name.as_deref(), Some("Rival"));
        assert_eq!(m.my_player_name.as_deref(), Some("Hero"));
        assert_eq!(m.my_team_id, 2);
        assert_eq!(m.deck_name.as_deref(), Some("Izzet Cauldron"));
        assert_eq!(m.deck_id.as_deref(), Some("deck-1"));
        assert!(m.deck_hash.is_some());
        assert_eq!(
            m.deck_main.as_deref(),
            Some(&[101, 101, 101, 101, 102, 102][..])
        );
        assert_eq!(m.deck_side.as_deref(), Some(&[103][..]));
        assert_eq!(m.season_ordinal, Some(91));
        assert_eq!(m.my_rank.as_deref(), Some("Diamond 1"));
        assert_eq!(m.games.len(), 1);
        assert_eq!(m.games[0].on_play, Some(true));
        assert_eq!(m.started_at, 1783952720500);
        assert_eq!(m.ended_at, 1783953022767);
        assert_eq!(p.parse_errors, 0);
    }

    #[test]
    fn match_end_body_has_result_opp_season_pct_and_rank() {
        let mut p = LogParser::new();
        let matches = full_match(&mut p);
        let m = &matches[0];
        let body = match_end_body(m, &matches);
        assert!(body.starts_with("Win vs Rival"), "{body}");
        assert!(body.contains("100% this season"), "{body}");
        assert!(body.ends_with("· Diamond 1"), "{body}");
    }

    #[test]
    fn match_end_body_season_pct_counts_same_deck_same_month_only() {
        let mut p = LogParser::new();
        let matches = full_match(&mut p);
        let base = matches[0].clone();

        // Same deck, same month, a loss → 1W/1L = 50%.
        let mut loss = base.clone();
        loss.match_id = "m-2".to_string();
        loss.result = "loss".to_string();
        loss.ended_at = base.ended_at + 60_000;

        // Different deck, same month — must not move the pct.
        let mut other_deck = base.clone();
        other_deck.match_id = "m-3".to_string();
        other_deck.result = "loss".to_string();
        other_deck.ended_at = base.ended_at + 120_000;
        other_deck.deck_id = Some("deck-9".to_string());
        other_deck.deck_name = Some("Mono Green".to_string());
        other_deck.deck_hash = Some("other-hash".to_string());

        // Same deck, 40 days later — different month, must not move the pct.
        let mut other_month = base.clone();
        other_month.match_id = "m-4".to_string();
        other_month.result = "loss".to_string();
        other_month.ended_at = base.ended_at + 40 * 86_400_000;

        let history = vec![base, loss.clone(), other_deck, other_month];
        let body = match_end_body(&loss, &history);
        assert!(body.starts_with("Loss vs Rival"), "{body}");
        assert!(body.contains("50% this season"), "{body}");
    }

    #[test]
    fn match_end_body_omits_pct_and_rank_when_unknown() {
        let mut p = LogParser::new();
        let matches = full_match(&mut p);
        let mut m = matches[0].clone();
        m.deck_id = None;
        m.deck_name = None;
        m.deck_hash = None;
        m.my_rank = None;
        m.opponent_name = None;
        let history = vec![m.clone()];
        assert_eq!(match_end_body(&m, &history), "Win vs opponent");
    }

    #[test]
    fn records_a_loss_when_opponent_team_wins() {
        let mut p = LogParser::new();
        p.feed_line(AUTH);
        p.feed_line(&room_playing("m-2", "Ladder"));
        let done = p.feed_line(&room_completed(
            "m-2",
            "Ladder",
            &[(1, "ResultReason_Concede")],
            1,
        ));
        assert_eq!(done.len(), 1);
        assert_eq!(done[0].result, "loss");
        assert_eq!(done[0].result_reason.as_deref(), Some("ResultReason_Game"));
    }

    #[test]
    fn bo3_match_collects_all_games() {
        let mut p = LogParser::new();
        p.feed_line(AUTH);
        p.feed_line(&room_playing("m-3", "Traditional_Ladder"));
        let done = p.feed_line(&room_completed(
            "m-3",
            "Traditional_Ladder",
            &[
                (2, "ResultReason_Game"),
                (1, "ResultReason_Game"),
                (2, "ResultReason_Concede"),
            ],
            2,
        ));
        assert_eq!(done.len(), 1);
        let m = &done[0];
        assert_eq!(m.best_of, 3);
        assert_eq!(m.games.len(), 3);
        assert_eq!(m.result, "win");
    }

    #[test]
    fn completion_without_start_still_records() {
        // Match started in a rotated log — the completion event is enough.
        let mut p = LogParser::new();
        p.feed_line(AUTH);
        let done = p.feed_line(&room_completed(
            "m-4",
            "Ladder",
            &[(1, "ResultReason_Game")],
            1,
        ));
        assert_eq!(done.len(), 1);
        assert_eq!(done[0].result, "loss");
        assert_eq!(done[0].opponent_name.as_deref(), Some("Rival"));
    }

    #[test]
    fn detailed_logs_flag_detected() {
        let mut p = LogParser::new();
        assert_eq!(p.detailed_logs(), None);
        p.feed_line("[43689] [Client GRE] DETAILED LOGS: DISABLED");
        assert_eq!(p.detailed_logs(), Some(false));
        p.feed_line("[43689] [Client GRE] DETAILED LOGS: ENABLED");
        assert_eq!(p.detailed_logs(), Some(true));
    }

    #[test]
    fn local_user_from_header_line() {
        let mut p = LogParser::new();
        p.feed_line("[UnityCrossThreadLogger]7/13/2026 10:25:20 PM: Match to LOCALUSERID111111111111111: AuthenticateResponse");
        p.feed_line(&room_playing("m-5", "Ladder"));
        let done = p.feed_line(&room_completed("m-5", "Ladder", &[(2, "r")], 2));
        assert_eq!(done[0].result, "win");
    }

    #[test]
    fn timestamp_heuristic_handles_ticks_and_ms() {
        let ticks = serde_json::json!({ "timestamp": "639195495199502959" });
        let ms = serde_json::json!({ "timestamp": "1783952720500" });
        let t = payload_timestamp_ms(&ticks).unwrap();
        // 2026-07-13-ish in unix ms.
        assert!(t > 1_750_000_000_000 && t < 1_850_000_000_000, "got {t}");
        assert_eq!(payload_timestamp_ms(&ms), Some(1_783_952_720_500));
    }

    #[test]
    fn turn1_scan_ignores_later_turns() {
        assert_eq!(
            find_turn1_active_player(
                r#"{"turnInfo": { "phase": "Phase_Main1", "turnNumber": 12, "activePlayer": 1 }}"#
            ),
            None
        );
        assert_eq!(
            find_turn1_active_player(
                r#"{"turnInfo": { "phase": "Phase_Beginning", "turnNumber": 1, "activePlayer": 2 }}"#
            ),
            Some(2)
        );
    }

    #[test]
    fn deck_hash_is_stable_and_order_independent() {
        assert_eq!(fingerprint(&[101, 102, 101]), fingerprint(&[101, 101, 102]));
        assert_ne!(fingerprint(&[101, 101]), fingerprint(&[101, 102]));
    }

    #[test]
    fn draw_result_detected() {
        let mut p = LogParser::new();
        p.feed_line(AUTH);
        p.feed_line(&room_playing("m-6", "Ladder"));
        let line = r#"{ "timestamp": "1783953022767", "matchGameRoomStateChangedEvent": { "gameRoomInfo": { "gameRoomConfig": { "reservedPlayers": [ { "userId": "LOCALUSERID111111111111111", "playerName": "Hero", "teamId": 2, "systemSeatId": 2, "eventId": "Ladder" } ], "matchId": "m-6" }, "stateType": "MatchGameRoomStateType_MatchCompleted", "finalMatchResult": { "resultList": [ { "scope": "MatchScope_Match", "result": "ResultType_Draw" } ] } } } }"#;
        let done = p.feed_line(line);
        assert_eq!(done[0].result, "draw");
    }

    #[test]
    fn huge_initial_chunk_is_not_dropped() {
        // The first tail tick reads the whole existing log as ONE chunk,
        // which can far exceed MAX_LINE_BYTES. Every complete line must
        // still be parsed — only an unterminated tail may be discarded.
        let mut p = LogParser::new();
        let mut carry = String::new();
        let padding = format!("[padding] {}\n", "x".repeat(1000)).repeat(12 * 1024); // ~12 MB
        carry.push_str(AUTH);
        carry.push('\n');
        carry.push_str(&padding);
        carry.push_str(&room_playing("m-big", "Ladder"));
        carry.push('\n');
        carry.push_str(&room_completed("m-big", "Ladder", &[(2, "r")], 2));
        carry.push('\n');
        carry.push_str("partial line without newline");
        assert!(carry.len() > MAX_LINE_BYTES);
        let done = drain_complete_lines(&mut carry, &mut p);
        assert_eq!(done.len(), 1);
        assert_eq!(done[0].result, "win");
        assert_eq!(carry, "partial line without newline");
    }

    #[test]
    fn oversized_unterminated_tail_is_capped() {
        let mut p = LogParser::new();
        let mut carry = "no newline at all ".repeat(600_000); // > MAX_LINE_BYTES
        assert!(carry.len() > MAX_LINE_BYTES);
        let done = drain_complete_lines(&mut carry, &mut p);
        assert!(done.is_empty());
        assert!(carry.is_empty());
    }

    #[test]
    fn old_jsonl_lines_without_new_fields_still_load() {
        // Matches recorded by v0.9.0 lack deckMain/deckSide/seasonOrdinal.
        let line = r#"{"matchId":"m-old","startedAt":1,"endedAt":2,"eventId":"Ladder","bestOf":1,"myTeamId":2,"games":[],"result":"win"}"#;
        let m: TrackedMatch = serde_json::from_str(line).expect("old line parses");
        assert_eq!(m.deck_main, None);
        assert_eq!(m.season_ordinal, None);
    }

    #[test]
    fn rewrite_and_tombstones_survive_reload() {
        let dir = std::env::temp_dir().join(format!("fnd-tracker-test-{}", std::process::id()));
        let matches_file = dir.join(MATCHES_FILE);
        let deleted_file = dir.join(DELETED_FILE);
        let _ = fs::remove_dir_all(&dir);

        let mut p = LogParser::new();
        let all = full_match(&mut p);
        for m in &all {
            append_match(&matches_file, m);
        }
        assert_eq!(load_matches(&matches_file).len(), 1);

        // Delete everything, tombstone the ids, reload: nothing comes back.
        rewrite_matches(&matches_file, &[]).expect("rewrite");
        let ids: HashSet<String> = all.iter().map(|m| m.match_id.clone()).collect();
        save_deleted(&deleted_file, &ids);
        assert!(load_matches(&matches_file).is_empty());
        assert!(load_deleted(&deleted_file).contains("m-1"));

        let _ = fs::remove_dir_all(&dir);
    }

    /// The repair the reconcile pass performs: whatever caused appends to stop,
    /// a file that is short of memory gets rewritten from memory.
    #[test]
    fn a_short_file_is_rewritten_from_memory() {
        let dir = std::env::temp_dir().join(format!("fnd-reconcile-{}", std::process::id()));
        let file = dir.join(MATCHES_FILE);
        let _ = fs::remove_dir_all(&dir);

        let mut p = LogParser::new();
        let all = full_match(&mut p);
        assert_eq!(all.len(), 1);

        // Memory has the match; the file was never written — the field failure.
        assert_eq!(disk_match_count(&file), Some(0));
        rewrite_matches(&file, &all).expect("repair");
        assert_eq!(disk_match_count(&file), Some(1));
        assert_eq!(load_matches(&file).len(), 1);

        // Idempotent: a second repair with the same memory is a no-op in effect.
        rewrite_matches(&file, &all).expect("repair again");
        assert_eq!(disk_match_count(&file), Some(1));

        // A deleted match is not in memory, so a repair cannot resurrect it.
        rewrite_matches(&file, &[]).expect("repair empty");
        assert_eq!(disk_match_count(&file), Some(0));

        let _ = fs::remove_dir_all(&dir);
    }

    /// Load a committed anonymized fixture under `tests/fixtures/logs/`.
    fn fixture_log(name: &str) -> String {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("logs")
            .join(name);
        fs::read_to_string(&path).unwrap_or_else(|e| panic!("read fixture {}: {e}", path.display()))
    }

    fn replay_text(text: &str) -> (LogParser, Vec<TrackedMatch>) {
        let mut p = LogParser::new();
        let mut matches = Vec::new();
        for line in text.split('\n') {
            matches.extend(p.feed_line(line));
        }
        (p, matches)
    }

    #[test]
    fn opponent_cards_seen_from_gre_game_objects() {
        let mut p = LogParser::new();
        p.feed_line(AUTH);
        p.feed_line(&room_playing("m-opp", "Ladder"));
        // Opponent seat 1 plays grp 777 on battlefield; our seat is 2.
        let gsm = r#"{ "greToClientEvent": { "greToClientMessages": [ {
            "type": "GREMessageType_GameStateMessage",
            "gameStateMessage": {
              "type": "GameStateType_Diff",
              "zones": [
                { "zoneId": 10, "type": "ZoneType_Battlefield", "ownerSeatId": 1, "objectInstanceIds": [50] },
                { "zoneId": 11, "type": "ZoneType_Graveyard", "ownerSeatId": 1, "objectInstanceIds": [51] }
              ],
              "gameObjects": [
                { "type": "GameObjectType_Card", "instanceId": 50, "grpId": 777, "zoneId": 10, "ownerSeatId": 1 },
                { "type": "GameObjectType_Card", "instanceId": 51, "grpId": 888, "zoneId": 11, "ownerSeatId": 1 },
                { "type": "GameObjectType_Card", "instanceId": 52, "grpId": 101, "zoneId": 10, "ownerSeatId": 2 }
              ]
            }
        } ] } }"#;
        p.feed_line(gsm);
        let live = p.live_match().expect("playing");
        assert!(live.opponent_seen.contains(&777), "battlefield opp card");
        assert!(live.opponent_seen.contains(&888), "graveyard opp card");
        assert!(
            !live.opponent_seen.contains(&101),
            "must not include our cards"
        );
        let done = p.feed_line(&room_completed(
            "m-opp",
            "Ladder",
            &[(2, "ResultReason_Game")],
            2,
        ));
        assert_eq!(done.len(), 1);
        let seen = done[0].opponent_seen.as_ref().expect("persisted");
        assert_eq!(seen, &vec![777, 888]);
    }

    /// Basic lands carry their colour in Arena's own `subtypes`, not in a
    /// resolvable grpId. Shape copied from a real Player.log game object.
    #[test]
    fn opponent_basic_land_types_come_from_subtypes() {
        let mut p = LogParser::new();
        p.feed_line(AUTH);
        p.feed_line(&room_playing("m-basics", "Ladder"));
        // Opponent (seat 1) has a basic Swamp and a Hallowed Fountain-alike on
        // the battlefield, plus a basic Island still in their library. Our own
        // basic Mountain (seat 2) must never count as their evidence.
        let gsm = r#"{ "greToClientEvent": { "greToClientMessages": [ {
            "type": "GREMessageType_GameStateMessage",
            "gameStateMessage": {
              "type": "GameStateType_Diff",
              "zones": [
                { "zoneId": 10, "type": "ZoneType_Battlefield", "ownerSeatId": 1, "objectInstanceIds": [50, 53] },
                { "zoneId": 31, "type": "ZoneType_Library", "ownerSeatId": 1, "objectInstanceIds": [51] },
                { "zoneId": 12, "type": "ZoneType_Battlefield", "ownerSeatId": 2, "objectInstanceIds": [52] }
              ],
              "gameObjects": [
                { "type": "GameObjectType_Card", "instanceId": 50, "grpId": 87457, "zoneId": 10, "ownerSeatId": 1,
                  "superTypes": ["SuperType_Basic"], "cardTypes": ["CardType_Land"], "subtypes": ["SubType_Swamp"] },
                { "type": "GameObjectType_Card", "instanceId": 53, "grpId": 91234, "zoneId": 10, "ownerSeatId": 1,
                  "cardTypes": ["CardType_Land"], "subtypes": ["SubType_Plains", "SubType_Island"] },
                { "type": "GameObjectType_Card", "instanceId": 51, "grpId": 95817, "zoneId": 31, "ownerSeatId": 1,
                  "superTypes": ["SuperType_Basic"], "cardTypes": ["CardType_Land"], "subtypes": ["SubType_Island"] },
                { "type": "GameObjectType_Card", "instanceId": 52, "grpId": 60001, "zoneId": 12, "ownerSeatId": 2,
                  "superTypes": ["SuperType_Basic"], "cardTypes": ["CardType_Land"], "subtypes": ["SubType_Mountain"] }
              ]
            }
        } ] } }"#;
        p.feed_line(gsm);
        let live = p.live_match().expect("playing");
        assert_eq!(
            live.opponent_basics,
            vec!["Swamp".to_string()],
            "only the opponent's revealed basic; not their library, not a \
             non-basic dual, not our own Mountain"
        );
        let done = p.feed_line(&room_completed(
            "m-basics",
            "Ladder",
            &[(2, "ResultReason_Game")],
            2,
        ));
        assert_eq!(done.len(), 1);
        assert_eq!(
            done[0].opponent_basics.as_ref().expect("persisted"),
            &vec!["Swamp".to_string()]
        );
    }

    /// B2 — library growth before turn 1 counts as a mulligan; first land turn stamps.
    #[test]
    fn mulligans_and_first_land_turn_from_gre() {
        let mut p = LogParser::new();
        p.feed_line(AUTH);
        p.feed_line(&room_playing("m-mull", "Ladder"));
        p.feed_line(GRE_CONNECT);
        // Opening hand draws: library shrinks 6 → 0 remaining instances (tracked).
        let draw = r#"{ "greToClientEvent": { "greToClientMessages": [ {
            "type": "GREMessageType_GameStateMessage",
            "gameStateMessage": {
              "zones": [
                { "zoneId": 36, "type": "ZoneType_Library", "ownerSeatId": 2, "objectInstanceIds": [] },
                { "zoneId": 35, "type": "ZoneType_Hand", "ownerSeatId": 2, "objectInstanceIds": [1,2,3,4,5,6] }
              ],
              "gameObjects": [
                { "type": "GameObjectType_Card", "instanceId": 1, "grpId": 101, "zoneId": 35, "ownerSeatId": 2 },
                { "type": "GameObjectType_Card", "instanceId": 2, "grpId": 101, "zoneId": 35, "ownerSeatId": 2 },
                { "type": "GameObjectType_Card", "instanceId": 3, "grpId": 101, "zoneId": 35, "ownerSeatId": 2 },
                { "type": "GameObjectType_Card", "instanceId": 4, "grpId": 101, "zoneId": 35, "ownerSeatId": 2 },
                { "type": "GameObjectType_Card", "instanceId": 5, "grpId": 102, "zoneId": 35, "ownerSeatId": 2 },
                { "type": "GameObjectType_Card", "instanceId": 6, "grpId": 102, "zoneId": 35, "ownerSeatId": 2 }
              ]
            }
        } ] } }"#;
        p.feed_line(draw);
        // Mulligan: library grows again (cards returned).
        let mull = r#"{ "greToClientEvent": { "greToClientMessages": [ {
            "type": "GREMessageType_GameStateMessage",
            "gameStateMessage": {
              "zones": [
                { "zoneId": 36, "type": "ZoneType_Library", "ownerSeatId": 2, "objectInstanceIds": [1,2,3,4,5,6] },
                { "zoneId": 35, "type": "ZoneType_Hand", "ownerSeatId": 2, "objectInstanceIds": [] }
              ]
            }
        } ] } }"#;
        p.feed_line(mull);
        // Turn 1 locks mulligans; we're on the play (seat 2 active).
        p.feed_line(GRE_TURN1);
        // Second turn + first land on battlefield.
        let land = r#"{ "greToClientEvent": { "greToClientMessages": [ {
            "type": "GREMessageType_GameStateMessage",
            "gameStateMessage": {
              "turnInfo": { "turnNumber": 2, "activePlayer": 2 },
              "zones": [
                { "zoneId": 10, "type": "ZoneType_Battlefield", "ownerSeatId": 2, "objectInstanceIds": [99] }
              ],
              "gameObjects": [
                { "type": "GameObjectType_Card", "instanceId": 99, "grpId": 500, "zoneId": 10, "ownerSeatId": 2, "cardTypes": ["CardType_Land"] }
              ]
            }
        } ] } }"#;
        p.feed_line(land);
        let done = p.feed_line(&room_completed(
            "m-mull",
            "Ladder",
            &[(2, "ResultReason_Game")],
            2,
        ));
        assert_eq!(done.len(), 1);
        let g = &done[0].games[0];
        assert_eq!(g.mulligans, Some(1), "one library-growth mulligan");
        assert_eq!(g.first_land_turn, Some(2));
        assert_eq!(g.on_play, Some(true));
    }

    #[test]
    fn kept_seven_records_zero_mulligans() {
        let mut p = LogParser::new();
        p.feed_line(AUTH);
        p.feed_line(&room_playing("m-keep", "Ladder"));
        p.feed_line(GRE_CONNECT);
        p.feed_line(GRE_TURN1);
        let done = p.feed_line(&room_completed(
            "m-keep",
            "Ladder",
            &[(2, "ResultReason_Game")],
            2,
        ));
        assert_eq!(done[0].games[0].mulligans, Some(0));
        assert_eq!(done[0].games[0].first_land_turn, None);
    }

    /// C4 — committed corpus of anonymized log fixtures (runs in CI).
    #[test]
    fn fixture_bo1_win_full() {
        let (p, matches) = replay_text(&fixture_log("bo1_win_full.log"));
        assert_eq!(matches.len(), 1, "expected one completed match");
        let m = &matches[0];
        assert_eq!(m.match_id, "m-fixture-bo1");
        assert_eq!(m.result, "win");
        assert_eq!(m.event_id, "Ladder");
        assert_eq!(m.best_of, 1);
        assert_eq!(m.opponent_name.as_deref(), Some("Rival"));
        assert_eq!(m.my_player_name.as_deref(), Some("Hero"));
        assert_eq!(m.deck_name.as_deref(), Some("Izzet Cauldron"));
        assert_eq!(m.deck_id.as_deref(), Some("deck-1"));
        assert_eq!(m.my_rank.as_deref(), Some("Diamond 1"));
        assert_eq!(m.games.len(), 1);
        assert_eq!(m.games[0].on_play, Some(true));
        assert_eq!(p.detailed_logs(), Some(true));
        assert_eq!(p.parse_errors, 0);
    }

    #[test]
    fn fixture_bo3_win() {
        let (_p, matches) = replay_text(&fixture_log("bo3_win.log"));
        assert_eq!(matches.len(), 1);
        let m = &matches[0];
        assert_eq!(m.match_id, "m-fixture-bo3");
        assert_eq!(m.event_id, "Traditional_Ladder");
        assert_eq!(m.best_of, 3);
        assert_eq!(m.games.len(), 3);
        assert_eq!(m.result, "win");
        assert_eq!(m.opponent_name.as_deref(), Some("Bo3Rival"));
    }

    #[test]
    fn fixture_loss_and_orphan_complete() {
        let (_p, matches) = replay_text(&fixture_log("loss_and_orphan_complete.log"));
        assert_eq!(matches.len(), 2, "loss + orphan completion");
        let loss = matches
            .iter()
            .find(|m| m.match_id == "m-fixture-loss")
            .expect("loss");
        assert_eq!(loss.result, "loss");
        assert_eq!(loss.opponent_name.as_deref(), Some("Conceder"));
        let orphan = matches
            .iter()
            .find(|m| m.match_id == "m-fixture-orphan")
            .expect("orphan");
        assert_eq!(orphan.result, "win");
        assert_eq!(orphan.opponent_name.as_deref(), Some("Orphan"));
    }

    #[test]
    fn fixture_draw_and_detailed_logs() {
        let (p, matches) = replay_text(&fixture_log("draw_and_detailed_logs.log"));
        assert_eq!(p.detailed_logs(), Some(true));
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].result, "draw");
        assert_eq!(matches[0].match_id, "m-fixture-draw");
    }

    /// Local check of the persistence repair against real data (not run in CI):
    /// `FND_DATA_DIR=<copy of the app data dir> FND_LOG_DIR=<MTGA dir>
    ///  cargo test replay_persistence_repair -- --nocapture --ignored`
    ///
    /// Point it at a **copy** — it rewrites the matches file, exactly as the
    /// running app now would. Reports what the launch sequence recovers.
    #[test]
    #[ignore]
    fn replay_persistence_repair() {
        let (Ok(data_dir), Ok(log_dir)) =
            (std::env::var("FND_DATA_DIR"), std::env::var("FND_LOG_DIR"))
        else {
            eprintln!("FND_DATA_DIR / FND_LOG_DIR not set — skipping");
            return;
        };
        let data_dir = PathBuf::from(data_dir);
        let file = data_dir.join(MATCHES_FILE);
        let deleted = load_deleted(&data_dir.join(DELETED_FILE));

        // Same order as run_loop: tombstones, then the file, then the logs.
        let mut recorded: HashSet<String> = deleted.clone();
        let mut memory: Vec<TrackedMatch> = Vec::new();
        for m in load_matches(&file) {
            if recorded.insert(m.match_id.clone()) {
                memory.push(m);
            }
        }
        let before = memory.len();
        eprintln!("on disk at launch: {before}, tombstones: {}", deleted.len());

        for name in ["Player-prev.log", "Player.log"] {
            let path = PathBuf::from(&log_dir).join(name);
            let Ok(bytes) = fs::read(&path) else { continue };
            let text = String::from_utf8_lossy(&bytes);
            let mut p = LogParser::new();
            for line in text.split('\n') {
                for m in p.feed_line(line) {
                    if recorded.insert(m.match_id.clone()) {
                        memory.push(m);
                    }
                }
            }
        }
        eprintln!("in memory after backfill: {}", memory.len());

        rewrite_matches(&file, &memory).expect("repair");
        let after = disk_match_count(&file).expect("count");
        eprintln!(
            "on disk after repair: {after} (recovered {})",
            after - before
        );
        assert_eq!(after, memory.len(), "repair must persist all of memory");
        for m in load_matches(&file) {
            assert!(
                !deleted.contains(&m.match_id),
                "a repair resurrected a deleted match"
            );
        }
    }

    /// Optional local debug against a real Player.log (not run in CI):
    /// `FND_REPLAY_LOG=path cargo test replay_real_log -- --nocapture --ignored`
    #[test]
    #[ignore]
    fn replay_real_log() {
        let Ok(path) = std::env::var("FND_REPLAY_LOG") else {
            eprintln!("FND_REPLAY_LOG not set — skipping");
            return;
        };
        let text = fs::read(&path).expect("read log");
        let text = String::from_utf8_lossy(&text);
        let (p, matches) = replay_text(&text);
        eprintln!(
            "== {} matches, detailed_logs={:?}, player={:?}, parse_errors={}",
            matches.len(),
            p.detailed_logs(),
            p.local_player_name(),
            p.parse_errors
        );
        for m in &matches {
            eprintln!(
                "{} | {} | vs {:<18} | {:<4} | games {} | deck {:?} | rank {:?} | onPlay {:?}",
                m.started_at,
                m.event_id,
                m.opponent_name.as_deref().unwrap_or("?"),
                m.result,
                m.games.len(),
                m.deck_name,
                m.my_rank,
                m.games.iter().map(|g| g.on_play).collect::<Vec<_>>()
            );
            // Opponent-revealed card ids. Set FND_REPLAY_OPP=<name substring>
            // to dump them for one opponent, or `*` for every match — this is
            // what the archetype read is actually built from, so it is the
            // ground truth when a guess looks impossible (e.g. a blue colour
            // call with no blue cards).
            if let Ok(want) = std::env::var("FND_REPLAY_OPP") {
                let name = m.opponent_name.as_deref().unwrap_or("");
                let hit = want == "*" || name.to_lowercase().contains(&want.to_lowercase());
                if !want.is_empty() && hit {
                    let seen = m.opponent_seen.clone().unwrap_or_default();
                    eprintln!("    opponentSeen ({}): {:?}", seen.len(), seen);
                    // Arena's own basic-land types for that seat — the colour
                    // evidence that does *not* depend on resolving a grpId.
                    eprintln!(
                        "    opponentBasics: {:?}",
                        m.opponent_basics.clone().unwrap_or_default()
                    );
                }
            }
        }

        // `my_rank` is frozen at match start, so a ranked result should be
        // followed by a *different* rank in the log — that delta is what the
        // post-match card's rank path closes on (`rank_now`). Replay line by
        // line and report the move each result earned.
        let mut p2 = LogParser::new();
        let mut pending: Option<(String, Option<String>)> = None;
        let mut earned = 0usize;
        for line in text.split('\n') {
            for done in p2.feed_line(line) {
                pending = Some((done.result.clone(), done.my_rank.clone()));
            }
            let Some((result, before)) = pending.as_ref() else {
                continue;
            };
            let now = p2.current_rank();
            if now.is_some() && now != *before {
                eprintln!(
                    "{result:<5} | started {:<14} | earned {}",
                    before.as_deref().unwrap_or("?"),
                    now.as_deref().unwrap_or("?"),
                );
                earned += 1;
                pending = None;
            }
        }
        eprintln!("== {earned}/{} results closed on a new rank", matches.len());
    }

    /// Ground-truth check for the library counter against a real Player.log.
    /// Arena reports the true size of my library zone on every game state, so
    /// the tracker's `library_total` must equal it on every single tick — the
    /// overlay has no licence to be even one card off.
    ///
    /// `FND_REPLAY_LOG=".../Player.log" cargo test library_count_matches_arena
    ///   -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn library_count_matches_arena_on_every_tick() {
        let Ok(path) = std::env::var("FND_REPLAY_LOG") else {
            eprintln!("FND_REPLAY_LOG not set — skipping");
            return;
        };
        let text = fs::read(&path).expect("read log");
        let text = String::from_utf8_lossy(&text);

        let mut p = LogParser::new();
        let (mut ticks, mut worst) = (0u32, 0i64);
        let mut mismatches: Vec<(u32, u32)> = Vec::new();
        for line in text.split('\n') {
            p.feed_line(line);
            // Only meaningful once a decklist is seeded and Arena has told us
            // how big the library is.
            let (Some(truth), Some(live)) = (p.deck_tracker.library_count(), p.live_match()) else {
                continue;
            };
            let Some(total) = live.library_total else {
                continue;
            };
            ticks += 1;
            if total != truth {
                let drift = total as i64 - truth as i64;
                if drift.abs() > worst.abs() {
                    worst = drift;
                }
                if mismatches.len() < 20 {
                    mismatches.push((truth, total));
                }
            }
        }
        eprintln!("== {ticks} ticks checked, {} mismatched", mismatches.len());
        assert!(ticks > 0, "no library ticks in {path} — wrong log?");
        assert!(
            mismatches.is_empty(),
            "library count drifted (worst {worst:+}); first cases (arena, overlay): {mismatches:?}"
        );
    }
}

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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub my_rank: Option<String>,
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
    out.sort_by(|a, b| b.started_at.cmp(&a.started_at));
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
    fn iso_date(ms: u64) -> String {
        // Days since epoch → Y-M-D (civil calendar), no chrono dependency.
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

    let matches = {
        let data = state.0.lock().expect("tracker lock");
        let mut out = data.matches.clone();
        out.sort_by(|a, b| b.started_at.cmp(&a.started_at));
        out
    };
    if matches.is_empty() {
        return Err("No matches to export yet.".into());
    }

    let mut csv = String::from(
        "date,result,deck,opponent,opponent_platform,queue,best_of,games_won,games_lost,rank,game1_on_play,match_id\n",
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
        let on_play = m
            .games
            .first()
            .and_then(|g| g.on_play)
            .map(|p| if p { "play" } else { "draw" })
            .unwrap_or("");
        csv.push_str(&format!(
            "{},{},{},{},{},{},{},{},{},{},{},{}\n",
            iso_date(m.ended_at),
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
    awaiting_first_turn: bool,
}

/// Live mainboard-in-library tracker driven by GRE zone + gameObject diffs.
#[derive(Debug, Default, Clone)]
struct DeckTracker {
    remaining: HashMap<u32, u32>,
    totals: HashMap<u32, u32>,
    /// Instance ids already counted as having left the library.
    left_instances: HashSet<u32>,
    /// zoneId -> ZoneType_* string
    zone_types: HashMap<u32, String>,
    last_lib_count: Option<u32>,
}

impl DeckTracker {
    fn reset_from_main(&mut self, cards: &[u32]) {
        self.remaining.clear();
        self.totals.clear();
        self.left_instances.clear();
        self.last_lib_count = None;
        for &id in cards {
            *self.remaining.entry(id).or_default() += 1;
            *self.totals.entry(id).or_default() += 1;
        }
    }

    fn clear(&mut self) {
        self.remaining.clear();
        self.totals.clear();
        self.left_instances.clear();
        self.zone_types.clear();
        self.last_lib_count = None;
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
        let mut changed = false;

        if let Some(zones) = gsm.get("zones").and_then(|z| z.as_array()) {
            let mut my_lib_count: Option<u32> = None;
            for z in zones {
                let Some(zid) = z.get("zoneId").and_then(|x| x.as_u64()).map(|x| x as u32) else {
                    continue;
                };
                if let Some(ty) = z.get("type").and_then(|t| t.as_str()) {
                    self.zone_types.insert(zid, ty.to_string());
                }
                let owner = z.get("ownerSeatId").and_then(|o| o.as_u64()).map(|o| o as u32);
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
                if let Some(prev) = self.last_lib_count {
                    // Library grew → mulligan / reshuffle put cards back. Re-baseline.
                    if n > prev && !self.totals.is_empty() {
                        self.remaining = self.totals.clone();
                        self.left_instances.clear();
                        changed = true;
                    }
                }
                self.last_lib_count = Some(n);
            }
        }

        let Some(gos) = gsm.get("gameObjects").and_then(|g| g.as_array()) else {
            return changed;
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
            let Some(instance) = go
                .get("instanceId")
                .and_then(|i| i.as_u64())
                .map(|i| i as u32)
            else {
                continue;
            };
            if self.left_instances.contains(&instance) {
                continue;
            }
            let zone_id = go
                .get("zoneId")
                .and_then(|z| z.as_u64())
                .map(|z| z as u32);
            let zone_ty = zone_id
                .and_then(|z| self.zone_types.get(&z))
                .map(|s| s.as_str())
                .unwrap_or("");
            // Still in deck areas — not drawn/milled yet.
            if matches!(
                zone_ty,
                "ZoneType_Library" | "ZoneType_Sideboard" | "ZoneType_Pending" | ""
            ) {
                // Unknown zone: if we have no type yet, skip rather than false-draw.
                continue;
            }
            // Limbo is used during mulligan animations — don't count until a real zone.
            if zone_ty == "ZoneType_Limbo" {
                continue;
            }
            let Some(grp) = go.get("grpId").and_then(|g| g.as_u64()).map(|g| g as u32) else {
                continue;
            };
            self.left_instances.insert(instance);
            if let Some(slot) = self.remaining.get_mut(&grp) {
                if *slot > 0 {
                    *slot -= 1;
                    changed = true;
                }
            }
        }
        changed
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
            deck_name: pending.deck_name.clone(),
            deck_id: pending.deck_id.clone(),
            deck_hash: pending.deck_hash.clone(),
            result: None,
            library,
            library_total,
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
        if let Some(season) = v
            .get("constructedSeasonOrdinal")
            .and_then(|s| s.as_u64())
        {
            self.current_season = Some(season as u32);
        }
        let class = v.get("constructedClass").and_then(|c| c.as_str());
        let level = v.get("constructedLevel").and_then(|l| l.as_u64());
        if let Some(class) = class {
            if class.is_empty() {
                return;
            }
            self.current_rank = Some(match level {
                Some(l) if l > 0 => format!("{class} {l}"),
                _ => class.to_string(),
            });
        }
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
        let my_seat = self
            .pending
            .get(&match_id)
            .and_then(|p| p.my_seat_id);

        if has_deck {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                if let Some((cards, side)) = find_deck_message(&v) {
                    // Opening list for this game — seed / re-seed the library tracker.
                    self.deck_tracker.reset_from_main(&cards);
                    self.live_dirty = true;
                    if let Some(pending) = self.pending.get_mut(&match_id) {
                        // New GRE connection = new game; expect its turn-1 info next.
                        pending.game_on_play.push(None);
                        pending.awaiting_first_turn = true;
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
            && (line.contains("\"gameObjects\"") || line.contains("ZoneType_Library"))
        {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                if let Some(my_seat) = my_seat {
                    let mut changed = false;
                    if let Some(msgs) = v
                        .get("greToClientEvent")
                        .and_then(|e| e.get("greToClientMessages"))
                        .and_then(|m| m.as_array())
                    {
                        for msg in msgs {
                            if let Some(gsm) = msg.get("gameStateMessage") {
                                changed |= self.deck_tracker.apply_game_state(gsm, my_seat);
                            }
                        }
                    } else if let Some(gsm) = v.get("gameStateMessage") {
                        changed |= self.deck_tracker.apply_game_state(gsm, my_seat);
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
                    if let Some(my_seat) = pending.my_seat_id {
                        if let Some(slot) = pending.game_on_play.last_mut() {
                            *slot = Some(active_seat == my_seat);
                        }
                    }
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
    let best_of = if event_id.contains("Traditional") { 3 } else { 1 };

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
    let digits: String = body[at..].chars().take_while(|c| c.is_ascii_digit()).collect();
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
                            record_matches(&app, completed);
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
    record_matches(app, completed);
}

fn record_matches(app: &AppHandle, completed: Vec<TrackedMatch>) {
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
            fresh.push(m);
        }
        data.status.matches_recorded = data.matches.len();
    }
    for m in fresh {
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
            deck_name: m.deck_name.clone(),
            deck_id: m.deck_id.clone(),
            deck_hash: m.deck_hash.clone(),
            result: Some(m.result.clone()),
            library: Vec::new(),
            library_total: None,
        };
        let mid = ended.match_id.clone();
        publish_live(app, Some(ended));
        schedule_clear_ended(app, mid);
        let _ = app.emit("tracker:match", &m);
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
    }
}

fn schedule_clear_ended(app: &AppHandle, match_id: String) {
    let app2 = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(2800));
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

/// Rewrite the whole matches file (used after deletions). Writes to a temp
/// file first so a crash mid-write can't lose the surviving history.
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
    fs::write(&tmp, out)?;
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

fn append_match(file: &Path, m: &TrackedMatch) {
    if let Some(dir) = file.parent() {
        let _ = fs::create_dir_all(dir);
    }
    let Ok(json) = serde_json::to_string(m) else {
        return;
    };
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(file) {
        let _ = writeln!(f, "{json}");
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

    fn room_completed(match_id: &str, event: &str, games: &[(u32, &str)], match_winner: u32) -> String {
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
        p.feed_line(&room_completed(
            "m-live",
            "Ladder",
            &[(2, "ResultReason_Game")],
            2,
        ));
        assert!(p.live_match().is_none());
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
        assert_eq!(
            fingerprint(&[101, 102, 101]),
            fingerprint(&[101, 101, 102])
        );
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

    /// Replay a real Player.log: `FND_REPLAY_LOG=path cargo test replay_real_log -- --nocapture --ignored`
    #[test]
    #[ignore]
    fn replay_real_log() {
        let Ok(path) = std::env::var("FND_REPLAY_LOG") else {
            eprintln!("FND_REPLAY_LOG not set — skipping");
            return;
        };
        let text = fs::read(&path).expect("read log");
        let text = String::from_utf8_lossy(&text);
        let mut p = LogParser::new();
        let mut matches = Vec::new();
        for line in text.split('\n') {
            matches.extend(p.feed_line(line));
        }
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
        }
    }
}

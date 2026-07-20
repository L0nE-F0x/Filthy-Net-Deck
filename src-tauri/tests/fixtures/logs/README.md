# Tracker log fixtures (C4)

Anonymized, shape-identical to Arena `Player.log` lines the parser understands
(2026.60-era). No real account IDs or display names from a live session — all
synthetic placeholders (`LOCALUSERID…`, `Hero`, `Rival`, fake card grp ids).

| File | Covers |
|------|--------|
| `bo1_win_full.log` | Auth header, DETAILED LOGS, rank, courses, Playing, GRE connect + turn1, MatchCompleted win |
| `bo3_win.log` | Traditional_Ladder Bo3 2–1 |
| `loss_and_orphan_complete.log` | Loss + completion without prior Playing |
| `draw_and_detailed_logs.log` | DETAILED LOGS toggle + draw result |

Optional real-log debug (still ignored in CI):

```
FND_REPLAY_LOG=path/to/Player.log cargo test replay_real_log -- --nocapture --ignored
```
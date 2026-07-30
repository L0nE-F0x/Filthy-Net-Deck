# Filthy Net Deck — Production Roadmap

> **▶ NEXT PROGRAM: [`100X-ROADMAP.md`](100X-ROADMAP.md)** — reach × reliability × moat. Start there (Phase 0: CI/test gate) before new page work. `handoff.md` carries the top-of-todo checklist.

**Current release:** **v1.5.1** (custom domain + dual host). App `main` may be ahead of published binaries (see `handoff.md`).
**How to use:** Work top to bottom. Check items off as they ship. Any user-visible change ships via the **full AGENTS.md release checklist**. Source-only pushes are not releases.  
**Handoff:** Read `handoff.md` + `AGENTS.md` first. Signing: `%USERPROFILE%\.tauri\filthy-net-deck.key` (password local only — never commit).

> **RELEASE PACING:** Fewer, bigger releases. Finish meaningful work on `main`, then cut **one** version. `npm run meta` / `npm run sets` anytime without a bump. P0 hotfix may ship solo.

---

## Next chapter — 100× program (owner 2026-07-20+)

Canonical checklist: **`handoff.md`** (always read first). Program plan: **`100X-ROADMAP.md`**.

**Published:** **v1.6.0** (2026-07-20) — B1 opponent inference · B2 game analytics · C6 diagnostic export · C3 multi-source lists · A4 public meta site.

1. ~~Phase 0 CI / fixtures / eslint / tracker log corpus~~  
2. ~~A4 public meta site (`/meta-web/`)~~  
3. ~~C3 multi-source lists (MTGO → Goldfish)~~ + alias normalizer  
4. ~~A1 package managers~~ — **cancelled** (website + in-app updater only)  
5. ~~Ship B1 (+B2/C6)~~ — **v1.6.0 released**; macOS dmg roll pending tag CI  
6. Next: **B3 grounded coach** / **B4 overlay matchup line** / **D2 daily-loop strip** — owner picks; B4 + D2 need product calls  

**Deferred** stays deferred (draft hub, cloud, Alchemy, prices, free-form LLM coach).

### Explicitly deferred

Limited/Draft hub · **in-draft** overlay · cloud sync · Alchemy · prices · Events overhaul · AI without grounded local data · **Pro tier / paywalls** (until usage justifies — see `docs/PLATFORM-STRATEGY.md`).

> **Tip jar shipped 2026-07-30** (owner call): a passive Ko-fi link on the site and in Settings → About. Free stays free — it gates nothing. The deferral above now covers *paid tiers* only.

### 10× SKIP (still closed)

D1, D4, D5 · M3, M5 · Z1 · all E\* · X3 — see `docs/PAGE-10X.md`. (X4 test toast ships with v1.3.)

---

## Low-urgency backlog

- After each app tag: roll macOS dmg from GH release into `website/downloads/` + site links  
- Marketing screenshot/GIF carousel (owner 1280×860 assets with real tracker data)  
- Full macOS signed auto-update in CI (owner decision: key as repo secret); soft dmg CTA already works  
- `whatsinstandard` v7 when v6 is fully dead  
- More set trailers in `set-trailers.json` as WotC posts them  
- Downloads hygiene: only current release in `website/downloads/`. **Do not prune
  `Filthy-Net-Deck-Setup-2.5.2.exe` — checked 2026-07-30, GitHub Release v2.5.2
  carries only the `.dmg`, so the Windows installer is NOT mirrored and deleting
  it loses it.** Mirror it to Releases first, then prune. Investigated 2026-07-30: a single 404 for
  `Setup-2.0.1.exe` in 7 days of logs is **not** a broken update path — nothing on
  the site links it, and `updater/latest.json` correctly points at the current
  release regardless of installed version. It is an external or bookmarked link
  to a pruned installer. Deliberately **no redirect added**: a `/downloads/*`
  fallback would sit in the signed-updater's download path and turn a clean 404
  into an HTML response on any future missing file.  

---

## Shipped milestones (condensed)

| Version | Theme |
|---------|--------|
| **v1.5.0** | Brew Lab: pure list clinic vs ranked Bo1/Bo3 peers (no AI) |
| **v1.4.4** | Tooltip polish: Climb, Matchups, Decks, Deck detail |
| **v1.4.3** | Drop Meta Trackers; deck table last-played + tooltips |
| **v1.4.2** | Events fix: magic.gg + MTGO allowlist |
| **v1.4.1** | Events freshness, share UX, Soundscape, Ugin & Garruk |
| **v1.4.0** | Bells & Whistles: share cards, overlay harden, a11y, opt-in sound |
| **v1.3.5** | Overlay polish: grouped list, art crops, mana pips, slim bar, settings |
| **v1.3.0** | In-game overlay deck tracker + notify defaults |
| **v1.2.0** | First-session coach, share cards, update UX |
| **v1.1.1** | Themes accordion sidebar-only |
| **v1.1.0** | Planeswalker accent skins |
| **v1.0.0** | 10× batches 1–4 |

Detail lives in git history.

---

## Non-goals (do not add)

In-draft overlay (ToS), price tracking, cloud sync, mobile/APK tracking promises, Alchemy/Historic, fabricated matchup/sideboard content.

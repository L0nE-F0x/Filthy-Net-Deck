# Filthy Net Deck — Production Roadmap

**Source:** Full preproduction audit, 2026-07-17 (Claude Fable 5), starting from v0.14.0.  
**How to use this file:** Work top to bottom. Check items off (`[x]`) as they ship. Any user-visible change ships via the **full AGENTS.md release checklist**. Source-only pushes are not releases.  
**Handoff:** Read `handoff.md` + `AGENTS.md` first. Signing: `%USERPROFILE%\.tauri\filthy-net-deck.key` + local password file `filthy-net-deck-key-password.txt` (or ask owner — never commit).

> **RELEASE PACING POLICY (owner directive, 2026-07-17):** Version bumps are **batched into fewer, bigger releases**. Do not repeat the four-versions-in-one-day cadence (0.14.1 → 0.17.0). Finish meaningful work on `main`, then cut **one** release when the owner asks or a full batch is ready. `npm run meta` / `npm run sets` anytime without a version bump. P0 hotfix may ship solo.

---

## Immediate follow-ups

- [x] Roll v0.17.0 macOS dmg onto the site.
- [x] **v0.18.0 signed Windows publish** (NSIS + `.sig`, updater, version.json ×2, OG `?v=0.18.0`, tag).
- [x] **Roll v0.18.0 macOS dmg** onto `website/downloads/` + mac download labels (CI succeeded; asset on GitHub Releases).

**Open (low urgency):**

- [ ] Marketing screenshot/GIF carousel — needs owner-supplied 1280×860 captures with real tracker data.
- [ ] Full macOS **signed** auto-update in CI (owner decision: store key as repo secret) — soft dmg CTA already works when download URL ends in `.dmg`.

---

## Milestones 1–4 — shipped (2026-07-17, 0.14.1 → 0.17.0)

Condensed; detail in git history + `handoff.md`.

- **v0.14.1** — P0 live-meta feed origin fix + polish; mac catch-up.
- **v0.15.0** — Autostart / tray / window memory / trust.
- **v0.16.0** — Matchup intel, streaks, CSV.
- **v0.17.0** — Set Radar binder UX, deck movement chips, hover-art lists, Events filters.

---

## Milestone 5 — v0.18.0 "Content engine" — shipped

- [x] Daily archetype list diff (DeckView vs previous dated meta).
- [x] Shareable week recap PNG (My Stats).
- [x] Match-end toast (Settings opt-in).
- [x] Meta-share timeline + movers (Decks home; `meta/history.json`).
- [x] Personal vs. meta table (Decks home).

---

## Milestone 6 — Infrastructure — shipped (with 0.18.0)

- [x] CI failure alerting (`daily-meta.yml` opens/updates issue by **title only** — no missing label).
- [x] Cap Scryfall 429 retries (max 8, exponential backoff).
- [x] Slim feeds (minified latest/sets; drop redundant previews; history JSON).
- [x] Vitest suite for pure helpers (`npm test`).
- [x] macOS soft update CTA for `.dmg` URLs; full signed mac updater deferred.
- [x] Keyboard shortcuts `1`–`7` for main nav.

---

## Explicit non-goals (do not add)

In-game overlay (ToS risk), price tracking, cloud sync, mobile/APK tracking promises, Alchemy/Historic, fabricated matchup/sideboard content.

---

## Suggested next product batch (not started — batch before next version bump)

Ideas only; owner prioritizes. Do **not** ship one release per bullet.

- Deeper Climb / rank UX polish
- Matchup Lab quality-of-life
- Performance / feed size further
- Screenshot-driven marketing carousel (when assets exist)
- Anything owner requests on return from Claude ↔ Grok rotation

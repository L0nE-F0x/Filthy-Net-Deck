# Filthy Net Deck — handoff

**Last wrap-up:** 2026-07-20 — B1 opponent-archetype inference implemented (source). Needs an **app release** before desktop users get `opponentSeen` in the tracker.
**Next agent:** Either cut **v1.5.2** end-to-end (AGENTS.md checklist) so B1 ships to installers, or start **C3 multi-source meta**. Ask user before signing/publishing a release.

---

## ▶ TOP OF THE TODO LIST — the 100× program

1. ~~CI / fixtures / eslint~~ ✅ Phase 0
2. ~~Package managers~~ ❌ cancelled (website + updater only)
3. ~~Public meta site~~ ✅ A4 `website/meta-web/`
4. ~~Opponent archetype inference~~ ✅ **B1 source** — see below; **not in a published binary yet**
5. **Multi-source meta** (C3) ← after B1 is released (or in parallel if meta-only)

---

## B1 — what shipped (this commit)

| Layer | Change |
|-------|--------|
| Rust tracker | Collect opponent `grpId`s from GRE gameObjects (battlefield/gy/exile/stack/hand…); persist as `opponentSeen` on match + live snapshot |
| TS | `src/services/opponentArchetype.ts` — score today\'s ranked lists by distinctive card overlap |
| Daily | `OpponentArchetypePanel` — WR by inferred opponent archetype |
| Stats | Match history shows inferred archetype next to opponent name |
| Overlay | Live bar shows guess when confidence is high (uses cached meta) |
| Tests | Rust `opponent_cards_seen_*` + 8 vitest cases |

Guardrails: local only, real meta lists only, no upload.

---

## One-liner

> B1 is coded and tested. **Publish a desktop build** before users benefit; then C3 multi-source meta.

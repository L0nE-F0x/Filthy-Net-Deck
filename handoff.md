# Filthy Net Deck — handoff

**Last wrap-up:** 2026-07-20 — C3 multi-source meta lists (MTGO + Goldfish) shipped in pipeline source. B1 still needs a desktop release when you want it live for users.
**Next agent:** C3 is in-repo; run pm run meta\ when you want a live refresh. App feature **B1** still needs **v1.5.2** end-to-end when ready. Optional next: magic.gg safe list parser, or B2 analytics.

---

## ▶ TOP OF THE TODO LIST

1. ~~Phase 0 CI/fixtures~~ ✅
2. ~~A1 package managers~~ ❌ cancelled
3. ~~A4 public meta site~~ ✅
4. ~~B1 opponent archetype~~ ✅ source (needs app release)
5. ~~C3 multi-source meta lists~~ ✅ **MTGO → Goldfish** (magic.gg lists still deferred)

---

## C3 notes

- Goldfish tiles still define the 8 archetype slots + meta %.
- For each tile, pipeline tries recent MTGO Challenge lists (card-overlap match), else Goldfish archetype page.
- Every list still Scryfall-validated; no fabricated 60s.
- See \pipeline/sources/listMatch.mjs\, \etchMtgoListPool\, \docs/DATA-AND-UPDATES.md\.

---

## One-liner

> Reliability spine upgraded: meta lists can survive a Goldfish archetype-page miss via MTGO. Ship B1 when you want a desktop release.

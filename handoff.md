# Filthy Net Deck — handoff

**Last wrap-up:** 2026-07-20 — Phase 0 complete (C1/C2/C4/C5). A1 manifests drafted under `packaging/` (not submitted).
**Next agent:** Start **A4 public meta site** (Phase 1 reach), then B1/C3. External package-manager PRs (winget-pkgs / Homebrew) need an outward-facing submit step — prep is ready. Read **`AGENTS.md`** before any release.

---

## ▶ TOP OF THE TODO LIST — the 100× program

Canonical plan: **`100X-ROADMAP.md`**.

### Do these five, in order

1. ~~**CI quality gate.**~~ ✅ **DONE 2026-07-20** *(C1)*
2. **winget + Homebrew Cask.** ✅ **LOCAL PREP DONE** — `packaging/`. Validated with `winget validate`. **Not submitted** to winget-pkgs / Homebrew. *(A1)*
3. **Public meta site from the daily feed.** Static-generate indexable pages from `latest.json`/`history.json`. *(A4)* ← **NEXT**
4. **Local opponent-archetype inference.** GRE gameObjects → meta matcher. *(B1)*
5. **Multi-source meta.** magic.gg → mtgo → goldfish → melee. *(C3)*

### Phase 0 (done)

- ~~C1 CI gate~~ ✅
- ~~C2 Goldfish fixtures~~ ✅
- ~~C5 eslint zero-warning~~ ✅
- ~~C4 tracker log-fixture corpus~~ ✅ **DONE 2026-07-20** — 4 anonymized files in `src-tauri/tests/fixtures/logs/` + `fixture_*` tests in CI (20 rust tests pass; real-log helper stays `#[ignore]`).

**Guardrails:** real-data-only · local-only tracking · AI grounded-or-absent · no in-draft overlay · Standard+Pioneer · end-to-end releases.

---

## Packaging (A1)

| Item | Path / ID | Status |
|------|-----------|--------|
| winget manifests | `packaging/winget/L0nE-F0x/FilthyNetDeck/1.5.1/` | Validated locally |
| Package ID | `L0nE-F0x.FilthyNetDeck` | Ready for winget-pkgs PR when approved |
| Homebrew cask | `packaging/homebrew/filthy-net-deck.rb` | Draft |
| How-to | `packaging/README.md` | Validate / submit steps |
| Chocolatey | — | Not drafted yet |

**Do not** claim public `winget install` / `brew install` until a PR/tap is merged.

---

## Where we are

| Item | Value |
|------|--------|
| Version | **1.5.1** |
| Live site | https://filthy-net-deck.com/ |

Signing: `%USERPROFILE%\.tauri\filthy-net-deck.key` (encrypted). Never commit private keys.

---

## One-liner

> Phase 0 is green end-to-end. Next multiplier: **A4 public meta site** from the daily feed, then open A1 submissions when ready.
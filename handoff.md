# Filthy Net Deck — handoff

**Last wrap-up:** 2026-07-20 — full-codebase deep scan → **`100X-ROADMAP.md`** written (the next program).
**Next agent:** Start with **`100X-ROADMAP.md`** → the plan is reach × reliability × moat. Do **Phase 0 (harden the base) first** — it gates everything else. Read **`AGENTS.md`** before any release.

---

## ▶ TOP OF THE TODO LIST — the 100× program

Canonical plan: **`100X-ROADMAP.md`** (root, next to `ROADMAP.md`). The thesis: `Reach × Activation × Retention × Reliability × Differentiation ≈ 100×`. Reliability is the guardrail, so it ships first.

### Do these five, in order

1. ~~**CI quality gate.**~~ ✅ **DONE 2026-07-20** — `.github/workflows/ci.yml` (web job: tsc/vitest/build on ubuntu · rust job: fmt/clippy `-D warnings`/cargo test on windows; data-only commits skipped; README badge). All gates verified green locally first (143 JS tests, 16 Rust tests, 3 clippy lints fixed, rustfmt normalized). **Verify the first Actions run is green after push.** *(Roadmap C1)*
2. **winget + Homebrew Cask.** Reuse the signed NSIS `.exe` and the tag-CI universal dmg. ~10× reach from artifacts you already build. *(A1)*
3. **Public meta site from the daily feed.** Static-generate indexable pages from `latest.json`/`history.json` — turns the CI cron into a content/SEO engine that funnels to the download. *(A4)*
4. **Local opponent-archetype inference.** The GRE `gameObjects` stream you already parse for the overlay carries opponent cards seen — feed them into the meta matcher for real, private, per-archetype win-rates. No new data source. *(B1)*
5. **Multi-source meta.** Wire the `magic.gg → mtgo → goldfish → melee` list priority that `docs/DATA-AND-UPDATES.md` already describes — today the 8×8 lists come from **Goldfish only** (single point of failure). *(C3)*

### Also queued in Phase 0 (cheap, high-leverage)
- ~~Fixture tests for `pipeline/sources/goldfish.mjs`~~ ✅ **DONE 2026-07-20** — `pipeline/goldfish.test.mjs` (9 tests) against real gzipped 2026-07-20 pages in `pipeline/__fixtures__/`; recapture snippet in the test header.
- Commit `eslint` / `prettier` configs (rustfmt already enforced via CI with defaults).
- Un-`ignore` the tracker replay test with a committed anonymized log-fixture corpus.

**Guardrails (never compromise):** real-data-only · local-only tracking · AI grounded-or-absent · no in-draft overlay (ToS) · Standard+Pioneer focus · end-to-end releases. Full detail in `100X-ROADMAP.md` §4.

---

## Smaller leftover

- **Smoke Brew Lab** on a real tracked deck with a list (My Stats → deck detail → below tracked list). Confirm staples come only from today's ranked meta; no invented card names.
- macOS **1.5.0** dmg: roll from tag CI into `website/downloads/` + site links if not already at parity.

---

## Where we are

| Item | Value |
|------|--------|
| Version | **1.5.0** (Windows signed + macOS universal dmg) |
| Windows | `website/downloads/Filthy-Net-Deck-Setup-1.5.0.exe` |
| macOS | `website/downloads/Filthy-Net-Deck-1.5.0-universal.dmg` |
| Headline | **Brew Lab** — shape/staples clinic vs ranked Bo1/Bo3 peers |
| Soft / updater | `version.json` + `updater/latest.json` → **1.5.0** |
| Live site | https://filthy-net-deck.com/ (legacy: https://filthy-net-deck.netlify.app/) |

Signing: `%USERPROFILE%\.tauri\filthy-net-deck.key` (encrypted). Password local only — never commit.

---

## Must not regress

- Never `set_focus` overlay · Rust owns show/hide · dirty-only `tracker:live`
- No backdrop-filter · local-only · ApexForge credit
- Sound opt-in OFF · never in overlay
- Events: freshness + magic.gg/mtgo allowlist
- Brew Lab: **no AI / no hallucinated card names**

---

## One-liner

> **Next chapter = the 100× program** (`100X-ROADMAP.md`): harden the base (CI/tests), then open distribution (winget/brew/store/Linux/SEO), then widen the tracker moat (opponent inference, grounded coach). Phase 0 first.

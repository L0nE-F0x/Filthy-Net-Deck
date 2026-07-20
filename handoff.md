# Filthy Net Deck — handoff

**Last wrap-up:** 2026-07-20 — Phase 0 CI hardening shipped; winget + Homebrew manifests drafted locally (A1 prep, not submitted).
**Next agent:** Continue **`100X-ROADMAP.md`**. Phase 0 CI items (C1/C2/C5) are done; C4 still needs user go-ahead for real `Player.log` fixtures. Read **`AGENTS.md`** before any release.

---

## ▶ TOP OF THE TODO LIST — the 100× program

Canonical plan: **`100X-ROADMAP.md`** (root, next to `ROADMAP.md`). The thesis: `Reach × Activation × Retention × Reliability × Differentiation ≈ 100×`. Reliability is the guardrail, so it ships first.

### Do these five, in order

1. ~~**CI quality gate.**~~ ✅ **DONE 2026-07-20** — `.github/workflows/ci.yml` (web: tsc/vitest/build · rust: fmt/clippy `-D warnings`/cargo test). Runs 1–3 green on `main`. *(Roadmap C1)*
2. **winget + Homebrew Cask.** ✅ **LOCAL PREP DONE 2026-07-20** — see `packaging/`. Manifests validated with `winget validate`. **Not submitted** to winget-pkgs / homebrew-cask / personal tap. Needs explicit go before any PR. *(A1)*
3. **Public meta site from the daily feed.** Static-generate indexable pages from `latest.json`/`history.json` — turns the CI cron into a content/SEO engine that funnels to the download. *(A4)*
4. **Local opponent-archetype inference.** The GRE `gameObjects` stream you already parse for the overlay carries opponent cards seen — feed them into the meta matcher for real, private, per-archetype win-rates. No new data source. *(B1)*
5. **Multi-source meta.** Wire the `magic.gg → mtgo → goldfish → melee` list priority that `docs/DATA-AND-UPDATES.md` already describes — today the 8×8 lists come from **Goldfish only** (single point of failure). *(C3)*

### Also queued in Phase 0 (cheap, high-leverage)
- ~~Fixture tests for `pipeline/sources/goldfish.mjs`~~ ✅ **DONE 2026-07-20** — `pipeline/goldfish.test.mjs` (9 tests) + gzipped fixtures. *(C2)*
- ~~Commit `eslint` config~~ ✅ **DONE 2026-07-20** — flat `eslint.config.js`, zero-warning gate in CI. Prettier skipped deliberately (blame noise). *(C5)*
- **C4** Un-`ignore` the tracker replay test with a committed anonymized log-fixture corpus — needs real (anonymized) `Player.log` excerpts; **ask before reading the user's log**.

**Guardrails (never compromise):** real-data-only · local-only tracking · AI grounded-or-absent · no in-draft overlay (ToS) · Standard+Pioneer focus · end-to-end releases. Full detail in `100X-ROADMAP.md` §4.

---

## Packaging (A1) — where things stand

| Item | Path / ID | Status |
|------|-----------|--------|
| winget manifests | `packaging/winget/L0nE-F0x/FilthyNetDeck/1.5.1/` | Validated locally |
| Package ID | `L0nE-F0x.FilthyNetDeck` | Ready for winget-pkgs PR when approved |
| Homebrew cask | `packaging/homebrew/filthy-net-deck.rb` | Draft; brew not available on this Windows host |
| How-to | `packaging/README.md` | Validate / submit steps |
| Chocolatey | — | Not drafted yet (same .exe as winget) |

**Do not** claim `winget install` / `brew install` works for the public until a PR/tap is merged.

---

## Smaller leftover

- **Smoke Brew Lab** on a real tracked deck with a list (My Stats → deck detail → below tracked list). Confirm staples come only from today's ranked meta; no invented card names.
- Unrelated working-tree dirt may exist under `marketing-video/` and `website/assets/youtube*` — leave alone unless asked.

---

## Where we are

| Item | Value |
|------|--------|
| Version | **1.5.1** (Windows signed + macOS universal dmg) |
| Windows | `website/downloads/Filthy-Net-Deck-Setup-1.5.1.exe` |
| macOS | `website/downloads/Filthy-Net-Deck-1.5.1-universal.dmg` |
| Soft / updater | `version.json` + `updater/latest.json` → **1.5.1** |
| Live site | https://filthy-net-deck.com/ (legacy: https://filthy-net-deck.netlify.app/) |
| HEAD (at wrap) | C5 lint commit on `main`; CI green |

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

> Phase 0 CI is green. A1 manifests live under `packaging/` (local only). Next: either submit winget/brew with user go-ahead, finish C4 with log-fixture consent, or start A4 public meta site.

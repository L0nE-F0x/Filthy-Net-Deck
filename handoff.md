# Filthy Net Deck — handoff

**Last wrap-up:** 2026-07-20 — Phase 0 done; A1 package managers **cancelled**; A4 public meta site shipped under `website/meta-web/`.
**Next agent:** **B1** local opponent-archetype inference (or C3 multi-source meta). Read **`AGENTS.md`** before any release.

---

## ▶ TOP OF THE TODO LIST — the 100× program

Canonical plan: **`100X-ROADMAP.md`**.

### Do these five, in order

1. ~~**CI quality gate.**~~ ✅ *(C1)*
2. ~~**Package managers (winget/brew/choco).**~~ ❌ **CANCELLED** — website + in-app updater only. *(A1)*
3. ~~**Public meta site from the daily feed.**~~ ✅ **DONE 2026-07-20** — `pipeline/build-meta-site.mjs` → `website/meta-web/` (hub + Standard/Pioneer + 32 deck pages), sitemap/robots, wired into `npm run meta` + daily CI. *(A4)*
4. **Local opponent-archetype inference.** GRE gameObjects → meta matcher. *(B1)* ← **NEXT**
5. **Multi-source meta.** magic.gg → mtgo → goldfish → melee. *(C3)*

### Phase 0 (done)

- C1 CI · C2 Goldfish fixtures · C4 tracker log fixtures · C5 eslint — all green.

**Guardrails:** real-data-only · local-only tracking · AI grounded-or-absent · no in-draft overlay · Standard+Pioneer · end-to-end releases · **install via website + signed in-app updater only** (no winget/brew/choco).

---

## Public meta (A4)

| URL path | What |
|----------|------|
| `/meta-web/` | Today hub |
| `/meta-web/standard.html` | Standard Bo1+Bo3 |
| `/meta-web/pioneer.html` | Pioneer Bo1+Bo3 |
| `/meta-web/deck/<id>.html` | Full list + Arena import + trend |
| `/sitemap.xml` | Indexable URLs |

Regenerate: `npm run meta:site` (also runs at end of `npm run meta`).

---

## Where we are

| Item | Value |
|------|--------|
| Version | **1.5.1** |
| Install | website downloads + signed in-app updater |
| Live site | https://filthy-net-deck.com/ |

---

## One-liner

> Phase 0 solid. Public meta site is the SEO funnel. Next moat work: **B1 opponent archetype** from cards already in the log.

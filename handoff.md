# Filthy Net Deck — handoff

**Last wrap-up:** 2026-07-19 — post-v1 full audit (verdict: **no user-facing bugs**). Product at **v1.1.1** (Windows + macOS on site).

## Where we are

| Item | Value |
|------|--------|
| Version | **1.1.1** |
| Git | `main` (tags `v1.0.0` … `v1.1.1`) |
| Windows | `website/downloads/Filthy-Net-Deck-Setup-1.1.1.exe` (+ `.sig`) |
| macOS | `website/downloads/Filthy-Net-Deck-1.1.1-universal.dmg` (site buttons match) |
| Soft / updater | `version.json` + `updater/latest.json` → 1.1.1 |
| Live | https://filthy-net-deck.netlify.app/ |

## Product posture

- **Now:** maintenance + periodical health checks; listen to user findings.
- **Later:** **Next chapter** backlog below (owner-approved direction — do not invent new product pillars without owner).
- **10× SKIP still closed:** D1/D4/D5, M3/M5, Z1, all E*, X3/X4 (`docs/PAGE-10X.md`).

---

## Next chapter (read this next session)

Tight upgrades — **not** another 25-ticket feature bomb. Prefer Climb-bar quality and retention over parity with Untapped.

### 1. Reliability theater
- [ ] Tracker edge cases (tray miss, Arena restarts, partial logs)
- [ ] Arena patch resilience (parse errors surfaced clearly; recover when format shifts)
- [ ] Update UX polish (signed Update & restart remains primary path; soft fallback honest)

### 2. Onboarding (first 5 minutes)
- [ ] Clear path: **log found → first match recorded → first opponent tag**
- [ ] Empty states that teach the loop (Stats / Matchups / Climb) without inventing data
- [ ] Reduce “is it working?” support friction (Settings tracker health already exists — deepen if needed)

### 3. Shareable moments (marketing = product)
- [ ] Climb path / season story as screenshot-friendly surfaces
- [ ] Week recap polish (already exists — make it the default “share after a session”)
- [ ] Theme skins as social-friendly screenshots (Chandra / Liliana / etc.)

### 4. Listen → ship only what fits
- [ ] One channel for “what Untapped does that you still miss” (owner social / feedback)
- [ ] Triage against Climb bar + AGENTS constraints (desktop, Std/Pioneer, local, no fabricated guides)
- [ ] Only open SKIP tickets if owner reopens them

### Monetization (parked until usage justifies)
Do **not** implement until owner says go. When relevant, prefer free core intact:
- Tip jar / Support ApexForge
- Optional Pro later (exports, advanced recaps, multi-season archive, theme packs) — **never** paywall tracking or daily meta
- No in-app ads; shareable recaps stay the ad
- Freemium only after retention metrics (WAU, return after a loss, not just downloads)

### Explicitly deferred (still closed)
Limited/Draft hub · in-game overlay · cloud sync · Alchemy · prices · Events overhaul · AI without grounded local data.

---

## Periodic maintenance

- `npm run meta` / sets pipeline; Netlify `version.json` spot-check after any app ship
- Signing keys only on dev machine (`%USERPROFILE%\.tauri\filthy-net-deck.key`)
- Set trailers upkeep (`setTrailers.ts` / pipeline) as WotC posts them
- macOS: after each version tag, roll dmg from GH release into `website/downloads/` + update `website/index.html` links
- Downloads hygiene: keep **only the current release** in `website/downloads/` (updater + site point at it) — don't accumulate installers. See `docs/MAINTENANCE.md` → "Downloads hygiene". Two deferred items live there (reclaim `.git` history; upload old Windows `.exe`s to Releases).

## Branding

ApexForge credit on sidebar + Settings + marketing footer → https://ame-apexforge.org/

## Session history (2026-07-19 arc)

1. **v1.0.0** — 10× batches 1–4 (deep links, personal loop, Format Hub war room, Sets, Settings)
2. **v1.1.0** — Planeswalker themes
3. **v1.1.1** — Themes accordion sidebar-only fix
4. macOS dmg rolled to site for 1.1.1
5. **Full audit** — clean, no bugs; trimmed `website/downloads/` to 1.1.1-only (383 MB → 23 MB), pushed + live (`4390823`)

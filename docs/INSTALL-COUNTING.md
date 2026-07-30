# Install counting

**Added:** 2026-07-30 · Phase 0 item 1 of [`PLATFORM-STRATEGY.md`](PLATFORM-STRATEGY.md)

> ## ⚠️ STATUS: NOT LIVE — code written, deploy blocked
>
> The function code is committed and tested but **is not wired up**. A first
> attempt on 2026-07-30 redirected `/version.json` to the function and **took
> the endpoint down with a 404 for roughly 12 minutes** (commit `5a6ab41`,
> reverted in `b3dba99`).
>
> **What went wrong:** the redirect deployed but the function did not. This
> site's base directory is `website`, and there is no `package.json` there — so
> Netlify had nothing to install `@netlify/blobs` from and never bundled the
> function. The redirect shipped pointing at a target that did not exist.
>
> **Why it was not worse:** `/updater/latest.json` is static and was
> deliberately never touched, so signed auto-updates kept working throughout.
> `versionCheck.ts` is null-safe, so the app degraded to "couldn't check for
> updates" rather than erroring.
>
> **Process lesson — do not repeat:** deploy the function FIRST and confirm
> `/api/fnd-stats` returns 503 (not 404). Only add the redirect in a SECOND
> push, once the target is known to exist. Never ship both together.
>
> **Blocked on an owner decision** — see "Making this deployable" below.

Answers the question "how many people actually run this?" without adding telemetry, an account, or anything that identifies a user.

---

## How it works

Every running copy already fetches `/version.json` — on launch, on window focus when the local meta copy is >90 min old, hourly on the same staleness check, and when connectivity returns ([`src/App.tsx`](../src/App.tsx) + [`src/services/versionCheck.ts`](../src/services/versionCheck.ts)). The client appends `?t=<now>`, so **every one of those requests bypasses the CDN edge and reaches the origin.**

That traffic was already happening and already being logged; it just wasn't being counted. [`website/netlify/functions/version.mts`](../website/netlify/functions/version.mts) now serves that path and increments aggregate counters on the way through.

## What is recorded

Per-day integer counters only:

| Field | Meaning |
|---|---|
| `app` | Requests carrying the Tauri webview `Origin` — real installs |
| `other` | Everything else — bots, scrapers, someone opening the URL in a tab |
| `versions` | App version distribution (needs client ≥ v2.5.4, see below) |
| `platforms` | `windows` / `macos` / `other`, from the User-Agent |

**Not recorded:** no IP address, no identifier, no cookie, no per-user record, no match data, nothing traceable to a person. The counters are additive integers in a daily bucket and cannot be disaggregated back to individuals.

This required **no change to what the app sends**. The app/bot split comes from the `Origin` header the webview already sets (`https://tauri.localhost` in production, `http://localhost:1420` in dev) — a browser or bot hitting the same URL is counted separately and does not inflate install numbers.

## Reading the numbers

One-time setup: add **`FND_STATS_TOKEN`** in Netlify → Site configuration → Environment variables (any long random string).

```bash
curl "https://filthy-net-deck.com/api/fnd-stats?token=YOUR_TOKEN&days=30"
```

Returns `totals` plus a `daily` array. Without the env var the endpoint returns 503; with a wrong token, 401.

## How to interpret it — read this before trusting a number

**These are request counts, not unique users.** One `app` request ≈ one launch, plus at most one more per 90 minutes of continuous use. So:

- `app` per day ≈ **sessions**, not people. A user who opens the app three times counts three times.
- There is deliberately **no unique-user dedupe.** Deduping requires either an identifier or IP hashing, and that is a privacy decision that belongs to you, not to me — see "Open decision" below.

**For a unique-install number today, use Netlify Web Analytics** and filter to `/version.json`. Its unique-visitor figure is IP-deduped, which undercounts shared IPs and overcounts dynamic ones, but it is directionally right. Use the two together:

| Question | Source |
|---|---|
| Roughly how many installs? | Netlify Analytics → `/version.json` unique visitors |
| How many sessions per day? | This function → `app` |
| Is my traffic real or bots? | This function → `app` vs `other` |
| Are people actually updating? | This function → `versions` |
| Windows vs macOS split? | This function → `platforms` |

**Counts are approximate.** Blob writes are read-modify-write and therefore racy under concurrency. The daily bucket is sharded 8 ways to shrink the loss window, but this is a traffic gauge, not an accounting ledger. Treat trends as meaningful and exact totals as ±a few percent.

**Version distribution starts empty.** [`versionCheck.ts`](../src/services/versionCheck.ts) now sends `&v=<APP_VERSION>`, but only builds shipped **after** that change do so. Until v2.5.4 is out and adopted, `versions` will be sparse while `app` is already correct. That gap is itself the update-adoption signal.

## Safety

`/updater/latest.json` is **deliberately not instrumented.** It drives the signed auto-update and stays a plain static file — no function in that path, ever.

`/version.json` is safe to instrument because [`versionCheck.ts`](../src/services/versionCheck.ts) is null-safe on every failure path: it falls back to the legacy origin, then degrades to a soft banner. The function reinforces that:

- Every counter call is wrapped and swallowed — counting can never affect the response.
- If the manifest can't be read it returns version `0.0.0`, which `isNewer()` reads as "no update available" — failing toward *no prompt* rather than a false one.
- Verified locally with Blobs unavailable: still returns 200, the real manifest, and correct CORS headers.

`website/version.json` remains the single source of truth, written by the release process. The function imports it directly, so esbuild inlines it at deploy time — no runtime file read, and therefore no dependency on a function's working directory.

## Which netlify.toml is live — read this before editing Netlify config

**The repo-root `netlify.toml` is NOT read by Netlify.** The site's base directory is `website`, so the live config is [`website/netlify.toml`](../website/netlify.toml).

Verified 2026-07-30 against live response headers:

| Path | Live header | Root config says | website/ config says |
|---|---|---|---|
| `/meta/latest.json` | `max-age=120` + `Access-Control-Allow-Headers` | `max-age=300`, no ACAH | `max-age=120` + ACAH ✅ |
| `/meta-web/standard.html` | `max-age=0, must-revalidate` | `max-age=300` | *(no rule)* ✅ |
| `/assets/og-image.png` | `max-age=0, must-revalidate` | `max-age=86400` | *(no rule)* ✅ |
| `/version.json` | `max-age=60` + ACAH | `max-age=60`, no ACAH | `max-age=60` + ACAH ✅ |

Every discriminating header matches `website/netlify.toml`; every rule unique to the root file has never applied.

**This explains `handoff.md` §1.** The `/meta-web/*` `max-age=300` fix "never showed up live" not because of a pinned deploy or auto-publish being off, but because the file it was written into is inert. That open item can be re-scoped.

**Consequence:** the root file's better-documented rules — the meta-web cache fix, og-image caching, the UTF-8 `Content-Type` headers — are all dead. Two ways forward, both owner decisions:

1. **Port the wanted rules into `website/netlify.toml`** and delete the root file. No dashboard change, zero risk.
2. **Change the Netlify base directory to the repo root**, making the root file live and deleting `website/netlify.toml`. Cleaner long-term (that file is the maintained one), but it is a dashboard change affecting the whole deploy and cannot be tested from the repo.

Until that is settled, **all Netlify config goes in `website/netlify.toml`.**

## Making this deployable — owner decision

Netlify Functions need a `package.json` in the base directory to resolve
`@netlify/blobs`. The base directory is `website`; the `package.json` is at the
repo root. That mismatch is the whole problem, and there are two ways to close it.

### Option A — move the base directory to the repo root *(cleaner, wider blast radius)*

Netlify → Project configuration → Build & deploy → Build settings → set **Base
directory** to empty/root, keep **Publish directory** as `website`.

- ✅ `package.json` is where Netlify expects it; functions build normally.
- ✅ The repo-root `netlify.toml` — the maintained, better-documented file —
  becomes live, and `website/netlify.toml` can be deleted.
- ⚠️ **This also activates every currently-dead rule at once**: the `/meta-web/*`
  `max-age=300` cache fix (handoff.md §1), `/assets/og-image.png` `max-age=86400`,
  and the UTF-8 `Content-Type` headers. Those are probably all wanted, but they
  are untested in production and would land in the same deploy.
- ⚠️ Also check whether the daily-meta / sets-refresh workflows assume the
  current layout before switching.

### Option B — add a minimal `website/package.json` *(uglier, smaller blast radius)*

A file containing only `@netlify/blobs` and `@netlify/functions`.

- ✅ Nothing else changes; one new file, easy to reason about.
- ⚠️ Two dependency manifests to keep in sync, and the root `netlify.toml` stays
  dead — so handoff.md §1 stays open.

**Recommendation:** Option A is the right end state, but do it as its own change
with its own verification, *not* bundled with install counting. Ship the base
directory move, confirm the site and the meta-web cache headers are correct,
then wire the function, then add the redirect. Three pushes, each verifiable.

## Reverting

Delete the `[[redirects]]` block for `/version.json` from [`website/netlify.toml`](../website/netlify.toml) — *not* the root file, which does nothing. The static file is still published, so the endpoint serves normally again on the next deploy. Nothing else needs touching.

## Open decision — unique users

Getting true unique-install counts needs one of:

1. **Daily-salted IP hash** (what privacy-first analytics like Plausible do). No IP stored, salt rotates daily so hashes can't be linked across days. Accurate uniques, but it does mean processing IPs — a judgment call given "nothing leaves your PC" is the brand.
2. **A random install ID** generated on first run. Most accurate, but it *is* an identifier, and it belongs in the Phase 0 opt-in health ping with a consent screen, not here.
3. **Leave it as is** and use Netlify Analytics' IP-based uniques as the proxy.

Option 3 is in force. This was left as an owner decision rather than assumed.

# Install counting

**Added:** 2026-07-30 · Phase 0 item 1 of [`PLATFORM-STRATEGY.md`](PLATFORM-STRATEGY.md)

> ## ❌ STATUS: WITHDRAWN — right machinery, wrong endpoint
>
> The function works. It deployed, served `/version.json`, authenticated, and
> counted correctly — the 7 recorded `other` hits were verification `curl`s,
> proving the bot/app split works.
>
> **But `app` stayed at 0, because real installs never request `/version.json`.**
>
> ### Why this endpoint was the wrong target
>
> `src/store/useAppStore.ts::checkForUpdates` tries the **signed Tauri updater
> first** (`checkAppUpdateSigned()` → `/updater/latest.json`) and returns early
> in both success cases — update found, or already current. Its own comment
> says it: *"Consulting version.json here would only offer a weaker path to the
> same answer."*
>
> `/version.json` is reached **only when the signed check fails** — offline, or
> a broken manifest. So it is a fallback endpoint, not a heartbeat. Confirmed
> empirically: a real app launch produced no request at all (neither `app` nor
> `other` moved).
>
> **The mistake:** the premise "every running copy fetches `/version.json` on
> launch" came from reading `versionCheck.ts` and `App.tsx` without tracing the
> *caller*. Everything downstream was built correctly on a false foundation.
> **Lesson: verify that a signal exists before building infrastructure to
> measure it.** One `curl` against a running app, or two minutes reading
> `checkForUpdates`, would have caught this before any of it was written.
>
> The redirect has been removed. `/version.json` is a plain static file again.
> The function code is retained — it is sound and tested — but nothing routes
> to it.
>
> ### What to do instead
>
> 1. **Now, zero risk:** Netlify Web Analytics, filtered to
>    **`/updater/latest.json`** — *that* is the endpoint every install hits on
>    launch, via the Tauri updater. Not `/version.json`.
> 2. **Properly, later:** the opt-in health ping (Phase 0 item 5 in
>    `PLATFORM-STRATEGY.md`) shipped in a release. Purpose-built and consented,
>    rather than piggybacking on an endpoint that may or may not be requested.
>
> **Do NOT instrument `/updater/latest.json` with a function.** It drives the
> signed auto-update. Reading its request count in Analytics is free and safe;
> putting code in that path is not.
>
> ### Getting here broke production once — read this before touching it again
>
> | # | What was tried | Result |
> |---|---|---|
> | 1 | Redirect + function shipped together | **`/version.json` 404 for ~12 min** (`5a6ab41`, reverted `b3dba99`) |
> | 2 | `website/package.json` added, no redirect | Harmless. Function still absent; sources served as static assets |
> | 3 | Functions moved to repo root | Deploys **failed** — see below |
> | 4 | Test file moved out of `functions/` | Deploy green, function live (`e359f7b`) |
> | 5 | Redirect added, target verified first | **Working** (`958a0e0`) |
>
> **The actual root cause of #3** was not configuration at all:
> `netlify/functions/version.test.mts` was treated as a deployable function
> named `version.test`, and a dot is an illegal Netlify function name. Every
> deploy failed at the *Deploying* stage for ~15 minutes, including any the
> daily meta cron would have triggered. **Never put a test file — or anything
> with a dot in its basename — inside the functions directory.**
>
> **Why none of it was worse:** `/updater/latest.json` was deliberately never
> instrumented, so signed auto-updates worked throughout. `versionCheck.ts` is
> null-safe, so the app degraded to "couldn't check for updates". And Netlify
> refuses a whole failed deploy rather than publishing half of it, so the site
> kept serving a known-good version.
>
> **Three rules, each learned the hard way:**
> 1. Deploy the function first. Confirm `/.netlify/functions/version` returns
>    200 with `X-FND-Manifest: function`. Add the redirect in a *separate* push.
> 2. Read the Netlify **deploy log** before theorising. It named the failure in
>    plain English while three wrong diagnoses were made from response headers.
> 3. Nothing with a dot in its name goes in `netlify/functions/`.

Answers the question "how many people actually run this?" without adding telemetry, an account, or anything that identifies a user.

---

## How it works

Every running copy already fetches `/version.json` — on launch, on window focus when the local meta copy is >90 min old, hourly on the same staleness check, and when connectivity returns ([`src/App.tsx`](../src/App.tsx) + [`src/services/versionCheck.ts`](../src/services/versionCheck.ts)). The client appends `?t=<now>`, so **every one of those requests bypasses the CDN edge and reaches the origin.**

That traffic was already happening and already being logged; it just wasn't being counted. [`netlify/functions/version.mts`](../netlify/functions/version.mts) now serves that path and increments aggregate counters on the way through.

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

## The two netlify.toml files — both are live, for different things

This caused three misdiagnoses. **Neither file is dead.** Verified empirically
2026-07-30:

| File | Governs | Why |
|---|---|---|
| [`netlify.toml`](../netlify.toml) (repo root) | `publish`, `[functions]` | Read because the Netlify **base directory is the repo root** (blank in the dashboard). Deploy log confirms: `Starting to deploy site from 'website'`. |
| [`website/netlify.toml`](../website/netlify.toml) | **headers, redirects** | Honoured because it sits *inside* the publish directory. |

Evidence for the split: the function deploys (root `[functions]` works), while
live response headers match the `website/` file — `/meta/latest.json` returns
`max-age=120` + `Access-Control-Allow-Headers`, which only that file specifies.

**So: functions and build config go in the root file. Redirects and headers go
in `website/netlify.toml`.** Putting a redirect in the root file will silently
do nothing.

**The base directory is correct as-is. Do not change it.** An earlier version of
this document recommended moving it; that recommendation was wrong and is
withdrawn.

### ✅ Resolved: the root file's header rules never applied

Because headers come from the `website/` file, these root-file rules never took
effect: `/meta-web/*` `max-age=300`, `/assets/og-image.png` `max-age=86400`, and
the UTF-8 `Content-Type` rules. **This was the real explanation for the old
`handoff.md` §1** — the meta-web cache fix "never showed up live" because it was
written into the file that does not control headers, not because of a pinned
deploy or auto-publish being off.

**Reviewed and closed 2026-07-30.** Each dead rule was judged on its merits
rather than ported wholesale, and the reasoning now lives in comments at the top
of both `netlify.toml` files:

| Rule | Decision |
|---|---|
| `/assets/og-image.png` `max-age=86400` | **Ported.** Social scrapers refetch it constantly and it only changes on release |
| `/meta-web/*` `max-age=300` | **Not ported** — it would make pages *staler* than the current `max-age=0`. The original "fix" was misconceived |
| `/updater/*` `max-age=60` + CORS | **Not ported, deliberately.** Caching the update manifest is the wrong direction, and the CORS headers are dead weight: the Tauri updater fetches via reqwest, so no preflight is ever involved |
| `/*.html` UTF-8 | Already present in `website/netlify.toml` |

The root file keeps its rules for provenance. **Do not "fix" them by porting
wholesale** — that is the trap this table exists to prevent.

## Reverting

Delete the `[[redirects]]` block for `/version.json` from [`website/netlify.toml`](../website/netlify.toml) — redirects live there, not in the root file. The static file is still published, so the endpoint serves normally again on the next deploy. Nothing else needs touching.

## Open decision — unique users

Getting true unique-install counts needs one of:

1. **Daily-salted IP hash** (what privacy-first analytics like Plausible do). No IP stored, salt rotates daily so hashes can't be linked across days. Accurate uniques, but it does mean processing IPs — a judgment call given "nothing leaves your PC" is the brand.
2. **A random install ID** generated on first run. Most accurate, but it *is* an identifier, and it belongs in the Phase 0 opt-in health ping with a consent screen, not here.
3. **Leave it as is** and use Netlify Analytics' IP-based uniques as the proxy.

Option 3 is in force. This was left as an owner decision rather than assumed.

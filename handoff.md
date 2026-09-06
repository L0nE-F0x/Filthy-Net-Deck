# Filthy Net Deck — handoff

**Read this first.** Live top-of-todo across model/agent handoffs
(Claude / Opus / Grok / Kimi).

**Live product version: v3.7.2** (Windows signed updater · Linux pacman
package · macOS still on the 3.7.1 dmg until CI attaches 3.7.2)
· repo `L0nE-F0x/Filthy-Net-Deck`
· **Next: roll the 3.7.2 macOS dmg from the GitHub Release, then publish
`filthy-net-deck-bin` to the AUR the day Arch reopens registration.**

Windows signed updater is the ship path. macOS is a homepage dmg roll from
the GitHub Release — do not leave visitors on the previous dmg after CI
attaches the new one. Linux is a pacman package built from the release
tarball; it is never a `.pkg.tar.zst` download button.

This Omarchy box **can** produce the signed NSIS + updater `.sig` (key in
`~/.tauri`, cargo-xwin, local NSIS). Authenticode is skipped on Linux;
that is expected and does not block auto-update.

---

# ▶ START HERE — next session

**2026-09-06 — v3.7.2 shipped: the galaxy deck is isolated again.**

The audit's v3.7.1 "highlight in place" made Show this deck look like nothing
happened. Additive blending of 117k dimmed stars is still a full galaxy, the
nebula stayed at full strength, and FND then posted the tracker's whole
collection over the highlight, so anyone with match history never saw the
deck they clicked.

v3.7.2 restores isolation (filter + highlight), keeps the real audit fixes
(commander commas, URL round-trip, nebula invalidate, WebView2 defaults),
skips collection overlay when `?cards=` is on the iframe, and no-ops a
sidebar click while Aetherfield is already open.

Windows NSIS + updater `.sig` (key id `67FCA9900F523D49`). Linux tarball
`filthy-net-deck-3.7.2-x86_64.tar.gz`, sha256
`0e77ede23d635934f8fb58f4a1cfece1076d3e89967a3b795d1088effaa4ba75`.
macOS still serves the 3.7.1 dmg until CI builds 3.7.2 on the tag — same
pattern as 3.7.1. Downloads pruned to 3.7.1 + 3.7.2.

**2026-09-06 — v3.7.1 shipped: the audit fixes, and the galaxy deck link.**

A bug-fix release that exists mainly to get the Aetherfield audit fixes into
the installer. Pushing the galaxy's repo only updates the public website —
FND ships a vendored `public/aetherfield/`, so nothing reached users until
this bump. `npm run aetherfield` was re-run; the vendored bundle is the fixed
one.

The headline: **Show deck in galaxy was broken for every commander.** The
list was `encodeURIComponent(names.join(","))`, and a tenth of card names
contain a comma — every "Narset, Parter of Veils", which is to say every
commander the button deliberately appends. After decoding, a separator and a
comma inside a name are the same character. Both sides encode per token now,
and the galaxy re-splits an unresolved token so links already shared still
work. The link also survives a reload, and the deck now **highlights in
place** rather than filtering the galaxy down to itself.

Windows privacy defaults are restored — see the commit. 3.7.0's
`additionalBrowserArgs` replaced wry's default string instead of adding to
it, which silently re-enabled `msSmartScreenProtection`.

Artifacts: Windows NSIS 12,591,286 bytes + 428-byte updater `.sig`, key id
`67FCA9900F523D49` (decoded from both the sig and `tauri.conf.json`, matched,
not assumed). Linux tarball 16,303,473 bytes, sha256
`6075a4a4d3bb0f93695c04eeb86ef1c78e0037f4527757b3d0c760719d665979`, already
in the PKGBUILD. Downloads pruned to 3.7.0 + 3.7.1.

**Full audit of the v3.7.0 work is `../Magic Card Universe/AUDIT-2026-09-05.md`**
— every finding in it is now fixed and shipped, across both repos.

**Still open:** four module-level `t()` call sites in `Sets.tsx` (219, 610,
766, 777) have the same memo-fragility as the two the audit named. Left
alone deliberately; not user-visible today.

AUR publish of `filthy-net-deck-bin` still waits on Arch registration — the
PKGBUILD is already at 3.7.1 with the right checksum.

**2026-09-05 — v3.7.0 shipped: Aetherfield title, tour, deep links.**

Phases 3 and 4 are in the installer. Sidebar opens Aetherfield on its title
(Enter / Tour / Settings). Sets and Deck View pass `shell=play` plus `set=` /
`cards=`. The vendored galaxy is the polished one. Public URL
filthy-net-deck.com/aetherfield is a 200 path proxy — do not 301 slash forms
(that loops). `sw.js` is 404'd on that path on purpose.

Windows NSIS 12,543,732 bytes + 428-byte updater `.sig` (key id
67FCA9900F523D49). macOS dmg 32,066,702 bytes, size-checked against the
release asset. Linux tarball 16,252,717 bytes. Downloads pruned to 3.6.1 +
3.7.0.

AUR publish of `filthy-net-deck-bin` still waits on Arch registration.

**2026-09-05 — three owner questions answered. Read this before touching the embed.**

Owner is continuing tonight with other models. These are the answers, with the
evidence, so nobody re-derives them.

### 1. Pushing to the Aetherfield repo does NOT update FND

This is the one that matters. **FND does not load Aetherfield over the
network.** `src/pages/Aetherfield.tsx` loads `/aetherfield/index.html` — a path
*inside the app bundle* (plus an optional query from Sets / DeckView).
`public/aetherfield/` is a vendored copy of Aetherfield's built `dist/`, baked
into the installer by `npm run aetherfield`.

So a push to `L0nE-F0x/MTG-Multiverse` updates only the public website. FND
keeps showing whatever was compiled into the version the user installed. To
land Aetherfield changes in FND:

```
cd Filthy-Net-Deck
npm run aetherfield      # rebuild Aetherfield + copy dist/ -> public/aetherfield/
git commit
# then a version bump and a full release — users run installers.
```

That last step is AGENTS.md hard rule 1, not a formality.

**If the owner wants Aetherfield to update without an FND release**, the change
is small: point `SRC` at `https://filthy-net-deck.com/aetherfield/` (see §3) and
add that origin to `frame-src` in `src-tauri/tauri.conf.json` — it is currently
`'self'` plus the two YouTube origins, so a remote frame is blocked today.

Trade-offs, honestly: the galaxy stops working offline; the 6.5 MB catalogue
becomes a download instead of shipping in the installer (which drops ~4.5 MB);
and a bad Aetherfield deploy instantly breaks the page for every FND user with
no version pinning. The failure panel already handles "did not load", so the
failure mode is at least graceful. **If it goes remote, also add an origin check
to `isAetherMessage` in Aetherfield.tsx** — it currently only matches
`event.source`, which is fine same-origin but thin for a cross-origin frame.

The best long-term shape is a hybrid: try remote, fall back to the vendored
copy. Nobody has built that.

### 2. The Aetherfield landing page inside FND — done (phase 3)

The sidebar launch has no query, so the title shows (Enter / Tour / Settings).
Sets and DeckView still pass `?shell=play` because those clicks already chose
a destination. Install is hidden when `isEmbedded()` — `beforeinstallprompt`
never fires in a Tauri webview, so that button would have done nothing.

### 3. Renaming the Netlify site cannot break FND

Same reason as §1 — FND never reads that URL. Renaming affects the public
website only. The one place the URL appears is `%SITE_URL%` in Aetherfield's
`vite.config.ts`, used for `og:`/canonical tags, and Netlify sets `URL` itself,
so it self-corrects on deploy.

**Consolidating onto filthy-net-deck.com** is worth doing. Two clean ways, both
of which avoid a second copy of the 7 MB payload:

- **Subdomain** — add `aetherfield.filthy-net-deck.com` as a custom domain on
  the Aetherfield Netlify site. Pure DNS, no build changes. Simplest.
- **Path proxy** — keep Aetherfield on its own site and add to
  `website/netlify.toml` (redirects live in *that* file, not the root one):

  ```toml
  [[redirects]]
    from = "/aetherfield/*"
    to = "https://mtg-multiverse.netlify.app/:splat"
    status = 200
  ```

  This gives exactly `filthy-net-deck.com/aetherfield` with no duplicated
  files. It works because Aetherfield builds with `base: './'` — its assets are
  document-relative, so they resolve under any path. The marketing site has no
  `/aetherfield` path today, so nothing collides.

**Do NOT** copy Aetherfield's `dist/` into `website/aetherfield/` as well. That
is a second 7 MB in this repo on top of `public/aetherfield/`, and
`GIT-HISTORY-BLOAT.md` is already a live concern.

Neither option complicates the workflow. What *would* is merging the repos or
duplicating the build.

**2026-09-05 — v3.6.1 shipped: Aetherfield polish.**

Owner ran 3.6.0 on Linux and Windows and found the galaxy jumbled: dead space
along the bottom, the layout switcher sitting on top of the filter panel, and
the galaxy centred on the whole pane so its left third hid behind that panel.
All fixed, plus persistent render settings, overlay scaling, and an Expand
control. Previewed by the owner on this box before the push, from a directly
run build — approved on both Linux and, for the earlier build, Windows.

### The two CSS bugs are the same bug, twice

`.content--flush` and `.app-shell--immersive` each lost to a **later rule of
identical specificity** further down `index.css` (`.content { padding: … }` at
~998, `.app-shell { grid-template-columns: 200px 1fr }` at ~998). Single-class
modifiers in that file are not safe; double the class. The immersive one also
hid `.sidebar`, which takes it out of grid flow and promotes `.main-pane` into
the *first* column — with a `200px 1fr` track list still in force, the "full
window" galaxy came out exactly 200px wide.

Neither was visible by reading the CSS. Both were caught by measuring the
frame's `getBoundingClientRect()` in the harness. Keep asserting geometry, not
appearance.

### The galaxy shift is a projection offset, not a moved camera

`camera.setViewOffset` in `App.resize()`. The picker renders its pass with the
same camera object, so the offset carries; moving the camera instead would
leave picking silently disagreeing with the screen by the offset — the same
shape as the old dpr-scaled pick buffer. Interaction suite still lands on
Black Lotus under the cursor, which is the check that proves it.

Panels report what they occlude through `store.insets` (UI must not import
three; the store is the only channel). `--mcu-inset-left` carries the same
number to CSS for the layout switcher.

### Nebula: investigated, deliberately unchanged

Owner thought it sat left. It does not: `ARM_TWIST` (shader) and `TWIST`
(layouts) both read 0.0092, and every structural term in `densityAt` — disc,
bulge, vertical falloff, arm — is measured from the world origin, same as the
stars. The only asymmetry is the noise field, sampled with a **time-varying**
offset, so the densest gas genuinely wanders. A fixed world-space nudge would
only look right from one camera angle and would drag the gas off the arms.
Owner re-checked after the centring fix and agreed it looks fine. Do not
"fix" this without measuring luminance centroids with the nebula on and off.

### What is live

Windows NSIS 12,529,261 bytes + 428-byte `.sig`, key id `67FCA9900F523D49`
verified by decode. Linux tarball 16,240,531 bytes, sha256 re-checked against
the published file. macOS dmg from CI. Downloads pruned to 3.6.0 + 3.6.1.

**2026-09-04 — v3.6.0 shipped: Aetherfield.**

New sidebar destination below the eight numbered nav items: the 117,621-card
galaxy from `L0nE-F0x/MTG-Multiverse`, shown in an iframe over its built site
vendored into `public/aetherfield/` by `npm run aetherfield`. Rationale,
message contract and failure modes: `docs/AETHERFIELD-EMBED.md`.

### What is live

| Surface | State |
|---|---|
| Tag + GitHub Release `v3.6.0` | ✅ pushed, release created with notes |
| Windows signed NSIS | ✅ 12,438,547 bytes + 428-byte updater `.sig` |
| Signing key id | ✅ `67FCA9900F523D49` — sig key id == `tauri.conf.json` pubkey key id, verified by decoding both, not assumed |
| `updater/latest.json` | ✅ 3.6.0, signature byte-identical to the `.sig` |
| Linux release tarball | ✅ `filthy-net-deck-3.6.0-x86_64.tar.gz` (16,141,880 bytes) attached to the release |
| PKGBUILD | ✅ `pkgver=3.6.0`, sha256 verified by re-downloading the published tarball and hashing it |
| Site recipe tarball | ✅ regenerated (`npm run linux:recipe`) |
| macOS dmg | see the macOS row below |
| `version.json` ×2, `index.html`, OG, `/meta-web/` | ✅ 3.6.0, og cache-bust `?v=3.6.0` |
| Downloads pruned | ✅ 3.3.0 / 3.3.1 / 3.4.0 removed; 3.5.0 + 3.6.0 kept |

### Two process notes worth keeping

**The website was held back from the first push on purpose.** The macOS dmg is
built by CI from the tag, so any site copy advertising 3.6.0 before the dmg
exists links a download that 404s. Source went up first (CI builds from that
tree; `website/` does not affect the app), the live site kept advertising 3.5.0
consistently, and everything flipped in one later commit. Do this again — the
alternative is a window where the macOS button is broken.

**`git merge`, never rebase, when the automation has landed commits.** The
first `git push` was rejected because the daily meta / set-radar jobs had
pushed. The tag was already on the local commit, and rebasing would have moved
the tree the macOS runner was building. Same reasoning as v3.5.0.

`scripts/build-linux-tarball.mjs` is new: 3.5.0's tarball was hand-assembled,
and its layout is a published contract — `package()` reads exact paths out of a
top-level `filthy-net-deck-<ver>/`, so a mis-named staging dir yields a tarball
that checksums fine and installs nothing.

### Retired by this release

The 3.5.0 binaries' `WHATS_NEW[0]` claimed the Linux package was "installed
from the AUR", written before Arch paused registration and compiled into all
three artifacts. 3.6.0's what's-new replaces it. **The AUR itself is still
blocked** — the interim `curl … | tar xz && makepkg` recipe is still what the
site publishes, and swapping to the one-liner is still its own release (see the
AUR section below, unchanged).

### Known trade — decide before refreshing often

`public/aetherfield/` is 7.4 MB committed, 6.5 MB of which is the star
catalogue. See the *Git size* section of `docs/AETHERFIELD-EMBED.md` and
`docs/GIT-HISTORY-BLOAT.md`; the escape hatch is serving `data/` from
filthy-net-deck.com instead. Refresh only when the catalogue actually changed.

**Upload payload did not change**, so `README.md` / `index.html` /
`privacy.html` upload claims were correctly left alone — Aetherfield is
entirely local and talks only to Scryfall from the client.

**Parked by the owner:** a Sets-page entry point that deep-links into a set's
cluster, and "show this deck in the galaxy" from DeckView.


0. **2026-09-03 — v3.5.0 shipped. Linux is a supported platform. One item is
   parked on an external blocker: the AUR.**

   **Shipped by: Claude**, on the owner's explicit "ship an early Linux
   version now" and their choice of **3.5.0** ("Linux is a platform now")
   over a quiet 3.4.1.

   ### What is live

   | Surface | State |
   |---|---|
   | Tag + GitHub Release `v3.5.0` | ✅ pushed, release created with notes |
   | Windows signed NSIS | ✅ 7,947,265 bytes + 428-byte updater `.sig` |
   | `updater/latest.json` | ✅ 3.5.0, signature byte-identical to the `.sig` |
   | Signing key id | ✅ `67FCA9900F523D49` — sig key id == `tauri.conf.json` pubkey key id, verified by decode, not by assumption |
   | Linux release tarball | ✅ `filthy-net-deck-3.5.0-x86_64.tar.gz` (11,705,930 bytes) attached to the release |
   | Arch package | ✅ `filthy-net-deck-bin 3.5.0-1` built **from the published URL** and installed on this box |
   | macOS dmg | see the checklist at the bottom of this entry |
   | Marketing site | third OS entry, install recipe, 4 new i18n keys in all 7 catalogs |
   | OG card | `NEW · v3.5.0 · NOW ON LINUX`, `?v=3.5.0` cache-bust |

   ### The AUR is blocked — this is the top of the todo

   Arch has **new-account registration paused** ("a wave of automated account
   creation"), so `filthy-net-deck-bin` does not exist on the AUR and
   **nothing on the site, in the app, or in the package says `yay -S`.**
   Do not add that wording back until the package is actually published.

   An ed25519 key is already generated and waiting:

   ```
   ~/.ssh/aur          (private, mode 600)
   ~/.ssh/aur.pub      ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEXdoNoGqB7qZNUw+LqnmOL1D7VweskFLtQ2OVitf22K
   ~/.ssh/config       Host aur.archlinux.org → User aur, IdentityFile ~/.ssh/aur
   ```

   When registration reopens, the whole job is:

   1. Owner registers at aur.archlinux.org and pastes `~/.ssh/aur.pub` into
      My Account → SSH Public Key. **Only the owner can do this.**
   2. `git clone ssh://aur@aur.archlinux.org/filthy-net-deck-bin.git`
   3. Copy `packaging/arch/PKGBUILD` + `filthy-net-deck-bin.install` in
      **verbatim** — the PKGBUILD already sources the checksummed GitHub
      release tarball, which is exactly what the AUR requires. This was done
      deliberately so publishing is a copy, not a rewrite.
   4. `makepkg --printsrcinfo > .SRCINFO`, commit, push.
   5. Then and only then, swap the three places back to the one-liner:
      - `website/index.html` → `download.linuxCmd` + the `<pre class="install-block">`
        + the Linux button `href` (currently the GitHub release page)
      - all 7 `website/i18n/*.json` → `download.linuxCmd`
      - `src/pages/Settings.tsx:~1373` → back to `omarchy update`
        (the comment there says the same thing)
      - `packaging/arch/filthy-net-deck-bin.install` → the update paragraph
      That is a real version bump (3.5.1), because the app copy changes.

   ### ⚠️ The shipped 3.5.0 binaries say "installed from the AUR"

   `WHATS_NEW[0]` in `src/version.ts` read *"Arch and Omarchy, installed from
   the AUR"* when the Windows `.exe`, the macOS `.dmg` and the Linux binary
   were built. It was written before Arch turned out to have registration
   paused, and it is **compiled into all three artifacts** — the post-update
   "What's new" panel shows it once, to whoever installs 3.5.0.

   Source is now corrected to *"as a real pacman package"*, so `main` no longer
   carries the false claim, but **the released binaries still have the old
   line**. Fixing them properly means rebuild + re-sign + move the `v3.5.0`
   tag + a fresh macOS dmg, i.e. cutting 3.5.1.

   Owner's call, not an agent's. Two honest options:
   - **Leave it.** One bullet, shown once, and it becomes *true* the day the
     AUR package lands.
   - **Cut 3.5.1 now.** ~15 min of builds plus a reinstall on this box.

   Everything *server-side* was already corrected and is live: `version.json`
   ×2 and `updater/latest.json` notes, plus `og:description` /
   `twitter:description`, all now say "a real pacman package".

   The 3.5.1 that publishes to the AUR has to rewrite this line anyway, so
   the two fixes collapse into one release if you wait.

   ### The interim Linux install — what visitors actually get today

   ```bash
   curl -L https://filthy-net-deck.com/downloads/filthy-net-deck-bin.tar.gz | tar xz
   cd filthy-net-deck-bin && makepkg -si
   ```

   `website/downloads/filthy-net-deck-bin.tar.gz` holds PKGBUILD +
   `.install` and is **unversioned on purpose** — the command in eight
   locales must not carry a version string. It gets `max-age=60` in
   `website/netlify.toml` (all other `/downloads/*` are an hour) so a stale
   copy cannot hand someone a recipe for a tarball the new release lacks.

   ⚠️ `makepkg` needs the `.install` file **next to the PKGBUILD**, not in
   `source=()`. That is the whole reason the recipe ships as a tarball rather
   than a bare PKGBUILD link.

   **Verified end to end**, not assumed: fresh directory → extract the site's
   recipe tarball → `makepkg` downloaded the 11 MB payload from the GitHub
   release, passed the sha256, and produced `filthy-net-deck-bin-3.5.0-1`.

   ### Installed on this Omarchy box right now

   - `filthy-net-deck-bin 3.5.0-1` → `/usr/bin/filthy-net-deck`, installed by
     the owner with `sudo pacman -U`. Older 3.4.0-1 replaced cleanly.
   - Crash banner filtered **on this machine only**:
     `~/.config/systemd/user/omarchy-crash-watch.service.d/ignore-webkit.conf`
     `OMARCHY_CRASH_IGNORE=^(WebKitWebProcess|WebKitNetworkProcess)$`.
     Do not `omarchy toggle crash capture`. The package `.install` scriptlet
     now *explains* the banner to AUR users; it does **not** ship a systemd
     drop-in that mutes WebKit for the whole session.
   - Live compositor rules are `~/.config/hypr/looknfeel.lua` (Omarchy
     `o.window`, **not in git**). Package users get
     `dofile("/usr/share/filthy-net-deck/hypr/filthy-net-deck.lua")`
     (`hl.window_rule`). Diff the follow-Arena script in both before
     the next publish so package users are not a revision behind this box.

   ### Verified LIVE on filthy-net-deck.com — not just committed

   ```
   version.json           3.5.0, notes say "a real pacman package"
   updater/latest.json    3.5.0, windows-x86_64 only (Linux key absent BY DESIGN)
   Setup-3.5.0.exe        7,947,265 bytes   .sig  428 bytes
   3.5.0-universal.dmg    22,920,826 bytes  (macOS run 33710955191, success)
   filthy-net-deck-bin.tar.gz  2,397 bytes
   og:title               "Filthy Net Deck v3.5.0 — now on Linux"
   og:image               ?v=3.5.0
   /meta-web/*            Linux button present, og cache-bust now 3.5.0
   ```

   **The published install command was run verbatim from the live site** —
   `curl … | tar xz && makepkg` retrieved the release tarball, passed the
   sha256, and produced `filthy-net-deck-bin 3.5.0-1`. Not inferred.

   `main` == `origin/main` at `62efa5b2`. Tag `v3.5.0` → `a8a4bcad`, still
   reachable from `main`: the automated set-radar commits were **merged, not
   rebased**, on purpose — rebasing would have moved the commit whose tree
   the macOS runner built the released dmg from.

   ### Still open — and who has to do each

   ```
   [x] DONE 2026-09-03 — Owner ran Check for updates → Update & restart on
       Windows. The signed updater path works end to end for real users.
       Confirmed by the owner and corroborated on disk; see below.
   [ ] Share preview in a private window (X/Discord cache the old card)
   [ ] WHATS_NEW wording in the shipped 3.5.0 binaries — owner's call,
       see the ⚠️ section above. Not a regression; a premature claim.
   [ ] AUR — blocked on Arch reopening registration. Key is generated and
       waiting; the publish is five steps and they are written out above.
   ```

   ### The Windows box, 2026-09-03 — two findings from the owner's machine

   Found on the owner's Windows box after pulling this release. Neither was
   visible from Omarchy; both are recorded so the next session does not
   re-derive them.

   **1. The system clock was exactly 8 hours slow, and `w32time` was stopped.**

   Netlify's `Date` header said `05:41:21 GMT`; the box said `21:41:21 GMT`
   the previous day — same seconds, eight hours apart. The timezone was set
   to Singapore (+08:00) but the wall clock held UTC as if it were local.

   This is not cosmetic. `tracker.rs:751` stamps every match from
   `SystemTime::now()`, and `iso_date()` derives the calendar date from that
   number, so **every match recorded on that box was timestamped 8h early**
   and any game played in the first 8h of a UTC day was filed under the
   previous date. With cross-device history live, Windows and Linux rows
   interleave wrongly. The already-synced 500 rows are internally
   consistent, just shifted.

   Machine config, not a code bug. Owner fixed it (`Start-Service w32time;
   w32tm /resync /force`); verified back in sync to the second.

   ⚠️ Any forensics on that box dated **before** the fix reads 8h early in
   absolute terms. Under the skew, *displayed local time happened to equal
   true UTC* — which is why the file timestamps below need care.

   **2. The signed updater round-trip is CONFIRMED — and it leaves a stale
   Add/Remove Programs entry behind. Cosmetic, but unexplained.**

   The round-trip (the thing the release was waiting on) is proven:

   - The owner confirms they clicked **Check for updates → Update & restart**
     at ~13:34 +08 on 2026-09-03.
   - Nothing was manually downloaded — no installer anywhere in Downloads.
   - The installed `filthy-net-deck.exe` reports FileVersion and
     ProductVersion **3.5.0**.
   - The installed `uninstall.exe` **embeds 3.5.0**, and NSIS only writes
     that file from `Section Install`. So the 3.5.0 installer really ran.
   - `uninstall.exe`, the Start Menu shortcut and the app relaunch all carry
     the same second: true `2026-09-03T05:34:25Z`.

   The signature verified (the installer would not have run otherwise), NSIS
   installed, the app relaunched. **Do not re-prove this.**

   The leftover: `HKCU\...\Uninstall\Filthy Net Deck` still reads

   ```
   DisplayVersion  3.1.0          EstimatedSize  21120 KB
   ```

   while the 3.5.0 binary alone is 21,619 KB. Both values are pre-3.5.0, and
   `EstimatedSize` matches no recent build (the 3.4.0 script defines
   `ESTIMATEDSIZE 22027`). There is exactly one such key — checked across
   HKCU, HKLM, WOW6432Node and every loaded hive in `HKEY_USERS`. The app is
   `installMode: currentUser`, unchanged since v0.2, so `SHCTX` is HKCU.

   Why this is odd rather than obvious: `Section Install` writes
   `DisplayVersion "${VERSION}"` **unconditionally** — no `$UpdateMode`
   guard — at `src-tauri/target/release/nsis/x64/installer.nsi:677`, in the
   section spanning 628–715, *six lines before* the `uninstall.exe` write
   that demonstrably succeeded. The released
   `website/downloads/Filthy-Net-Deck-Setup-3.5.0.exe` contains **only**
   `3.5.0` as a version string (UTF-16LE, twice; no `3.1.0` anywhere), so
   its `VERSION` define is correct. Every version field in the repo is
   consistently 3.5.0 and `scripts/bump-version.mjs` writes all four.

   So the file writes in that section stuck and the registry writes did not.
   NSIS `WriteRegStr` fails silently unless the error flag is checked.
   **Mechanism unexplained — do not assume it is understood.**

   Impact is cosmetic and bounded: nothing in FND reads `DisplayVersion`
   (grepped), so no player-facing behaviour is wrong. The cost is
   diagnostic — asking a user "what version does Windows Apps & Features
   say" returns a wrong answer, and it has been wrong since 3.1.0.

   Next Windows release is the free experiment: watch whether that key moves
   off 3.1.0. No need to manufacture a downgrade to test it.

   ⚠️ Caveat on the above: the `installer.nsi` read is the **3.4.0**
   generated script (the last Windows build made on that box), not 3.5.0's.
   Same tauri CLI, so the structure holds, but it is an inference.

   **The Windows round-trip has since PASSED** (2026-09-03, owner-confirmed
   — see the Windows-box findings above). Kept for the next release: if it
   ever fails, the two things to look at first are
   `updater/latest.json`'s signature (verified byte-identical to the `.sig`
   on 09-03, and the key id decodes to `67FCA9900F523D49`, matching
   `tauri.conf.json`) and whether the installed build is old enough to
   predate the `downloads` map — a pre-3.5.0 client reads the bare
   `downloadUrl`, which is now the download page rather than the `.exe`.
   That is correct behaviour, not the bug.

   **Do not redo any of the shipped work to "check" it.** Everything in the
   table above was verified against the live site, including running the
   published install command verbatim. Start from what is open.

   ⚠️ **The marketing site has TWO download surfaces.** The homepage
   (`website/index.html`) and the generated public-meta pages
   (`pipeline/build-meta-site.mjs` → `/meta-web/`: hub, 2 formats, 32 deck
   pages, 354 card pages). v3.5.0 shipped with the homepage updated and the
   meta pages still offering Windows/macOS only — the owner caught it on a
   live deck page. **Both must move together on any platform or version
   change**, and `npm run meta:site` regenerates the second one. Those pages
   also carry `og-image.png?v=` and had been serving the 3.4.0 cache-bust.

   ### Do not do

   - Add a Linux key to `updater/latest.json`. Its absence is deliberate:
     `plugin-updater` throws `TargetNotFound` → Settings falls back to
     `version.json` with `canAutoInstall: false` and the package-manager
     sentence. It will NOT wrongly say "up to date".
   - Offer a `.pkg.tar.zst` download button. It bypasses pacman, and nothing
     would ever upgrade it.
   - AppImage (three independent Arch failures; glibc 2.44 vs Ubuntu 2.35).
   - `hyprctl set_prop max_size` — it crashed Hyprland (socket disconnect,
     SIGKILL). Overlay shrink uses `dispatch … window.resize` only.
   - `WEBKIT_DISABLE_DMABUF_RENDERER=1` as a product default (perf hit for
     a cosmetic dump).
   - Re-debug the 09-02 match-end abort (`toast.rs` unwrap on unrealized
     GTK window) — fixed in `1f7c54de`, verified.
   - Re-debug Mesa/NVIDIA `WebKitWebProcess` abort inside `exit()` — upstream,
     parent lives, banner is Omarchy crash-watch.
   - Android/iOS / APK tracking promises.
   - In-draft overlay, paywalls, Alchemy/Historic.
   - Claiming the Linux UI is live after only a git push.

   ### Accepted early-Linux gaps (shipped knowingly)

   - Overlay drag-persist: Wayland `set_position` is a no-op; we dock to
     Arena's top-left. Owner said saved overlay position is not a big deal.
   - Click-through does not exist on Linux (hidden, not broken-looking).
   - GTK/WebKit often refuses a client size under ~200×200; compositor clips
     the badge. Overlay collapse is the `overlay_set_extent` path.
   - `always_on_top` / `skip_taskbar` remain Wayland no-ops; Hyprland rules
     cover them.
   - Autostart ("Start with PC") not play-tested on uwsm.
   - Selawik is user-local (not in extra). Cascadia is a PKGBUILD optdepend.
   - WebKit children can still dump on **full process quit**; crash-watch
     ignore is machine-local. hide-not-destroy covers toast/overlay/presence
     during a session.
   - Workspace follow uses workspace **name** `special:scratchpad`. Numeric
     id `-98` is a silent Hyprland no-op.
   - No automatic Linux updates until the AUR package exists.

   ### Two traps fixed this session — do not reintroduce

   - **The OG card had a feature line running off the right edge in v3.4.0**
     and nobody saw it, because the only way to notice is to open the PNG.
     `website/assets/_gen_og.py` now measures every line against the card
     width and **raises SystemExit** rather than writing a cut-off card.
     There is no wrapping in that script; a long line is a lost line.
   - **The i18n catalogs use blank-line grouping** that mirrors the page
     order. `json.dump` flattens it and produces a ~220-line diff of pure
     noise. Patch `website/i18n/*.json` as **text**, inserting each key next
     to its siblings. `pipeline/site-i18n.test.mjs` enforces an exact key set
     across all seven — no missing keys, no stale ones.

   ### Verified on this box (do not re-prove)

   Proton Arena + Detailed Logs; match parse; cloud restore 500 Windows rows
   + Linux match uploaded as 501; soundscape needs `gst-plugins-good` (hard
   depend); updater degrades safely on Linux; signing pubkey matches
   `tauri.conf.json`; owner played with overlay expand/collapse, post-match
   graph, presence badge, and the 3.5.0 binary.

   Historical detail from 09-02/03 (crash stacks, AppImage autopsy, sync
   caps, Hyprland token traps) stays below. Do not re-litigate it.

   `docs/TWO-MACHINE-WORKFLOW.md` items 1, 2, 6 are now decided (real Arch
   package, Linux CI job in the tree, AUR updates). Fold anything durable
   into `AGENTS.md` if you touch that file; do not workshop the seven
   questions with the owner again.

   ### The crash — fixed, root cause, do not re-debug

   Owner played a match; the app died at the end of it. **One bug behind
   every symptom.** `toast.rs` built the alert window `.visible(false)` and
   immediately called `set_ignore_cursor_events(true)`. tao lowers that to
   `gtk_widget_get_window().unwrap()`, and an unrealized widget has no
   GdkWindow — the unwrap fires inside a **non-unwinding GLib dispatch**, so
   it aborts the process. `let _ =` looks like it swallows the failure; the
   panic happens later on the dispatch thread with nothing to catch it.

   Both core dumps that evening (17:39 and 19:04) have the identical stack.
   The WebKitWebProcess SIGSEGV afterwards is the child dying with its parent.
   **The tracker was never at fault** — the match was parsed and written to
   `tracker-matches.jsonl` before the abort.

   Fixed in `1f7c54de`: applied after `show()` instead, `#[cfg]`-gated to
   Linux so Windows/macOS keep the call they already ship. Verified by owner
   via Settings → Send test alert: no crash, no new core dumps.

   The overlay has the **same latent bug** and was only saved by
   `overlayClickThrough = false` taking the non-unwrap `else` branch. If
   click-through is ever enabled while the overlay window is hidden, expect
   the same abort. Not fixed — no repro path today.

   ### Cross-device sync — PROVEN, end to end, both directions

   The thing that had never once run against the live database now has.

   - Windows had uploaded **exactly 500** rows — that is `MAX_BACKUP_PER_RUN`
     (`sync.ts:404`), i.e. one capped run, oldest-first. Covered
     2026-07-13 → 2026-08-13.
   - This box restored them on launch.
   - The Linux match uploaded: `match_backup` went **500 → 501**, newest row
     `2026-09-02T11:04:35Z`, Ladder / loss / Mono Red Dragons / Platinum 3 —
     byte-for-byte the game just played.

   **Still incomplete:** everything after 2026-08-13 is not backed up yet.
   500 per launch, so the Windows box needs several more launches with cloud
   on to finish the backfill. That is expected behaviour, not a bug.

   Two asymmetries worth knowing:
   - **Restore needs only sign-in.** `fetchBackupMatches` gates on
     `cloudConfigured()` + a user, *not* the cloud toggle. Upload gates on
     `isCloudEnabled()`. Different preconditions.
   - **`cloud_enabled` is server-side and account-wide** (profiles row), not
     per machine. Turning it on anywhere turns it on everywhere.

   ### AppImage is a dead end on Arch — do not retry it

   Three independent failures, each Arch being newer than linuxdeploy:

   | Failure | Cause | Workaround |
   |---|---|---|
   | linuxdeploy won't start | needs `libfuse.so.2`; Arch has fuse3 only | `APPIMAGE_EXTRACT_AND_RUN=1` |
   | `strip` fails on every lib | Arch libs carry `.relr.dyn`; vendored binutils predates RELR | `NO_STRIP=1` |
   | GTK plugin dies | gdk-pixbuf 2.44 removed `/usr/lib/gdk-pixbuf-2.0/`, which it hardcodes | none |

   And it would have been the wrong artifact anyway: this box is **glibc
   2.44** vs Ubuntu 22.04's 2.35, so the result would refuse to start on most
   distros. Superseded by the Arch package.

   ### Arch package — built, verified, and INSTALLED (see the night entry)

   `packaging/arch/` (`8f2aa261`). Builds in **21 seconds**:

   ```bash
   # stage (binary must be a --no-bundle build, NOT one an appimage run patched)
   cp src-tauri/target/release/filthy-net-deck  <build>/filthy-net-deck
   cp packaging/arch/{PKGBUILD,*.install,*.desktop} <build>/
   cp packaging/arch/hypr/filthy-net-deck.lua   <build>/filthy-net-deck.lua
   for px in 32 64 128; do cp src-tauri/icons/${px}x${px}.png <build>/icon-$px.png; done
   cd <build> && makepkg -f
   ```

   Produces `filthy-net-deck-bin-3.4.0-1-x86_64.pkg.tar.zst`, 11M. Contents
   verified: `/usr/bin`, `.desktop`, icons ×3, and the Hyprland rules at
   `/usr/share/filthy-net-deck/hypr/`.

   ⚠️ **`makepkg` resolves local `source=()` entries by basename** — a
   `hypr/x.lua` path fails. Keep them flat.

   ⚠️ **Do not package `src-tauri/target/release/filthy-net-deck` after an
   appimage build has run** — that step patches the binary with bundle-type
   info. Rebuild with `--no-bundle` first.

   **Installed 2026-09-02 night**, with the owner's go-ahead. The swap went
   through cleanly — see "The package is installed and the swap is verified"
   below. Note the desktop entry, not PATH, was the real conflict: PATH already
   put `/usr/bin` ahead of `~/.local/bin`, but the manual `.desktop` hardcoded
   an absolute `Exec=/home/lonefox/.local/bin/...`, so the launcher would have
   kept running the old binary until that file was deleted.

   ### Three Wayland no-ops — the app cannot fix these, only Hyprland can

   `always_on_top`, `skip_taskbar` and **`set_position`** are all silent
   no-ops under Wayland. `presence.rs` (`corner_position` → `set_position`)
   and `toast.rs` genuinely ask for their corners; Wayland ignores them and
   Hyprland centres the windows over the game. This is why the "RUNNING"
   badge sat mid-screen.

   Fixed in `~/.config/hypr/looknfeel.lua` (machine-local, **not in git** —
   backup `looknfeel.lua.bak.1788347656`), and shipped as data in
   `packaging/arch/hypr/filthy-net-deck.lua`.

   ⚠️ **Hyprland positions with `monitor_w`/`monitor_h` arithmetic, never
   percentages.** `move = "100%-360 16"` is silently discarded — no
   `hyprctl configerrors` warning — and the window falls back to centred.
   That cost a round trip. Correct: `move = "monitor_w-360 16"`.
   Canonical example: `/usr/share/hypr/hyprland.lua:354`.

   Verified by spawning throwaway windows titled exactly like the app's:
   alert landed `[840, 16]`, badge `[16, 694]`. Both exact.

   ### Verified working on this box

   - Arena through Proton, Detailed Logs **ON** (142 `GreToClientEvent`)
   - Match parsed correctly: Ladder Bo1, loss, Mono Red Dragons, Platinum 3,
     opponent Vaccaria, 12 cards seen
   - Signing keys present at `~/.tauri/`, pubkey **matches** `tauri.conf.json`
   - `omarchy update` runs `omarchy-update-aur-pkgs`, so AUR packages are
     covered by it — the chosen Settings wording is literally accurate
   - Updater on Linux **degrades safely**: a missing platform key returns
     `Error::TargetNotFound`, so `check()` throws and
     `resolveUpdateOffer` falls to the version.json path with
     `canAutoInstall: false`. It will NOT wrongly say "up to date".
     (This resolves workflow-doc item 6, previously untested.)

   ### Done later that night — items 1, 2, 3 and the CI blocker in 7

   Three commits on `main`, **not pushed** (owner is holding the whole Linux
   release together). `npx tsc --noEmit` · `npx eslint src pipeline
   --max-warnings 0` · **786/786** all clean.

   **The update-route bug was never Linux-only.** `updater/latest.json`
   publishes only `windows-x86_64`, so the signed check throws on macOS *and*
   Linux and both fall through to `version.json`'s single `downloadUrl` — the
   Windows `.exe`. The `.dmg` sniff at `Settings.tsx:1333` could never fire,
   because no `.dmg` URL ever reached it.

   It is **dormant, not live**: live 3.4.0 == installed 3.4.0, so `isNewer` is
   false and nothing is offered. **It fires the moment a newer version is
   published** — that is the release-day trap, so do not publish 3.4.1 with
   this unfixed.

   Shipping the map alone does not save existing macOS users: their build
   predates it and reads the bare field. Serving them correctly from the server
   was checked and rejected — `/version.json` is a static file, the Netlify
   function that could vary on User-Agent is deliberately not routed
   (`website/netlify.toml:18`), and the update path is the wrong place to start
   varying a manifest by UA. So:

   - `version.json` gained a `downloads` map; `pickDownloadUrl` reads this OS's
     entry (`versionCheck.ts`, unit-tested).
   - The bare `downloadUrl` is now **the download page**, not any one
     platform's installer — correct on all three instead of correct on one.
   - **Linux has no entry by design**, so no download button can appear.
     Settings shows version + notes + *"FND is installed through your package
     manager. To update: `omarchy update`"*, as the owner picked.
   - `scripts/bump-version.mjs` writes the map too, so the next bump cannot
     silently undo any of it.
   - Linux now counts as `linux` in the `/version.json` install gauge instead
     of sitting with the bots under "other".

   New `src/services/platform.ts` (`detectOs` / `updatesViaPackageManager`) is
   the one place that sniffs the OS; `healthPing.ts` lost its private copy.

   ### The package is installed and the swap is verified

   pacman owns all six files; `filthy-net-deck` on PATH is `/usr/bin`; the
   manual `~/.local/bin` binary and its `.desktop` are **gone**; `fnd://`
   resolves to the packaged entry; no missing libs. App data survived intact —
   `auth.json` (still signed in), `install-id`, `tracker-matches.jsonl`. Owner
   launched it from the app launcher: **works**.

   Rebuild note: the binary was rebuilt `--no-bundle` first, per the appimage
   warning above. Build + package is still ~1 min total.

   ### Soundscape was silent on Linux — missing codec, not app code

   Owner reported the Soundscape doing nothing. **`autoaudiosink` does not
   exist on a stock Omarchy box.** It lives in `gst-plugins-good`, which
   `webkit2gtk-4.1` only lists as an *optdep*, and WebKitGTK routes all Web
   Audio through it. Every cue is synthesized correctly and written to a sink
   that is not there — no error, no console warning, pure silence. `sfx.ts` is
   fine; do not debug it.

   Fixed in the PKGBUILD: `gst-plugins-good` is now a hard **depend**.
   `gst-libav` + `gst-plugins-bad` added as optdepends for set-trailer
   playback (`TrailerPlayer.tsx` embeds a YouTube iframe, which needs H.264).

   **Confirmed:** owner installed the three packages, restarted, and the
   soundscape plays. Root cause proven, not inferred.

   ⚠️ **Suspect the same class of bug for anything media-shaped on Linux.**
   webkit2gtk's optdeps are exactly the features that fail silently.

   How it actually went missing on this box, from `/var/log/pacman.log`:

   ```
   12:16:55  installed gst-plugins-good
   14:49:54  pacman -Rns orca ada simdjson nodejs-lts-iron
   14:49:59  removed gst-plugins-good        ← swept as an orphan
   ```

   `-Rns` recursed through orca's dependency tree and took gst-plugins-good
   with it, because **nothing held a hard dependency on it** — an optdepend
   does not protect a package from `-Rns`. That is the exact hole the PKGBUILD
   change closes: as a hard `depends` of `filthy-net-deck-bin`, pacman would
   have refused the removal.

   ### WebKitWebProcess SIGABRT on shutdown — upstream, cosmetic, do not chase

   Separate from everything above, and **not** the 19:04 pattern (which was the
   child dying with its aborting parent). Core `28057`, 2026-09-02 22:25:58,
   SIGABRT. Crashing thread bottom-up:

   ```
   #14 main → #13 __libc_start_main → #11 exit    ← already shutting down
   #10 __run_exit_handlers
   #9  libEGL_mesa.so.0                            ← Mesa atexit handler
   #8  drmFreeDevice (libdrm)
   #7..#3 libc malloc internals → #2 abort         ← glibc caught a bad free
   ```

   The process was inside `exit()`; it aborted while cleaning up, not while
   doing work. Thread 28135 shows the race — `__call_tls_dtors` →
   libwebkit2gtk → libEGL_mesa — so WebKit tears down its EGL display in a TLS
   destructor while Mesa's exit handler frees the same DRM device on the main
   thread. Double free, glibc aborts.

   Ruled out: no OOM (12Gi available), nothing in the journal for that window,
   and mesa / libdrm / webkit2gtk-4.1 were all last installed 2026-08-29 — no
   recent update to blame. **The parent `filthy-net-deck` did not crash**: no
   core for it at 22:26 and the window was still up at 22:27. It was the old
   instance exiting on restart.

   Upstream Mesa/WebKit, nothing for FND to fix, no data at risk. Expect it to
   recur on webview teardown; the desktop notification is the only symptom.
   `WEBKIT_DISABLE_DMABUF_RENDERER=1` avoids the EGL path but costs rendering
   performance — not worth trading for a cosmetic notification.

   ### Test suite — FIXED, 786/786 on this box

   The previous entry's diagnosis was wrong: vitest already defaults jsdom to
   `http://localhost:3000`, **not** `about:blank`, so the origin was never
   opaque and `environmentOptions.jsdom.url` fixes nothing.

   Real cause: **Node 26 ships experimental Web Storage**, so `localStorage` is
   a property of Node's own `globalThis` — an accessor that warns and returns
   undefined without `--localstorage-file`. Vitest's jsdom environment copies
   window properties onto that same globalThis but **skips any name already
   present there** unless it is in its hardcoded KEYS list, and `localStorage`
   is not in it (it never had to be). Node's dud accessor wins.

   Fix: `src/test/setupJsdomStorage.ts` re-points both Storage globals at the
   real jsdom window, which is still reachable as `globalThis.jsdom.window`.
   No-ops outside jsdom. This was the stated precondition for Linux CI.

   ### What's left — superseded 2026-09-03 afternoon

   Owner verified in-game and told Grok to ship. The live checklist is the
   **START HERE ship brief** at the top of this file (commit dirty tree →
   version bump with owner → Windows NSIS → Linux pkgver → AUR before site
   copy → macOS dmg roll → Netlify). Do not use this older numbered list;
   several items in it are stale (cog-menu "unverified", macOS `.exe` fix
   "unshipped" — that fix is already on origin as `42f23765`/`f873c3fb`).

   ### 2026-09-03 Linux parity audit (while owner at school run)

   Fixed in the working tree + live Hyprland config:

   - Overlay click-through on a hidden GTK window would abort the process
     the same way toast did. Guarded; applied after `show()`.
   - Proton `Player.log` now follows Steam `libraryfolders.vdf` extra
     libraries, not only `~/.local/share/Steam`.
   - HUD overlay + match-end alert now follow Arena onto
     `special:scratchpad` and raise above Proton (same script as the badge).
   - Linux Rust CI job added so Proton cfg actually compiles.
   - Presence cog is its own window (earlier this session).

   Local 3.4.0 package at `/tmp/fnd-arch-build/` **was** installed (10:11
   overlay-extent, then 10:28 hide-not-destroy). `/usr/bin/filthy-net-deck`
   mtime 2026-09-03 10:28:53. Rebuild after the version bump; do not
   reinstall 3.4.0-1 over a bumped tree.

   Left on purpose / still not Windows-identical:

   - Overlay drag-persist: Wayland `set_position` is a no-op, so saved HUD
     geometry cannot restore; we dock to Arena's top-left each map.
   - GTK/WebKit minimum ~200×200 on the badge — compositor clips; click-steal
     from leftover transparent pixels if clip fails.
   - Overlay click-through itself is still a GTK maybe: we no longer crash,
     but Wayland may not punch clicks through to Arena.
   - Autostart ("Start with PC") not play-tested on Omarchy/uwsm.
   - Fonts: Selawik+Cascadia are user-local, not packaged (Selawik is not in
     extra). Cascadia is now a PKGBUILD optdepend.
   - `always_on_top` / `skip_taskbar` remain Wayland no-ops; Hyprland rules
     cover them.
   - WebKitWebProcess SIGABRT on shutdown: upstream, cosmetic.
   - Overlay latent click-through if `overlayClickThrough=true` *and* the
     window is hidden is fixed in the 10:28 binary (Linux also hides the
     Settings toggle).

   ### Trap that cost real time — `sync.ts` is invisible to grep

   `src/services/cloud/sync.ts` contains **literal control bytes** (NUL and
   0x1F) at line 604, inside a display-name validation regex. `file` reports
   it as `data`, and plain `grep` returns **exit 1, no output** — a silent
   false negative on a 700-line core file, not even a "binary file matches"
   notice. Use `grep -a` or ripgrep. Worth fixing with escape sequences.

   ### Machine-local, outside git — survives reboot, but nothing backs it up

   - `~/.config/hypr/looknfeel.lua` — FND window rules (overlay/alert/badge)
   - `~/.config/fontconfig/conf.d/60-filthy-net-deck.conf` — Selawik for
     Segoe UI, real Cascadia Code. Do not remove; `--font-mono` silently
     becomes proportional without it.
   - ~~`~/.local/bin/filthy-net-deck` + its `.desktop`~~ — **removed.** The
     pacman package owns `/usr/bin/filthy-net-deck` now.
   - `~/.tauri/` — signing keys
   - `~/.config/systemd/user/omarchy-crash-watch.service.d/ignore-webkit.conf`
     — mutes Omarchy's "Process crashed: WebKitWebProcess" banner. Machine
     local on purpose.

   Owner's app prefs of note: `fullscreen = true` (so the Hyprland
   1160x690 size rule is correctly moot), `defaultPage = daily`,
   `notifyMatchEnd = true`, `overlayClickThrough = false`.

1. **Handed back to Claude. Grok is done. Full v3.4.0 deploy pipeline is live.**
   *(Historical — 2026-09-02 Windows box wrap. Today's job is entry 0 at the top.)*

   **Picked up by: Claude.** Owner is routing the next question to Claude
   (Omarchy installation — not specified here; wait for the owner to ask).
   Grok finished the release on the Windows box and is **not** continuing.

   ### ▶ If you are the agent on the OMARCHY box, start here

   Read **`docs/TWO-MACHINE-WORKFLOW.md`** and work through it *with the owner*.

   It is seven open questions about maintaining FND from two operating systems,
   written by Claude on the Windows box on 2026-09-02. **It is explicitly NOT a
   list of facts** — the owner has already said parts of it are wrong (notably
   item 1: they have already produced Tauri/NSIS Windows builds from Linux).
   Each item carries a confidence level and a command to check it. Verify, then
   decide with the owner, then edit the file in place and delete what is
   resolved. Fold anything durable into `AGENTS.md` and delete the file.

   The one item I would not skip is **item 2**: `ci.yml` runs its Rust job on
   `windows-latest` only, so the `#[cfg(target_os = "linux")]` Proton log code
   is compiled by no CI job at all.

   Owner message, 2026-09-02, to transmit verbatim in intent:

   - Grok is done. Great work, stop.
   - The **full deploy pipeline is complete** — do not rebuild, re-sign, or
     re-tag v3.4.0.
   - Owner is **running the round-trip test now** on Windows (Check for
     updates → Update & restart, then cloud toggle on, then upload). They
     will **report the result back to Claude**, including what happens after
     the update and the match upload.
   - Owner also has **something to ask Claude about the Omarchy installation**.
     That is the next product question. Do not invent work while waiting.

   HEAD at handoff: `89bb78c` *docs: verify v3.4.0 live on Netlify*
   (this wrap is the next commit). Tag `v3.4.0`. `main` == `origin/main`
   after this push — **pull on Omarchy before doing anything**, the old
   `08f2c72` hash is gone (rebased).

   | Thing | State |
   |---|---|
   | Supabase migration | ✅ applied to the live project by the owner 2026-09-02 |
   | Source + version bump to 3.4.0 | ✅ `7a12d4f` (rebased onto origin; i18n homepage underneath) |
   | Site copy, OG card, version.json ×2 | ✅ live |
   | Homepage i18n (`sync.title` / `sync.body` in 7 catalogs) | ✅ live; `es.json` serves `Dos PCs, un historial` |
   | Signed Windows build | ✅ NSIS 7,882,406 bytes, updater `.sig` 428 bytes |
   | Live `/downloads/Filthy-Net-Deck-Setup-3.4.0.exe` | ✅ 200, 7,882,406 bytes, both hosts |
   | Live `/updater/latest.json` | ✅ 3.4.0, signature matches the `.sig` file verbatim |
   | Pushed / tagged | ✅ `origin/main` + tag `v3.4.0` |
   | macOS CI | ✅ run 33611379291, 9m36s, dmg attached to the GH Release |
   | macOS dmg on the homepage | ✅ live 200, 22,772,864 bytes, both hosts. sha256 `5b6ae26b…3c39e0` |
   | In-app Update & restart | ⏳ **owner is doing this now** on the Windows 3.3.1 install |
   | Cross-device round trip against live Supabase | ⏳ **owner is doing this now** — report comes back to Claude |

   ### ⚠️ Do not treat an empty Omarchy Stats page as a regression yet

   The authenticated round trip has still never been observed. Tests cover
   merge / parser / deck rebuild / privacy allowlist / homepage keys —
   **778 passing**, 94 files. The table is live (exists, denies anon with
   `42501` like `shared_matches`). What has *not* been proven is a signed-in
   3.4.0 client uploading and a second machine restoring.

   **Order the owner is following — empty restore first looks like the
   original bug:**
   1. Windows: Check for updates → Update & restart (or install 3.4.0).
   2. Cloud toggle **on**. Upload is background, **capped at 500 matches
      per launch** — a long history may need two launches.
   3. *Then* Omarchy sign-in. History and deck library should appear.

   Owner will tell Claude what actually happened. Until that report, do not
   start a "sync is still broken" investigation.

   ### What Claude should do

   1. **Wait for the owner.** First question is the Omarchy installation.
      Second is the round-trip report. Do not invent work. Do not bump.
   2. Pull `origin/main` on Omarchy before building or installing anything
      there — this wrap exists so that clone can see the live 3.4.0 state.
   3. Do not undo the three design calls in § below without reading
      `docs/BACKEND-PHASE-2.md` §9.

   ### What v3.4.0 actually is

   Owner moved between the two boxes, signed in, and found an empty Stats page.
   **Not a regression — the download half of sync was never built.**
   `shared_matches` had one upsert and one delete in the whole client and *no
   select*; uploads have worked since v2.7.6 and nothing ever read them back.
   Decks were empty for the same root cause: a deck is match history grouped by
   list, and cloud decks only ever filled gaps in matches you already had locally.

   New `match_backup` table — **not** a widening of `shared_matches`, which is
   Standard/Pioneer-only and drops the queue, deck name and per-game detail.
   Full post-mortem and every design call: **`docs/BACKEND-PHASE-2.md` §9.**

   Three things not to undo without reading that section first:

   - **Opponent fields are absent from the backup by choice** (`opponentName`,
     `opponentSeen`, `opponentBasics`, `opponentPlatform`). Owner was offered the
     fidelity trade and kept the rule. Restored matches show your side only, and
     the UI says so.
   - **`match_backup.match_id` is a salted sha256, not Arena's id** — privacy.html
     §3 claims that unconditionally. Consequence: a restored match carries the
     digest as its `matchId`, so the client hashes its **local** ids before asking
     "do I have this one?". Remove that and every machine restores its own backup
     and doubles its history.
   - **`trackerMatches` is now derived** from `trackerLocal` + `restoredMatches`.
     The 12s poll compares against `trackerLocal` or it re-sets forever, and
     `onStatus` counts `trackerLocal` against Rust's `matchesRecorded` or every
     status event fires a full re-pull.

   ### Verified on Windows this session

   - Source rebased onto `origin/main` (i18n homepage + radar). Conflicts were
     `handoff.md` and `website/index.html` only — kept origin's `data-i18n`
     markup and bumped the version spans to 3.4.0. New keys `sync.title` /
     `sync.body` added to all seven catalogs.
   - `npx tsc --noEmit` · `npx eslint src pipeline --max-warnings 0` ·
     `cargo clippy --all-targets -- -D warnings` · `npm run build` — all clean
     (from the source session)
   - `npm test` after rebase → 94 files, **778 tests pass** (755 + 23 site i18n)
   - Signed `npm run tauri:build` on Windows: NSIS + updater `.sig` written.
     `latest.json` signature equals the `.sig` file verbatim.
   - OG card regenerated and eyeballed: badge reads `NEW · v3.4.0 · CROSS-DEVICE SYNC`
   - Both website pages re-parsed in a browser — new privacy field table (10 rows)
     and the new homepage card both land in the right place
   - `AGENTS.md` payload rule discharged: README + index.html + privacy.html all
     updated, `PRIVACY_LASTMOD` bumped to 2026-09-02. Also fixed an orphaned
     `| Friend codes |` row in README that had escaped its table.

1a. **2026-09-01 (night) — Linux/Omarchy box made to look like Windows.
    IN PROGRESS. Resume here in the morning.**

    Owner's ask: *"perfect the Linux version on my machine — look and feel
    exactly as it would on Windows."* Explicitly **local-only**: not shipped,
    not marketed, no version bump, no installer, no updater. Linux stays off
    the marketing site. v3.3.1 remains live and correct.

    ### ⛔ FIRST THING TOMORROW — the overlay is blocked on an Arena toggle

    **Arena's Detailed Logs are OFF in the Proton prefix.** Confirmed, not
    suspected (the old note in §3 guessed; this is measured):

    ```
    Player.log:35   DETAILED LOGS: DISABLED
    GreToClientEvent / MatchGameRoomStateChangedEvent /
    ClientToMatchServiceMessage / GameStateMessage   → 0 occurrences
    ```

    Log: `~/.local/share/Steam/steamapps/compatdata/2141910/pfx/drive_c/users/steamuser/AppData/LocalLow/Wizards Of The Coast/MTGA/Player.log`

    The overlay only ever appears via `show_for_match()`, which needs a parsed
    match start. There is **no preview/test affordance** — the tray only has an
    enable/disable check item. So until this is on, the in-game HUD cannot be
    seen at all on this box.

    **Owner action (inside Arena, agent cannot do it):** Options → Account →
    **Detailed Logs (Plugin Support)** → restart Arena → play one ranked game.
    Then the live-overlay checks below can finally run.

    ### Done and verified this session

    1. **Fonts — the big one.** The app asks for `"Segoe UI"` and
       `"Cascadia Code"`. Neither exists on Linux, and **fontconfig never
       fails a lookup**, so it answered *both* with Liberation Sans and the
       later entries in each CSS stack were never consulted. Measured proof:
       the mono and sans stacks returned byte-identical widths (88.98px).
       Practical damage: `--font-mono` resolved to a **proportional** face, so
       `.card-list` decklists and `.overlay-clock` lost column alignment.
       Fixed **outside the repo** (see the machine-local inventory in §3).

    2. **`user-select` was being discarded.** WebKitGTK 2.52 only understands
       `-webkit-user-select` and drops the unprefixed property at parse time.
       So `body { user-select: none }` never applied — the whole app was
       drag-selectable like a web page — and `.friend-code { user-select: all }`
       (click-to-select the code) was dead. **This is the only repo change.**

    3. **The window — this was the visible "hot mess".** Hyprland tiled the
       main window into a half-screen column (581×700), ignoring Tauri's
       1280×860 request and its declared 960px minimum. Below that minimum the
       layout collapses: Set Radar wraps into overlapping text, a horizontal
       scrollbar appears, the sidebar eats half the width. Fixed with a
       Hyprland rule (float + centre + 1160×690).

    4. **Overlay rendering already matches Windows.** Rendered the real route
       (`/?demo#/overlay`, and `&phase=ended`) in WebKitGTK vs Chromium: live
       HUD and post-match summary match. Transparency verified by replicating
       what Tauri's `transparent: true` does on Linux (RGBA visual +
       transparent webview background) — composites cleanly, rounded corners
       and border glow intact, no console errors. The HUD clock was fixed by
       the font work above.

    ### Two traps — do not re-walk these

    - **`GDK_SCALE=2` is a red herring.** `~/.config/hypr/monitors.lua` sets it
      deliberately (GTK 3 has no fractional scaling) against a 1.6 monitor
      scale. I assumed the webview laid out at the GTK scale and added an
      `FND_UI_ZOOM` lever in `src-tauri/` to compensate. **Measuring the live
      window against a known-width render disproved it** — WebKitGTK 2.52
      honours the 1.6 fractional scale, so the zoom made text ~28% too small.
      **The Rust change was fully reverted; `src-tauri/` is untouched.** Do not
      reintroduce it. CSS px == Hyprland logical px on this box.
    - **A short snapshot settle looks like a missing feature.** The "Land n%"
      chip appeared absent in WebKitGTK at a 6s settle and looked like a real
      bug; at 14s it renders identically to Chromium. Wait ~12s+ before judging
      the HUD.

    ### Verified NON-issues — don't spend time here

    WebKitGTK 2.52 supports `backdrop-filter` (unprefixed), `color-mix`,
    `:has()`, `aspect-ratio`, `position: sticky`, `oklch`, `text-wrap`,
    `content-visibility`, `appearance`, `::-webkit-scrollbar`, `color-scheme`.
    Probed directly with `CSS.supports` in the app's own engine.

    ### Still unverified — needs the live match

    All window-manager behaviour, not rendering:
    - always-on-top over Arena · click-through (`set_ignore_cursor_events`)
    - auto-hide at match end · companion surviving Arena quit
    - first-match chooser inside the real overlay webview
    - Proton process-name vs `MTGA.exe` path (badge / HUD show)

    **Wayland caveats to expect:** Tauri's `always_on_top` and `skip_taskbar`
    are **no-ops on Wayland** — no protocol lets a client raise itself.
    Hyprland's `pin` (already in the rule) is the on-top equivalent.
    Exclusive-fullscreen Arena will still cover the HUD: **borderless
    windowed is required.** The Omarchy bar may list the HUD as a window.

    ### Repo state — uncommitted, nothing pushed

    ```
     M src/index.css      # +5 lines: -webkit-user-select aliases
    ```

    `npx tsc --noEmit` clean. **Pre-existing, NOT caused by this work:**
    19 tests fail in `arenaCards.test.ts` / `arenaMeta.test.ts` —
    `localStorage` is undefined (jsdom environment). Confirmed identical with
    the CSS change stashed. §0 records 723/723 passing on Windows (node
    24.13.1); this box is node 26.7.0 / jsdom 29, and the suite is now 746
    tests, so this arrived with newer tests or the newer toolchain. Worth a
    look, but it is not from the Linux work.

    ### Known cosmetic gap, deliberately left

    `.friend-code`, `.settings-kbd` and `.clinic-paste-input` lead their stack
    with `ui-monospace`, which WebKit maps to its default fixed font (JetBrains
    Mono) while Windows gets Cascadia Code. Monospace either way — a different
    face in three small places. Fixing it means touching shared CSS for a
    cosmetic difference; owner has not asked.

    ### Rebuild + reinstall the local binary

    ```bash
    npm run tauri:build -- --no-bundle
    install -m755 src-tauri/target/release/filthy-net-deck ~/.local/bin/filthy-net-deck
    ```

    ⚠️ Kill the running app **before** `install` — overwriting the binary under
    a live process segfaults its `WebKitWebProcess` and fires an Omarchy
    "Process crashed" notification. That is the install cycle, **not an app
    bug**: a graceful quit produces no core dump (verified, dump count
    unchanged). Use `pkill -x filthy-net-deck` — a `pkill -f` pattern that
    matches the agent's own command line kills the shell (exit 144).

2. **2026-09-01 (later) — Windows box brought up to date. No product change.**

   The owner's **Windows** machine was 33 commits behind on v3.2.0 while the
   site served v3.3.1. Fast-forwarded to `5baca63`; `main` == `origin/main`.
   **Nothing was built, bumped, signed or released.** v3.3.1 stays live and
   correct. This entry is a machine-sync record, not a release.

   Verified on Windows after the pull:
   - `npx tsc --noEmit` clean · `npm test` → 92 files, **723 tests, all pass**
   - node 24.13.1 · npm 11.8.0 · cargo + rustc 1.96.1 all on PATH
   - no `npm install` needed — the only dependency diff was the version string

   ### ⚠️ A local-only stash on the Windows box — will NOT reach this file's readers
   That working tree had **uncommitted v3.2.0-era `handoff.md` notes** (the
   "REMIND THE OWNER" block) which collided with this file on pull. They were
   stashed, not discarded: `stash@{0}`, message begins "v3.2.0-era handoff.md
   notes". **A stash is local — it is invisible from the Linux box and dies
   with that clone.** Everything still-live from it is transcribed here, so the
   stash is safe to drop.

   Four of its five parked items already survive in this file (cleanup SQL,
   untracked-format game, key rotation, OG card). The fifth did not:

   **Lost: the X format poll.** The draft lived in `x-post-v3.2.0.md`, which
   was never committed and no longer exists in any tree — **the option text is
   not recoverable.** What survives of the intent: it was deliberately held
   back a couple of days after the 2026-08-27 launch post so the two would not
   compete for engagement, and it must **keep a "Keep it focused — no" opt-out
   option, because without one the result is not a mandate.** Rewrite from
   scratch if the owner still wants it.

   ### Drafted this session, NOT posted — owner posts, no agent posts
   X post announcing the v3.3.0 languages. 220/280 X-weighted chars (ja/ko
   count double):

   > Eight languages. Done properly.
   >
   > English · Español · Français · Deutsch · Italiano · Português (BR) · 日本語 · 한국어
   >
   > Exactly the lineup Arena ships. FND follows your system language on its own.
   >
   > filthy-net-deck.com

   Suggested honest reply in-thread — coverage is **336 of 341 strings**; long
   Help bodies, some Settings and Climb/Stats copy are still English, and the
   marketing site is not translated at all:

   > Honest note: the app is ~98% translated. A few long Help pages and some
   > Stats copy are still English, and the site itself isn't translated yet.
   > Working on it — tell me if you hit a rough edge in your language.

   ⚠️ **Accuracy note for any future i18n copy:** the app follows the
   **OS/system** language — `detectSystemLocale()` reads `navigator.languages`
   — **not** the Arena client. The eight-language *lineup* matches Arena's
   client languages; the detection does not. Do not write "follows your Arena
   client". Settings can also lock a catalog instead of following the system.

   Next session: wait for the owner. Do not invent work. Do not bump.

3. **Marketing site is multi-language. LIVE 2026-09-01. No version bump.**

   Shipped and verified on production. Next session: wait for the owner.
   Do not invent work. Do not bump. Do not re-translate.

   Owner asked for the homepage to follow the app's Arena locales. Site
   only — **no app change, no installer, no updater, no version bump.**
   `website/` is served straight from `main`, so the push published it.
   Source `d96b7411`, accuracy fix `9f5397c0`.

   Same eight locales as the app (`src/i18n/locales.ts`): en, es, fr, de,
   it, pt-BR, ja, ko. A discreet globe pill in the nav, between Suggest /
   Report and Download, opens a menu of native names.

   How it works — **English is not a catalog.** The English copy stays
   inline in `website/index.html`, which remains the hand-edited master;
   `website/i18n/i18n.js` snapshots it on boot and uses it as the fallback
   for every missing key. So editing English copy is still a one-file
   change, and a half-translated catalog degrades per string.

   - `data-i18n="key"` → innerHTML · `data-i18n-label` → aria-label ·
     `data-i18n-title` → title. 114 keys.
   - `website/i18n/<locale>.json` — one per non-English locale.
   - First visit follows `navigator.languages` (same folding as the app:
     `pt`/`pt-PT` → pt-BR, any `es-*` → es, unknown → en) and is **not**
     persisted. Choosing from the menu persists to
     `localStorage["fnd.site.locale"]` and wins from then on.
   - `<head>` starts the catalog fetch during parse so a non-English
     visitor does not get a flash of English.

   **Untranslated on purpose** (same policy as the app): card names, deck
   names, Bo1/Bo3, Standard/Pioneer, the version string, download hrefs.

   **The version is not in the catalogs.** `page.title` writes `{version}`
   and the runtime substitutes it from the English `<title>` — so the
   release checklist keeps bumping the version in `index.html` only, and
   it cannot go stale in seven translated copies.

   Guard: `pipeline/site-i18n.test.mjs` (23 tests) fails if a key is added
   or renamed in `index.html` without every catalog following, if a
   catalog carries a stale key, or if a version literal lands in a title.
   **A new `data-i18n` key without eight catalog entries is a red CI.**

   Verified headless (Chromium via playwright, `/usr/bin/chromium`) across
   all eight locales: auto-detect, toggle, persistence across reload,
   fallback to English when a catalog 404s, no console errors, and nav
   fitting at 320–1280px in the longest-label locales.

   Layout changes this needed: CJK hero sizing (`汚くネットデッキ。` was
   breaking mid-word), and the nav gap tightened at ≤700px with
   Suggest / Report dropped at ≤560px — the language pill costs ~55px in
   a nav that previously fitted 390px exactly.

   Not translated: `privacy.html`, `feedback.html`, `status.html`,
   `meta-web/`. `privacy.html` is deliberate — AGENTS.md binds it to the
   real upload allowlist, and seven more copies is seven more places for
   the payload description to drift. `feedback.html` is the one an owner
   might want next: a non-English visitor clicking Suggest / Report from
   the nav lands on an English page.

   ### Verified live 2026-09-01 (production, not localhost)
   - `/i18n/{es,fr,de,it,pt-BR,ja,ko}.json` → 200, `application/json`
   - `/i18n/i18n.js` → 200; homepage carries 111 `data-i18n` attributes,
     `#lang-switch`, and the `__fndI18nReq` head preflight
   - all 8 locales auto-detect on `https://filthy-net-deck.com/`
     (incl. `pt-PT` folding to pt-BR), toggle switches, choice persists
     across reload, no console errors
   - translated `<title>` keeps `v3.3.1` via the `{version}` placeholder
   - Bo1 / Standard / card names still untranslated; Windows download
     href unchanged
   - `version.json` and `updater/latest.json` still `3.3.1` — this
     release touched **no** app channel

   ### The one correction worth remembering
   The feature card said "the in-app UI follows Arena". It does not —
   `detectSystemLocale()` reads `navigator.languages`, so the app follows
   the **OS**; only the eight-language lineup is Arena's. The claim
   predated this work in English but had just been translated seven times,
   so it was about to ship wrong in eight languages. Fixed in `9f5397c0`.
   This is exactly what the ⚠️ note in item 0 was warning about — read it
   before writing any new i18n copy.

   ### Pre-existing, NOT caused by this work
   `npm test` is red on `main`: 19 failures in
   `src/services/arenaCards.test.ts` and `arenaMeta.test.ts`. Confirmed by
   stashing — they fail at `02d921fc` too. Cause is one line each: both
   use `localStorage` but the files lack the
   `// @vitest-environment jsdom` pragma that `vitest.config.ts` expects
   (`environment: "node"` by default). Not fixed — out of scope for a
   marketing-site change, and it is the owner's call whether the fix is
   the pragma or moving the storage behind a guard.

4. **v3.3.1 is live. 2026-09-01 session wrapped. Do not rebuild.**

   Owner confirmed end-to-end and will tell the friend to Check for
   updates. Next session: wait for the owner. Do not invent work.
   Do not bump.

   This session: two friend-reported regressions + the CI mail they
   caused. Source `20fde374`, Windows NSIS + updater in that commit,
   macOS dmg rolled `08c4152c`, clippy gate `16f54031`.

   1. **Arena import of rooms.** `4 Unholy Annex` is rejected; Arena
      wants `4 Unholy Annex // Ritual Chamber`. v0.23.0 stripped every
      ` // ` name — right for MDFCs/adventures, **wrong for rooms**
      (Scryfall `layout: split`, same as Fire // Ice). Keep both faces
      for split/rooms; still strip adventure / transform / modal_dfc.
   2. **`Card 81181` in the overlay.** Unfinity Swamp (Adam Paquette).
      `/cards/arena/81181` 404s; UNF is 2022 so the 180-day gap window
      never saw it. Evergreen `unf` + a sweep of every unlinked basic
      land. 81181 publishes as Swamp with art.
   3. **GitHub "Run failed: CI - main" mail.** Windows clippy `-D warnings`
      treated the Linux-only Proton helper as dead code, so every main
      push after `9148c48f` emailed the owner. Gated to Linux + `cfg(test)`.
      Latest CI on `main` is green (`16f54031`).

   Verified live 2026-09-01:
   - `https://filthy-net-deck.com/version.json` → `3.3.1`
   - `https://filthy-net-deck.com/updater/latest.json` → `3.3.1` (sig 428 bytes)
   - Setup-3.3.1.exe → 200, 7 850 500 bytes
   - Filthy-Net-Deck-3.3.1-universal.dmg → 200, 22 666 785 bytes
     (sha256 `8250f59f…934a0`, GH Release + Netlify)
   - homepage buttons + `og-image.png?v=3.3.1`
   - `meta/arena-names.json` 1602 grpIds; `81181` is Swamp
   - Mono-Black Demons import is `4 Unholy Annex // Ritual Chamber`
   - downloads = current + 1 (3.3.1 + 3.3.0, Windows and dmg)

   Friend path: in-app **Check for updates → Update & restart**. Overlay
   names for Unfinity basics already work on 3.3.0 via the live gap map;
   in-app Arena import of rooms needs 3.3.1.

   Do **not** sneak in: silent autostart-on · extra nav items · ripping
   out the library tracker · flipping overlay default · rotating the
   signing key in the same commit as a release.
   (“Translating the marketing site” left this list on 2026-09-01 — the
   owner asked for it; see item 0b.)

   Owner leftovers (not blockers):
   1. In-app **Check for updates** on an installed 3.2.0 — *Update & restart*.
   2. Link-share preview of the OG card (`?v=3.3.1`).
   3. Reply to Shane — draft below still refers to 3.2.0 deck-library;
      edit if sending now (3.3.1 is rooms import + Unfinity basics).
   4. **Rotate the signing key** when convenient (passphrase was pasted
      into a chat transcript on 2026-08-27). Key id `67FCA9900F523D49`.

5. **v3.3.0 is live. 2026-09-01 session wrapped. Historical.**

   Owner confirmed the Linux white-`<select>` fix looks perfect and will
   keep testing. Next session: wait for the owner. Do not invent work.
   Do not bump.

   This session (`21f10a42`): WebKitGTK was painting Adwaita-light native
   combos under foam text because the dark page never declared
   `color-scheme: dark`. Opted the page into dark/light, stripped native
   appearance, painted every `<select>` with tokens + chevron. Rebuilt
   and installed over `~/.local/bin/filthy-net-deck`. No version bump —
   Linux is not marketed. Windows/macOS still 3.3.0 until the next cut
   (the CSS will ride along then).

   Owner leftovers unchanged (not blockers): Check for updates on an
   installed 3.2.0; OG share preview `?v=3.3.0`; Shane reply; rotate
   signing key `67FCA9900F523D49`.

6. **v3.3.0 was shipped 2026-08-31. Historical. Do not rebuild.**

   Shipped this session: overlay companion + quiet HUD + autostart ask +
   Arena-language i18n (source `30308a45`, installers `aa26eefc`). Signed
   NSIS from this Linux box; macOS dmg rolled from the GH Release. Linux
   local install for owner testing (`9148c48f`) — not marketed.

   Next session: wait for the owner. Do not invent work. Do not bump.

   Verified 2026-08-31 after `aa26eefc` Netlify deploy:
   - `https://filthy-net-deck.com/version.json` → `3.3.0`
   - `https://filthy-net-deck.com/updater/latest.json` → `3.3.0` (sig 428 bytes matches the `.sig`)
   - Setup-3.3.0.exe → 200, 7 804 141 bytes
   - Filthy-Net-Deck-3.3.0-universal.dmg → 200, 22 583 281 bytes
     (sha256 `5b36f7c9…70f0`, GH Release + Netlify)
   - homepage buttons + `og-image.png?v=3.3.0` (no leftover 3.2.0 installer links)
   - downloads = current + 1 (3.3.0 + 3.2.0)

   Overlay companion + quiet HUD + autostart ask + Arena-language i18n
   shipped as **3.3.0**. Tag `v3.3.0` already exists (source cut). Do not
   bump. Do not rebuild the Windows NSIS unless the updater signature is
   wrong on the live `latest.json`.

   Ticket + implementation log:
   **`docs/FRIEND-FEEDBACK-OVERLAY-IA.md`**.

   ### What shipped
   - Overlay vs **companion window** — same webview, not a fourth renderer.
     Companion: not always-on-top, on the taskbar, opaque, close button,
     survives match end and Arena quit until the user closes it.
   - Quiet collapsed HUD: clock · turn · **session** W–L · **Land n%**
     (next-draw) · archetype + **confidence**. Lists stay behind ▾.
   - First overlay appearance: “HUD over Arena” vs “Normal window”.
     Default stays overlay.
   - Set Radar pulse persist-dismiss; Update **Later** persists;
     deck-to-beat `{format} meta · BO1`.
   - P2 autostart ask (one-shot after Help tour — not silent-on).
   - i18n: en, es, fr, de, it, pt-BR, ja, ko. Remaining English: long
     Help bodies, some Settings paragraphs, Climb/Stats inner copy.
     Marketing site translated separately on 2026-09-01 — item 0b.

   ### Signed Windows build on this Linux box (keep)
   Key id `67FCA9900F523D49` — `~/.tauri/filthy-net-deck.key` (copied from
   Temple 1TB `Users/Temple Lodge/.tauri/`, mode 600). Never commit it.
   Password file is `~/.tauri/filthy-net-deck-key-password.txt`.

   ```bash
   export PATH="$HOME/bin:/home/lonefox/tools/llvm-mingw/bin:$HOME/.cargo/bin:$PATH"
   export NSISDIR=/home/lonefox/tools/nsis/usr/share/nsis
   export XWIN_CACHE_DIR=$HOME/.xwin
   export TAURI_SIGNING_PRIVATE_KEY=$HOME/.tauri/filthy-net-deck.key
   export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(cat $HOME/.tauri/filthy-net-deck-key-password.txt)"
   npm run tauri:build -- --bundles nsis --runner cargo-xwin --target x86_64-pc-windows-msvc
   ```

   Output: `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/Filthy Net Deck_<ver>_x64-setup.exe` + `.sig`.
   Tauri will warn that **Authenticode** signing is Windows-only — ignore
   that; the updater minisign `.sig` is what `latest.json` needs.
   `~/bin/makensis` wraps the extracted NSIS 3.08 and sets `NSISDIR`.

   ### Linux local install (this Omarchy box — not marketed)

   Arena is on Steam Proton (app 2141910). The tracker now finds
   `Player.log` under the Proton prefix. Installed for the owner only:

   - binary: `~/.local/bin/filthy-net-deck` (rebuild: `npm run tauri:build -- --no-bundle` then `install` over that path)
   - launcher: `~/.local/share/applications/filthy-net-deck.desktop`
   - HUD Hyprland rule: overlay title float+pin in `~/.config/hypr/looknfeel.lua`
   - WebKitGTK native-select theming (`21f10a42`) is in this local binary.
     Owner confirmed Settings dropdowns 2026-09-01.

   #### Machine-local "look like Windows" setup — 2026-09-01 night, NOT in git

   None of this is version-controlled. It lives only on this box, so it dies
   with a reinstall and no other Linux user gets it. See §00 for the reasoning.

   - **Fonts** — `~/.local/share/fonts/`
     - `selawik/*.ttf` — Microsoft's open, **metric-compatible stand-in for
       Segoe UI** (5 weights, from the `microsoft/Selawik` 1.01 GitHub
       release). Segoe UI itself is proprietary and cannot be bundled.
     - `cascadia/*.ttf` — the real **Cascadia Code + Mono** (SIL OFL),
       extracted from the Arch `ttf-cascadia-code` package without root
       (`pacman -Sp` for the mirror URL → `bsdtar -xf` → `install`).
       The upstream GitHub release zip is 150 MB and downloads at ~40 KB/s;
       do not use it.
   - **fontconfig** — `~/.config/fontconfig/conf.d/60-filthy-net-deck.conf`
     Maps `Segoe UI` → Selawik, `Consolas` → Cascadia Code, plus
     `Segoe UI Variable/Emoji`. Without this fontconfig substitutes Liberation
     Sans for **every** missing Windows family and the CSS fallback chain is
     never reached. Run `fc-cache -f` after changes; verify with
     `fc-match "Segoe UI"` and `fc-match "Cascadia Code"`.
   - **Hyprland** — `~/.config/hypr/looknfeel.lua` (backup `.bak.<epoch>`
     alongside). Two rules added next to the existing overlay rule:
     main window `float + center + size 1160×690` (matched by class **and**
     title so it cannot catch the HUD), and the "Filthy Net Deck — Running"
     presence badge `float + pin + no_initial_focus`.
     Validate any edit with `hyprctl reload && hyprctl configerrors`.
   - **Cleared:** `~/.config/com.filthynetdeck.desktop/.window-state.json` —
     it had the 200×200 presence badge saved as `maximized: true`.
   - The launcher is **unchanged** (an `FND_UI_ZOOM` experiment was reverted;
     see the §00 traps).

   To check the whole font chain quickly:
   `fc-match "Segoe UI"` → Selawik · `fc-match "Cascadia Code"` → Cascadia Code.

   Do **not** add Linux to the marketing site. Exclusive-fullscreen Arena
   will cover the HUD — use borderless windowed. Detailed Logs were
   **disabled** in the Proton `Player.log` last we looked; same Arena
   account toggle as Windows.

   ### Not live-tested with a real match on Linux
   Overlay auto-hide after match end; companion staying up after match /
   Arena quit; first-match chooser inside the real overlay webview;
   Proton process-name vs `MTGA.exe` path (badge / HUD show).

   ### Do not sneak in
   Silent autostart-on · extra nav items · ripping out the library
   tracker · flipping overlay default for existing users · notification
   centre · P2 autostart installer checkbox · rotating the signing key in
   the same commit as a release. (The marketing site was deliberately left
   English here; the owner asked for it on 2026-09-01 — item 0b.)

   ### Owner leftovers (not blockers)
   1. In-app **Check for updates** on an installed 3.2.0 — *Update & restart*.
   2. Link-share preview of the OG card (`?v=3.3.0`).
   3. Reply to Shane — draft below still refers to 3.2.0 deck-library;
      edit if sending now (3.3.0 is overlay/companion + i18n).
   4. **Rotate the signing key** when convenient (passphrase was pasted
      into a chat transcript on 2026-08-27). Key id `67FCA9900F523D49`.

1. **v3.2.0 was shipped 2026-08-27. Historical. Do not rebuild.**

   Grok wrapped Claude session `d46b6234` on 2026-08-27: rebased onto
   `origin/main`, signed Windows build, pushed `e695e79` + tag `v3.2.0`,
   then rolled the dmg in `b4a9b95`.

   ### Verified live
   - `https://filthy-net-deck.com/version.json` → `3.2.0`
   - `https://filthy-net-deck.com/updater/latest.json` → `3.2.0`
   - Setup-3.2.0.exe → 200, 7 574 959 bytes
   - Filthy-Net-Deck-3.2.0-universal.dmg → 200, 22 125 807 bytes
     (sha256 `5afe08f7…30da9b`, GH Release + Netlify)
   - downloads = current + 1 (3.2.0 + 3.1.9, Windows and dmg)
   - Migration 10 already applied — do not re-run.

   ⚠️ Signing passphrase was pasted into a chat transcript on 2026-08-27.
   **Rotate the signing key** when convenient (key id `67FCA9900F523D49`).

   ### Owner leftovers (not blockers, not for an agent to invent)
   1. In-app **Check for updates** on an installed 3.1.9 — *Update & restart*,
      not a browser download. Needs the running desktop app.
   2. Link-share preview of the OG card (`?v=3.2.0`).
   3. Reply to Shane — draft below. Edit the sign-off, then send. Both
      platforms are downloadable.

   ### Deliberately NOT part of this release
   - `supabase/maintenance/20260827_shared_matches_format_cleanup.sql` — run it
     **weeks later**, after users have updated and their decks have re-synced
     under true formats. Read-only diagnostic first. Not urgent: the rollup
     reads a 30-day window and fully rewrites itself, so the published numbers
     clean themselves once updated clients stop sending bad rows.
   - **Brawl commanders** — unresolved, needs a real log. See the open-question
     section below. Do not guess at a field name.

   ### Open question still unanswered
   - Add the signed-build command as `npm run release:build` in `package.json`
     so it is one memorable command per release? Not added in v3.2.0.

2. **Beta-tester feedback on the marketing site.** Owner will collect
   reports and pick this up later. Do not redesign the hero unless they
   ask — the live fan (Standard/Pioneer × Bo1/Bo3) is the chosen treatment.
3. Web-platform plan is `docs/WEB-PLATFORM.md`. Do not start `/matchups` on
   the site until gate G2 trips (a real `n ≥ 30` crowd cell).
4. Suggest / Report is live (site + app). FormSubmit is already
   activated for `ston3d4pe@gmail.com`. Leave it alone unless mail stops.

## Reply to Shane — send after v3.2.0 is live

`shane@coinz.org`, the reporter of both this ticket and the v3.1.9 basic-lands
one. Kept here because the only other copy was in a session scratchpad that does
not survive the handover. Owner should edit the sign-off. **Do not send before
the build is downloadable** — it says the feature has shipped.

> **Subject:** Re: Deck library across formats — yes, and you found a bug
>
> Shane,
>
> Second good ticket in a row. Short answer: most of this already exists, one
> part of it was quietly broken, and the missing piece is now built.
>
> **What's already there.** FND doesn't just read match results out of
> `Player.log` — it pulls the *decklist Arena registers* at the start of every
> match. That's already format-agnostic: your Historic, Timeless and Brawl games
> have been recorded the whole time, same as Standard. They're in **My Stats →
> Your decks**, each with version history (every time you swap cards, that's a
> new build, with a card-by-card diff and the win rate of each) and a **Copy
> decklist** button that gives you Arena import text.
>
> So the library exists. What it lacked was the two things that make it useful
> to you specifically.
>
> **The bug you surfaced.** FND worked out a match's format by looking for
> `"ladder"` in Arena's queue id. `Historic_Ladder` contains `"ladder"`. So did
> `Alchemy_Ladder` and `Timeless_Ladder`, and `Brawl` fell through to the
> default. Every one of them was being filed as **Standard**. Your Historic
> decks were being backed up with a "standard" label, and Historic games were
> being counted in the community Standard matchup data. Both fixed: decks now
> carry the format they were actually played in, and matches from formats FND
> doesn't cover are no longer uploaded to the community numbers at all.
>
> **What's new.** A single **Export decklists** button in My Stats. It writes
> your entire deck library to a folder in Downloads — one `.txt` per deck, named
> `Deck Name (Format).txt`, each one straight Arena import text. Every
> constructed format you play, no account needed, no sign-in, nothing uploaded.
> That's your "keep them in local files" workflow, minus the manual part. Run it
> before you cull down to 100 and nothing is lost.
>
> If you *do* make an account, deck backup rides the existing cloud toggle and
> covers all those formats too — that one matters because Arena's logs rotate,
> and once they do, a deck you haven't played recently is gone from your PC and
> Arena won't hand it back. Publishing a deck to `/u/<you>/<deck>` is a separate,
> per-deck choice — that's for sharing a link, not for backup. You don't have to
> publish anything to have it backed up.
>
> **One real limitation, worth knowing before you delete anything.** FND only
> sees a deck when you *play* it — it reads the list Arena hands over at match
> start. A deck sitting untouched in your collection isn't in the library. So if
> you're about to clear space: play one game with anything you want to keep (the
> Play queue counts), then export.
>
> **What isn't changing:** the metagame side stays Standard and Pioneer. No
> Historic tier list, no Brawl matchup rates. Keeping your decks and covering a
> format's metagame are different jobs, and I'd rather do the second one properly
> for two formats than badly for six.
>
> **One ask, if you're up for it.** Brawl is the one format I can't fully vouch
> for. FND reads the maindeck and sideboard out of the log, but I've never
> confirmed where Arena puts the *commander* — and I don't have a Brawl log to
> check against. Your decks will export, but the commander may not be tagged. If
> you play a Brawl game and send me the `Player.log` afterwards, I'll wire it up
> properly rather than guess. (Same place you found the log for the land report.)
>
> Thanks for the report. The format bug had been live for a while and nobody had
> hit it from an angle that made it obvious.
>
> — [owner]

## Previous session (2026-08-27)

Second in-app ticket from Shane (`shane@coinz.org`), v3.1.9: Arena's 100-deck
cap makes him archive decks to Goldfish/AetherHub or local text files; could FND
pull them out of `Player.log` into a deck library across Standard, Historic,
Explorer, Brawl? Owner's call: **do not add Historic/Brawl as covered formats**,
but back the *decks* up honestly.

| Item | Notes |
|------|--------|
| ✅ | **Root-cause bug — every prefixed queue was "Standard"** | `sync.ts formatFor` tested `id.includes("ladder")`. `Historic_Ladder`, `Alchemy_Ladder` and `Timeless_Ladder` all contain it; `Brawl` fell through to `meta.formats[0].id`. So non-covered formats were uploading into the **crowd matchup rollup as Standard**, and their decks were backed up + publishable with a `standard` chip. |
| ✅ | **`services/arenaFormat.ts`** | One honest queue→format resolver. Order is load-bearing: brawl before historic (`Historic_Brawl`), limited before the rest, Standard is the *leftover* not a guess. `metaFormatOf` (standard\|pioneer\|null) gates crowd data; `arenaFormatOf` labels decks. 12 tests. |
| ✅ | **Crowd data now rejects, never relabels** | Non-Standard/Pioneer matches return null → `buildSharedMatch` drops them. Unknown queues are dropped too — they used to become the featured format. Fewer uploads, all of them real. |
| ✅ | **Deck library covers every constructed format** | `decks.format` widened by migration 10 to standard/pioneer/historic/alchemy/timeless/brawl. Limited and unknown are skipped rather than given an invented label. Mislabelled rows self-heal: `format` is in `deckSyncFingerprint`, so the next sync re-upserts on `(user_id, deck_hash)`. |
| ✅ | **Format chip in My Stats** | `DeckGroup.format` from the *newest* match that named a queue (a post-rotation deck is Historic now); an unnamed match cannot blank a format the rest agree on. Covered formats get the gold chip, library-only formats a quiet one, `unknown` renders nothing. |
| ✅ | **Export decklists** | New: `tracker_export_decklists` writes one Arena-import `.txt` per deck to a dated folder in Downloads and reveals it. Runs over the **unfiltered** library, no account, all formats. Text is built client-side (`arenaExport`) — the Rust side still has no id→name map. Decks whose cards have not resolved are **held back, not trimmed**, because `toArenaDecklist` silently drops unnamed rows. |
| ✅ | **Shipped v3.2.0** | Windows signed updater live; macOS dmg rolled in this follow-up. |

### Hard-won this session

- **"Which format is this queue" and "which tier list do I show" are different
  questions.** `deckHelpers.formatIdForEvent` answers the second and returns
  null for everything uncovered — correct there, catastrophic when reused as the
  first. That reuse is what put Historic games in Standard's matchup cells.
- **A metagame is not a deck library.** The Standard+Pioneer non-goal is about
  *coverage* — tier lists, archetype data, matchup rates. It was never a reason
  to lie about what format the user's own deck is.
- **`toArenaDecklist` drops rows it cannot name.** Fine when publishing (the
  caller refuses on `unresolved > 0`); a trap anywhere else, because the output
  still looks like a valid decklist. Every new caller has to check the count.
- **Windows deck names.** Arena allows `Dimir? / "Midrange"`; NTFS does not, and
  `CON` cannot be a filename at all. `safe_file_stem` handles both, truncates by
  chars not bytes, and dedupes collisions rather than overwriting.

### Open question — needs a real log, not a guess

- **Brawl commanders are unverified.** Nothing in the chain reads one:
  `tracker.rs find_deck_message` takes `deckCards` + `sideboardCards` off the
  GRE `connectResp.deckMessage` and nothing else, and `toArenaDecklist` passes
  `commander: undefined` unconditionally — so a Brawl deck exports with no
  `Commander` header, though `buildArenaImport` can write one. Whether that
  *loses* the card or merely untags it depends on where Arena puts it, and there
  is **no Brawl fixture** in `src-tauri/tests/fixtures/logs/`. Deliberately not
  guessed at. Next step: get a Brawl `Player.log` (Shane is the obvious ask —
  his last report came with grpIds), add a fixture, then wire it through.

### Second pass — the local display half (same session)

The first pass fixed what was *uploaded*; every local page was still doing
`formatIdForEvent(...) ?? "standard"`. Owner asked for it in the same session.

| Item | Notes |
|------|--------|
| ✅ | **`localFormatOf(eventId, fallback)`** | The local policy, three-way: covered → itself; **known**-uncovered → null; **unnamed** → the page's own format. The old `?? "standard"` collapsed the last two, which is the entire bug. Deliberately weaker than `metaFormatOf` (which rejects unnamed queues too): a wrong row in the crowd rollup is everyone's problem, a wrong row in your own local record is only yours and is visible in the match list. |
| ✅ | **Matchups** | Historic/Alchemy/Timeless/Brawl/draft games no longer reach `archetypeForMatch`, so they cannot land in a `standard-*` row. Unnamed queues fall back to the **featured** format rather than a hardcoded "standard". A footnote counts what was left out — a record that silently shrinks is how this went unnoticed. |
| ✅ | **Overlay** | Was the worst one: an uncovered queue fell through to the featured format, so a Historic game had its opponent inferred against the **Standard** board — and a Historic Izzet list clears the 0.35 floor against Standard's Izzet deck easily. It now skips inference entirely. No line beats a wrong line. |
| ✅ | **Overlay says why (owner call, 2026-08-27)** | The overlay **has always shown in every format** — `tracker.rs` shows it on any `playing`/`ended` phase, with no format check, and the owner had assumed otherwise. Kept that way deliberately: library count, draw odds, lands left and revealed cards are all format-agnostic and hiding the HUD would take a working tracker off Historic players. The opponent tab now carries *"Archetype read off — untracked format"* where the read would be, muted rather than gold (gold reads as a live result on that HUD). Three states, not two: "not enough cards yet" vs "no deck field exists for this queue" — the second was silent and read as a bug. Style it with `?demo&untracked#/overlay`. |
| ✅ | **Daily + DeckView** | Same three-way policy; a Historic game no longer inflates a Standard archetype's "you vs this deck" chip. |
| ✅ | **List Clinic gated** | `closestRankedDeck` scans every format and takes the nearest by L1 — `preferFormat` is only a tie-breaker — so a Historic deck got "58 cards off Izzet Cauldron" rather than no result. DeckDetail now renders an honest "nothing to compare this to" panel instead. |
| ✅ | **Dead `syncRunner.formatForMatch` deleted** | Exported, zero importers, still carrying `?? "standard"`. Deleted rather than repaired — a dead export encoding the wrong rule is a trap for whoever reaches for it next. |
| ✅ | **CI flake fixed** | `pipeline/meta-site-links.test.mjs` is a synchronous crawl of the whole corpus; it passes in ~1 s alone but timed out against vitest's 5 s default under full parallel load. Given an explicit 30 s timeout — the default is sized for async hangs, not honest I/O. |

| ✅ | **`deckHelpers.formatIdForEvent` deleted too** | Migrating the five call sites left it with zero production callers. Its own tests always passed — the function did exactly what it documented. The defect was the *signature*: returning null for Standard **and** for Historic made `?? "standard"` the obvious call, and all five callers wrote it. A dead export whose natural call site is a bug does not survive on symmetry. |

### File inventory — the whole uncommitted v3.2.0 change

Curated so the release commit can be reviewed without re-deriving intent.
`git status` is the source of truth if these drift.

**New**
| File | Why |
|---|---|
| `src/services/arenaFormat.ts` (+ `.test.ts`) | The honest queue→format resolver. `arenaFormatOf` names the queue, `metaFormatOf` gates crowd data, `localFormatOf` gates local pages, `isUncoveredFormat` drives the UI notes. 19 tests. |
| `src/services/deckLibraryExport.ts` (+ `.test.ts`) | Builds the whole library as Arena import text. Carries the ⚠️ Brawl-commander note. 10 tests. |
| `src/components/stats/FormatChip.test.tsx` | jsdom render test for the format chip, incl. "unknown renders nothing". |
| `supabase/migrations/20260827120000_deck_library_formats.sql` | **Already applied.** Widens `decks.format`. Commit it for the record. |
| `supabase/maintenance/20260827_shared_matches_format_cleanup.sql` | Operator runbook, run later. Not a migration. |

**Modified — app behaviour**
| File | Why |
|---|---|
| `src/services/cloud/sync.ts` | The origin bug. `formatFor` → `metaFormatOf` (crowd), `deckFormatFor` → `arenaFormatOf` (decks). |
| `src/services/cloud/deckSync.ts` (+ test) | `DeckRow.format` widened to every constructed format; limited/unknown skipped. |
| `src/services/cloud/syncRunner.ts` | Dead `formatForMatch` deleted. |
| `src/services/deckHelpers.ts` (+ test) | Dead `formatIdForEvent` deleted — its null-for-Standard shape *was* the footgun. |
| `src/services/deckStats.ts` (+ test) | `DeckGroup.format`, from the newest match that named a queue. |
| `src/pages/Matchups.tsx` | Uncovered formats excluded + a footnote counting them. |
| `src/pages/Daily.tsx`, `src/pages/DeckView.tsx` | Same three-way policy on the "you vs this deck" chips. |
| `src/overlay/OverlayApp.tsx` | No archetype guess in uncovered formats + the "read off" note. |
| `src/overlay/demoLive.ts` | `?demo&untracked` knob to style that note in a browser. |
| `src/pages/Stats.tsx` | **Export decklists** button; runs over the *unfiltered* library. |
| `src/components/stats/{DeckBreakdown,DeckDetail,statsUi}.tsx` | Format chip, and the List Clinic replaced by an honest empty state for uncovered formats. |
| `src/index.css` | `.fmt-chip`, `.deck-row-label`, `.overlay-opp-note--off`. Verified in both themes. |
| `src-tauri/src/tracker.rs`, `src-tauri/src/lib.rs` | `tracker_export_decklists` + `safe_file_stem` (4 tests). |

**Modified — release + docs**
`package.json` · `src/version.ts` · `src-tauri/{Cargo.toml,Cargo.lock,tauri.conf.json}` ·
`website/version.json` · `public/version.json` · `website/index.html` ·
`website/privacy.html` · `website/assets/_gen_og.py` + `og-image.png` ·
`pipeline/build-meta-site.mjs` (PRIVACY_LASTMOD) ·
`pipeline/meta-site-links.test.mjs` (CI flake) · `README.md` · `handoff.md`

### Known, not fixed (deliberate)

- Nothing outstanding from the format work.

## Previous session (2026-08-25)

| Item | Notes |
|------|--------|
| ✅ | **First in-app bug report — Green Game Jam basic lands, no art** | Shane (`shane@coinz.org`) on v3.1.9: decklist / stacked view blank for Arena store basics from June. Scryfall `/cards/arena/107494` 404s. The five lands are ANA grpIds **107492–107496** (`DigitalReleaseSet: ANA-GGJ-2026`); he listed 107494–107498 in WUBRG order, off by two — 107497/107498 are MSC tokens. |
| ✅ | **Gap map now covers evergreen ANA** | `ana` never ages out of the 180-day window. Builder also searches Scryfall `pana` and joins on **name + artist**, so the Daren Bader Plains is not the 2018 Donato Giancola Plains. |
| ✅ | **No app bump** | 3.1.9 already reads `s`/`t` from `arena-names.json` after a Scryfall 404. Publishing the map is the ship. |

### Hard-won this session

- Arena dumps store cosmetics into **ANA**. Scryfall's `ana` is the 2018 New Player Experience; the paintings live in **pana** with `arena_id: null`. The 180-day window skipped both because `released_at` is 2018.
- Name-only join on "Plains" is how you show the wrong basic-land art. Evergreen dumps require artist. Same artist on Plains and Swamp (Daren Bader) is fine — the key is name+artist, not artist alone.
- mtgajson is the name authority, not the reporter's labels. 107494 is a Swamp, not a Plains.

## Previous session (2026-08-20)

| Item | Notes |
|------|--------|
| ✅ | **Copyable published decklists** | The ask: replace an AetherHub link in a YouTube description with an own-site link viewers can copy. Publishing a deck now uploads the list as **Arena import text**, and `/u/<handle>/<slug>` renders it with a one-click Copy button. `/d/<id>` 301s to the same page. |
| ✅ | **Profile rows are links** | Both tables on `/u/<handle>` now link a deck to its page when a published deck's name matches — with a `list` badge when there is one to copy. |
| ✅ | **v3.1.8 Windows** | Signed key id `67FCA9900F523D49`. Installer + `.sig` + updater + `version.json` + OG `?v=3.1.8`. |
| ✅ | **Migration 9 applied** | `20260820120000_public_decklists.sql`, run by the owner. Verified via REST: `has_list`/`list` select 200 while a bogus column 400s, and both the 3-arg and legacy 2-arg `set_deck_public` shapes resolve. |
| ✅ | **v3.1.8 macOS dmg rolled** | Pulled `Filthy-Net-Deck-3.1.8-universal.dmg` from the GH Release (sha256 `e06c66db…a345b`, 21 470 155 bytes). Both homepage Mac buttons repointed. downloads = current + 1 (3.1.8 + 3.1.7). |
| ✅ | **Favicon on the server-rendered pages** | `profile.mts` / `deck.mts` never had the icon links the static pages carry, so those tabs showed the browser's generic globe. Absolute URLs — the deck page is at a nested path where a relative href resolves wrong. |
| ✅ | **v3.1.9 macOS dmg rolled** | Pulled `Filthy-Net-Deck-3.1.9-universal.dmg` from the GH Release (sha256 `d953be46…78be3`, 21 567 165 bytes). Both homepage Mac buttons repointed. downloads = current + 1 (3.1.9 + 3.1.8). |
| ✅ | **v3.1.9 — decklist order + right-sized icons** | Published lists now read creatures → spells → lands (`aggregateDeck`'s order, reused). `favicon.png` was a byte-identical copy of the 1024px `app-icon.png` at **804 KB**, served on every page; now 64px / 5.7 KB, with a 128px `app-icon-128.png` for the 52px page-header avatar. |

### Hard-won this session

- **The server cannot name a card.** `meta/arena-names.json` is only the *gap*
  map for sets Scryfall has not indexed; `meta/sets/*.json` carries no arena
  ids at all. That is why the list is rendered client-side at publish time and
  uploaded as text — do not "improve" this by resolving ids in the function.
- **Names must go through `arenaCardName`.** Scryfall returns
  "Unholy Annex // Ritual Chamber"; Arena's importer rejects it. Without the
  front-face strip every Standard deck with an MDFC publishes an unimportable
  list.
- `public_profile_decks` exposes `has_list` (a boolean) *and* `list`. The
  profile page selects named columns and must never `select=*` — that would pull
  twelve decklists to evaluate twelve booleans, the same waste 20260812060000
  found.
- `set_deck_public` gained a **defaulted** third argument and kept `returns
  boolean` on purpose: a v3.1.7 client calls it with two named args and checks
  `data === true`. Changing either would break every installed older build.
- Consent is not retroactive: `public_list` is null for everything published
  before 3.1.8 and only an explicit publish from a 3.1.8+ client fills it.
- **Sorting a decklist by mana value alone puts the lands first** — they are
  MV 0. `aggregateDeck` in `deckShare.ts` already owns the right order
  (creatures → spells → lands, each by MV then name); `arenaExport` reuses it
  rather than reimplementing, so the published list, the share card and the
  deck screen cannot disagree.
- **A published list is frozen at publish time.** Changing the export order
  does not rewrite lists already on profile pages — the owner has to publish
  the deck again. That is inherent to storing the rendered text, and is the
  same reason the server cannot re-render one.
- `favicon.png` and `app-icon.png` were the same 1024px 804 KB file. Do not
  point a tab icon or a 52px avatar at the master again — `favicon.png` (64px)
  and `app-icon-128.png` exist for that. `apple-touch-icon` still wants the
  large one.

## Previous session (2026-08-18, later)

| Item | Notes |
|------|--------|
| ✅ | **Jace / Kaito / Tezzeret themes** | Sidebar Themes picker now has ten walkers. Jace = indigo mind-magic (deeper than Teferi's sky-ivory). Kaito = neon cyan + magenta. Tezzeret = etherium brass + gunmetal. Dark and Light palettes for each. |
| ✅ | **v3.1.7 Windows** | Signed key id `67FCA9900F523D49`. Installer + `.sig` + updater + `version.json` + OG `?v=3.1.7`. `711a91c`. |
| ✅ | **v3.1.7 macOS dmg rolled** | Pulled `Filthy-Net-Deck-3.1.7-universal.dmg` from the GH Release (sha256 `0448241f…c6fe9`, 21 382 310 bytes). Both homepage Mac buttons pointed at it. downloads = current + 1 (3.1.7 + 3.1.6). `f956918`. |
| ✅ | **Live** | `version.json` / `updater/latest.json` / Setup-3.1.7.exe / 3.1.7 dmg all 200 on filthy-net-deck.com. |

### Hard-won this session

- New skins append after Garruk. Teferi stays the sky/ivory blue; do not make Jace another ice-blue.
- Picker list already scrolls (`max-height: min(18rem, 40vh)`). Do not float the panel over the main pane.

## Previous session (2026-08-18)

| Item | Notes |
|------|--------|
| ✅ | **Today chip on My Stats** | New first filter chip. Scopes every home tile, queue, insight, season story, arsenal, splits, and match history to the **last 24 hours** (rolling, not calendar day). The existing TODAY tile stays local-calendar-day. |
| ✅ | **Always-visible time chips** | Filter bar no longer hides when only one season is present — Today / this season / All time are always there. |
| ✅ | **v3.1.6 Windows** | Signed key id `67FCA9900F523D49`. Installer + `.sig` + updater + `version.json` + OG `?v=3.1.6`. `e0d1ddb`. |
| ✅ | **v3.1.6 macOS dmg rolled** | Pulled `Filthy-Net-Deck-3.1.6-universal.dmg` from the GH Release (sha256 `71f27e60…6328e`, 21 380 156 bytes). Both homepage Mac buttons pointed at it. downloads = current + 1 (3.1.6 + 3.1.5). `4cef8bd`. |
| ✅ | **Live** | `version.json` / `updater/latest.json` / Setup-3.1.6.exe / 3.1.6 dmg all 200 on filthy-net-deck.com. |

### Hard-won this session

- `"today"` is a stats-window sentinel, not a `YYYY-MM` season key. Route it through `matchesForStatsWindow` — `seasonKeyOf(...) === "today"` matches nothing.
- Today = last 24 hours (`endedAt` within `[now-24h, now]`). The FormTiles TODAY number is still `isSameLocalDay`. Do not merge those two definitions.

## Previous session (2026-08-17)

| Item | Notes |
|------|--------|
| ✅ | **Suggest / Report** | Website + app button → `website/feedback.html`. FormSubmit emails `ston3d4pe@gmail.com`. Owner confirmed delivery after the one-time activation click. GitHub issue templates are the fallback. |
| ✅ | **Surfaces** | Homepage nav pill + hero + footer + download note; privacy + status; in-app topbar next to Help; Settings → Interface and About. `FEEDBACK_URL` / `appFeedbackUrl()` in `src/services/site.ts`. |
| ✅ | **v3.1.5 Windows** | Signed key id `67FCA9900F523D49`. Installer + `.sig` + updater + `version.json` + OG `?v=3.1.5`. In-app button is in the binary. `4eb7be3`. |
| ✅ | **v3.1.5 macOS dmg rolled** | Pulled `Filthy-Net-Deck-3.1.5-universal.dmg` from the GH Release (sha256 `a0faa4e2…db785`, 21 285 350 bytes). Both homepage Mac buttons pointed at it. downloads = current + 1 (3.1.5 + 3.1.4). `2d6f546`. |
| ✅ | **Live** | `version.json` / `updater/latest.json` / Setup-3.1.5.exe / 3.1.5 dmg all 200 on filthy-net-deck.com. |

### Hard-won that session

- The form is website-only. It is **not** an app upload-payload change, but privacy.html §7 still lists the fields (kind, message, optional contact, optional app version).
- FormSubmit’s first live submit only sends an activation mail. Owner already clicked it; later submits land in Gmail.
- Local `serve` pretty-URLs `/feedback.html?x=1` → `/feedback` and **drops the query**. Production Netlify serves `/privacy.html` as 200, so `?sent=1` / `?from=app&v=` keep working on the live domain.
- App UI is not live until a signed version bump. Shipping the site form first, then v3.1.5, is the right split.
- `git add a b missing` fails the whole add. Stage the new dmg and HTML in their own add, never reuse a path that `git rm` already consumed.

## Previous session (2026-08-16, later)

| Item | Notes |
|------|--------|
| ✅ | **Bo1/Bo3 hero pills** | Static “Bo1 · live” replaced with a sibling pill group. Four boards from `/meta/latest.json`. Pioneer Bo1/Bo3 share mainboard faces — dock flashes and shows `N-card SB`. `37bdba3`. |
| ✅ | **Stacked public lists** | Arena overlap (same as in-app): 128px columns, `height: 64px; margin-bottom: -38px`. Lands no longer a lonely void column. CSS in generator + `site.css`. Same commit. |
| ✅ | **CI lint** | Site commits that also touch `pipeline/` run the full CI. Unused `cardThumb` failed ESLint and mailed the owner on every such push. Wired into `listCards`. `4496c1f`. |
| ✅ | **Pushed** | `37bdba3` + `4496c1f` on `origin/main`. **No app bump.** Netlify = site only. |

### Hard-won this session

- `pipeline/` is **not** in CI `paths-ignore`. Editing `build-meta-site.mjs`
  for a CSS-only site fix still runs `eslint src pipeline --max-warnings 0`
  and emails on failure. Keep the generator lint-clean.
- Pioneer Bo1 and Bo3 are the same five mainboard faces. Do not put
  sideboard art on the fan — dock + SB count is the mode signal.

## Previous session (2026-08-16)

| Item | Notes |
|------|--------|
| ✅ | **Homepage hero = live fan** | Hand of 5 real Scryfall cards from today’s top 5. Standard / Pioneer toggle (Bo1/Bo3 pills came later the same day). Click side card to lift; click the lifted card or **Open list →** to `/meta-web/deck/<id>.html`. Driven by `/meta/latest.json`. Brand tokens + Segoe UI untouched. |
| ✅ | **Public meta pages** | Deck heroes get a 4-card art stack; hub/format tiles get art strips; Stacked / List / Text toggles (same as the app, remembered in `localStorage`). Format pages (Std + Pio) have hero art. |
| ✅ | **Copy** | Hero no longer says “MTGO only”. Pipeline is MTGO → magic.gg → Goldfish, plus Untapped ladder when that’s the list (today’s #1 Auras is). Matchup Lab line removed. |
| ✅ | **Web platform plan** | `docs/WEB-PLATFORM.md` — site as public face of FND data, not a second desktop app. Pointer in `PLATFORM-STRATEGY.md` §1.6. |
| ✅ | **Pushed** | `7b52fe7` `site: live hero fan + public meta deck views` on `origin/main`. **No app bump.** Netlify = site only. |

### Hard-won that session

- Marketing-only HTML is not an app release. Do not bump `package.json` /
  installer for a homepage layout change.
- **Do not put `rotateX` / `translateZ` / `preserve-3d` on the fan hand.**
  Chromium then draws the cards in one place and hit-tests another — they
  look clickable and are not. Production fan is flat 2D (`translate` +
  `rotate` + `scale`).
- Hero fan files: `website/hero-fan.js` + `website/hero-fan.css`. Lab
  geometries (coverflow / helix / tesseract / etc.) were prototypes and
  were **not** shipped.
- `pipeline/build-meta-site.mjs` owns `/meta-web/` HTML + `site.css` +
  `view.js`. Edit the generator, then `npm run meta:site`. Do not hand-edit
  the 380 generated pages.
- `.lists` in meta-web must be a **column** (`display: flex; flex-direction:
  column`). A 2-col grid puts the Stacked/List/Text toolbar in the left
  cell and the cards in the right.

## Previous session (2026-08-16, app)

| Item | Notes |
|------|--------|
| ✅ | **Revealed-card quantities** | Match History / Matchups chips show `×N` when the opponent revealed more than one copy. Copy list is an Arena import with those counts. Overlay Opponent tab shows the same qty. Tracker stores repeats = max simultaneous copies in any one game (Bo3 does not triple-count). `opponentSeen` still never uploaded. v3.1.4. |
| ✅ | **v3.1.4 Windows** | Signed key id `67FCA9900F523D49`. Installer + `.sig` + updater + `version.json` + OG `?v=3.1.4`. |
| ✅ | **v3.1.4 macOS dmg rolled** | Pulled `Filthy-Net-Deck-3.1.4-universal.dmg` from the GH Release (sha256 `f47b0361…e675`, 21 097 809 bytes). Both homepage Mac buttons pointed at it. 3.1.3 skipped (never on the homepage). 3.1.0 + 3.1.1 dmgs pruned — downloads stays at current + 1 (3.1.4 + 3.1.2). |

### Hard-won this session

- Quantity is **max simultaneous** in revealed zones, not unique instance ids.
  GRE remints `instanceId` on every zone hop — counting ids would report 3
  Mountains when they played one and it died. Same reason the library tracker
  re-derives from zone membership. `AnnotationType_ObjectIdChanged` collapses
  a hop so a stale zone + new instance still counts as one.
- Old persisted matches only have distinct ids (qty 1). First launch after
  3.1.4 re-parses `Player.log` / `Player-prev.log` and **enriches** stored
  `opponentSeen` when the new parse saw more copies — never drops an id.
- `OpponentRevealedCards` must pass the **raw** grpId list (repeats = qty)
  into `revealedCardsOf`. Distinct ids are only for name resolve.

## Previous session (2026-08-15)

| Item | Notes |
|------|--------|
| ✅ | **Opponent revealed cards** | Cut with Matchup Lab (`OpponentDeckRead`, deleted in `2d0aaea` as “dead code”). Restored on Match History (click a match / Cards column) and Matchups (open a game). Raw cards only — no archetype guess. **Copy list** = Arena import of what was seen (1 of each). `opponentSeen` still never uploaded. v3.1.2. |
| ✅ | **Clinic collapsed + moved** | “Vs today’s ranked list” on a deck page starts closed, **Show cards off** / **Hide**, and now sits **under Match history**. v3.1.3. |
| ✅ | **v3.1.2 Windows** | Signed key id `67FCA9900F523D49`. Installer + `.sig` + updater + `version.json` + OG `?v=3.1.2` live. |
| ✅ | **v3.1.3 Windows** | Same. Live `version.json` / `updater/latest.json` / `Setup-3.1.3.exe` confirmed on filthy-net-deck.com. |
| ✅ | **v3.1.2 macOS dmg rolled** | Homepage was on 3.1.0, then 3.1.1 mid-session, now 3.1.2. 3.1.3 dmg waits on CI. |

### Hard-won this session

- **Do not delete the revealed-cards UI again.** `2d0aaea` retired Matchup Lab and
  took `OpponentDeckRead.tsx` with it because nothing imported it. The data
  (`TrackedMatch.opponentSeen`) never left. New home is Match History + Matchups,
  helpers in `src/services/opponentSeen.ts`, UI in
  `src/components/OpponentRevealedCards.tsx`. CSS `.opp-read*` was already there.
- Netlify takes ~2–3 minutes after a push that includes the installer + dmg.
  `version.json` staying on the previous version for that window is normal, not
  a missed deploy.
- First `tauri:build` failed because a vitest mock in
  `OpponentRevealedCards.test.tsx` was included by `tsc` (`vi.fn()` typed as
  zero-arg). Type the mocks (`vi.fn<(id: number) => unknown>()`) before the
  signed build.
- Rebase onto `origin/main` before every release push — set-radar / daily-meta
  moved main 16 commits during the 3.1.2 build.

## Previous session (2026-08-13)

| Item | Notes |
|------|--------|
| ✅ | **Fullscreen + Close-to-tray** | Hide drops the OS fullscreen bit so Windows will actually hide. `WANT_FULLSCREEN` remembers the pref; every show path (`show_main_window` — tray, second instance, presence, deep link) restores it, with retries. `window_state` no longer persists the dropped bit. |
| ✅ | **Brew Lab shrunk into My Stats** | Nav page gone (keys 1–8). Clinic is card-by-card vs the **closest ranked 75 by list overlap**, not the field average and not the deck name. “N cards off” = L1/2. Paste-a-list is a collapsed row on the My Stats home. |
| ✅ | **v3.1.1 Windows release** | Signed with key id `67FCA9900F523D49`. Installer + `.sig` + `updater/latest.json` + `version.json` + OG `?v=3.1.1` live. 3.0.3 pruned. |

### Hard-won this session

- After the repo moved off `Desktop\Coding with Grok\…`, **release** `tauri`
  artifacts still pointed `OUT_DIR` at the old path. `cargo clean -p tauri -p
  tauri-build` is not always enough for release — delete
  `src-tauri/target/release/build/tauri-*` (not plugins/runtime) and the
  matching fingerprints/deps, then rebuild.
- Do not restore fullscreen on generic `focus`. A focus flicker during hide
  re-enters exclusive fullscreen and Close-to-tray looks dead again.
- `document.visibilityState` often does **not** change after WebView2
  `hide()`. Restore belongs in Rust `show_main_window` + the `main:shown` event.

---

# v3.0.0 program (closed)

Owner's brief (2026-08-12): *"refining, debugging, perfecting performance and
polishing — a PERFECT v3.0.0 I can confidently share around."*

Scope chosen by the owner: **full regression audit + a deliberate polish
workstream**, email sign-in hidden, historical docs deleted outright.

## Done so far

| # | Item | Notes |
|---|------|-------|
| ✅ | **False "nothing is uploaded" claims fixed** | README + 3 site strings. Had been wrong since v2.7.5 — see the post-mortem in `docs/PLATFORM-STRATEGY.md` §1.2 rule 4 |
| ✅ | **`website/privacy.html`** | Both allowlists field by field; linked from the site footer and Settings → Data & privacy. In the sitemap via `build-meta-site.mjs` |
| ✅ | **In-app copy sweep** | Three share-card kickers, `StatusPanel`, the Tracker-health blurb, and a genuinely wrong consent line ("the one optional exception" — there were two, and the bigger one was *above* it) |
| ✅ | **Email sign-in hidden** | `EMAIL_SIGN_IN_ENABLED = false` in `src/services/cloud/config.ts`. Code path intact |
| ✅ | **Doc cleanup** | `ROADMAP.md`, `100X-ROADMAP.md`, `docs/AUDIT-2026-08-10-v2.7.3.md` deleted (git history keeps them). Binding non-goals + cloud rules moved into `AGENTS.md` |

## Still to do

| # | Item | Notes |
|---|------|-------|
| ✅ | **Full regression audit v2.7.3 → v2.8.2** | **9 findings, 2 of them P0** — `docs/AUDIT-2026-08-12-v3.0.0.md`. All fixed, and `20260812060000` was run on the live DB by the owner 2026-08-12 (verified: the deck view no longer exposes `main`) |
| ✅ | **Performance pass** | Found the P0 splash re-render loop. Bundle + boot verified on a production build; WebView2 RAM measured on the live install (~795 MB attributable, three renderers = main + overlay + presence with Arena running, which is correct) |
| ✅ | **UI/UX polish** | Empty states verified across all nine pages; ~700 lines of dead Matchup-Lab-era code removed (incl. a share card branded with the retired product name); typography and tooltip fixes; `index.css` comment encoding repaired |
| ✅ | **Launch readiness** | Status page + in-app incident banner shipped (§2.7 closed). §4 anti-abuse verified — two of six were missing, now implemented. Launch-spike quota modelled in `BACKEND-PHASE-2.md` §5: a 500-signup day is 0.5% of MAU and 0.8% of the database; storage only bites near ~16k active sharers, so the constraint is auth providers, not Supabase |
| ✅ | **Roll the macOS dmg** | v2.8.2's dmg rolled in and links fixed (macOS visitors had been served 2.8.1). A checklist line in `AGENTS.md` now guards against a repeat |
| ✅ | **v3.0.0 release train** | Shipped. Signed installer (key id verified), updater manifest, site, OG, tag, macOS dmg rolled |
| ✅ | **v3.0.1 / v3.0.2 — new-set cards** | The Hobbit shipped on Arena before Scryfall assigned its `arena_id`s, so every card showed as `Card #103529`. New `meta/arena-names.json` gap map + client fallback. **3.0.1** restored names (v3.0.0's installer predated the client half); **3.0.2** added mana value, colours and land-ness from Arena's own table, so the curve and pips are right too |
| ✅ | **v3.0.3 — the gap map was in only one of two resolvers** | Owner reported the Hobbit cards *still* unnamed in My Stats after the 3.0.2 fix and the data restore. Both were fine: `arenaMeta` (overlay, inference) had the fallback and `arenaCards` (My Stats decklist, Brew Lab, deck share) never did. The map now lives in `src/services/arenaNameGap.ts`, owned by neither — see `docs/DATA-AND-UPDATES.md`. Two data incidents plus this one came out of that one feature; treat "which resolver?" as the first question on any card-name bug |

## Known-open, not blocking v3.0.0

- **Phase 3 (crowd meta) is gated on population, not code.** Its machinery
  shipped inside Phase 2 slices 5/6. Cells stay empty until enough opted-in
  users exist. Building more there will not fill them; users will.
- **Email OTP needs custom SMTP** before it can be un-hidden — *and* tests; it
  has none, unlike the OAuth path.
- **§2.6 legal check** gates Phase 4 only, deferred with it.
- Disk: `src-tauri/target/` ~9 GB, `.git` ~1.6 GB / 490 MB packed
  (`docs/GIT-HISTORY-BLOAT.md` — **never from CI or an agent**).

---

## Current state

| Item | Status |
|------|--------|
| App version | **v3.2.0** on Windows (signed updater) and macOS (universal dmg on the homepage, this commit) |
| Branch | `main` |
| Gates last green | **693** vitest / 89 files · tsc · eslint · cargo fmt/clippy/57 tests · signed Windows build (2026-08-27) |
| Licence | MIT (`LICENSE`); README carves out brand, third-party meta data, Scryfall/WotC content |
| Monetization | Ko-fi only; Phase 4 paid tier deferred indefinitely |
| Supabase | Project `bzcryoocsapqtyhiwzbe`, **Pro**. **Ten** migrations run; the tenth (`20260827120000_deck_library_formats`) applied by the owner 2026-08-27. Do not re-run it. |
| Auth | Google **and** Discord enabled + verified live. **Email OTP built but hidden** behind `EMAIL_SIGN_IN_ENABLED` |
| Cron | `fnd-rollup` scheduled hourly (job id 1) — without it `matchup_rollup` never fills |
| Owner's profile | `filthy-net-deck.com/u/l0ne-f0x` — public, 371+ matches uploaded and aggregating |

### Verified live vs merely built

- **Verified against production:** Google sign-in (system browser → Supabase →
  `callback.html` → `fnd://` deep link → app), signup trigger creating the
  profile row, match upload (371 rows), profile page render + OG tags + 404 +
  handle sanitisation, health ping, Matchups crowd orientation/suppression.
- **Built, never exercised for real:** cloud deck sync end-to-end (schema is
  live; no client has written a deck row yet), Discord sign-in (configured,
  unused), email OTP sign-in (**now hidden**), community matchup *cells* (need
  30+ shared games from accounts with 25+ matches and 7+ days — expect empty for
  a while **by design**, that is the honesty discipline, not a fault).

---

## Key files

| File | Role |
|------|------|
| `src/services/cloud/config.ts` | Supabase URL + publishable key; `EMAIL_SIGN_IN_ENABLED` |
| `src/services/cloud/sync.ts` | isCloudEnabled/setCloudEnabled, upload, fetchRollup, handle + display-name |
| `src/services/cloud/syncRunner.ts` | Pulls live state + inference, calls the upload. The only trigger point |
| `src/services/cloud/matchSync.ts` | Shared-match **allowlist** builder — never serialise `TrackedMatch` |
| `src/services/cloud/healthPing.ts` | Slice 0 payload; Settings consent copy is generated from the same object so it cannot drift |
| `src/services/cloud/crowdMeta.ts` | Wilson intervals, matchupsFor, `MIN_GAMES = 30` |
| `src/services/cloud/personalMatchups.ts` | archetypeForMatch, personalRecords, mergeMatchups, readDelta |
| `src/services/cloud/friends.ts` | Phase 5 — friend codes, seasonal race |
| `src/services/cloud/deckSync.ts` | Slice 7 — `deck_hash` upsert, fingerprint instead of a high-water mark |
| `src/services/cloud/auth.ts` | OAuth (system browser + `fnd://`), email OTP, session |
| `src/services/cloud/archetypeSlug.ts` | Canonical slug join key (duplicated in the profile function) |
| `src/services/opponentSeen.ts` | Distinct revealed grpIds, display list, Arena import of what was seen |
| `src/components/OpponentRevealedCards.tsx` | Match History / Matchups expand panel. Local only |
| `src/components/ListClinic.tsx` | `collapsible` starts the deck-page clinic closed (`Show cards off`) |
| `src/services/opponentArchetype.ts` | Inference. `observedColorsFromSeenCards` is where the basic-land fix landed |
| `src/services/site.ts` | `SITE_*`, `DONATE_URL`, `PRIVACY_URL`, `STATUS_URL` — empty string hides an affordance everywhere |
| `src/services/serviceStatus.ts` | Reads `website/status.json`; drives the in-app incident banner |
| `website/status.json` | **Flip this during an Arena-break incident** — see `docs/MAINTENANCE.md` item 4 |
| `pipeline/sources/arena-names.mjs` | Names for Arena cards Scryfall has no `arena_id` for; publishes `meta/arena-names.json`, self-healing |
| `src/services/arenaMeta.ts` | grpId → card meta. Scryfall first, gap map only on 404, `partial` entries never persisted |
| `src-tauri/src/deeplink.rs` | `fnd://` — handles BOTH cold start and the single-instance argv route |
| `netlify/functions/profile.mts` | Server-rendered `/u/<handle>` (config.path routing) |
| `netlify/functions/deck.mts` | Server-rendered `/u/<handle>/<slug>` + `/d/<id>` — one published deck, with the copy button |
| `src/services/arenaExport.ts` | Arena ids + resolved names → Arena import text. The publish path's only source of a decklist |
| `pipeline/build-meta-site.mjs` | The `/meta-web/` corpus + sitemap. Static pages are hardcoded there, not in `paths` |
| `website/privacy.html` | The published field allowlist |
| `supabase/migrations/` | 9 migrations, **all run on the live DB** (the 9th, `20260820120000`, published decklists — run by the owner 2026-08-20) |

---

## Hard-won facts (do not re-derive)

### Product rules now live in `AGENTS.md`

Cloud rules, non-goals and the deferred list moved there 2026-08-12 so they sit
with the release checklist rather than in a status file.

### Inference

- **Lands corroborate but never carry.** A four-colour pile plays every dual in
  the format, so land overlap alone matched whatever anyone put on the table.
  An unseen colour costs, scaled by how much of the deck has been seen, and is
  disqualifying once the sample is real unless three cards no other list plays
  say otherwise.
- **Arena basic-land grpIds are not stable identities.** A game object Arena
  described as `SuperType_Basic` / `SubType_Swamp` carried grpId **87457**, which
  resolves through the card API to **Island**. Read Arena's own `subtypes` off
  the game object; a basic resolved *by id* is only soft evidence.
- **Two harnesses exist — rebuild them before touching the engine.** A held-out
  synthetic benchmark over the whole field, and a replay over real tracked
  history. Nobody could previously tell whether an inference change helped.
  Baseline (owner's 322 real matches): wrong-colour reads 25.8% → 5.9%, gave a
  read at all 95.3% → 92.9%.

```
cd src-tauri
FND_REPLAY_LOG=<Player.log> FND_REPLAY_OPP='*' cargo test replay_real_log -- --nocapture --ignored
```

### UI performance

- **Splash wrappers that keep state + interval after exit re-render the entire
  app.** Prefer early-return unwrapped children once the splash is gone.
- Zustand `set({ trackerMatches: newArray })` on a no-op poll is expensive —
  any page subscribed to matches re-renders. Fingerprint before set.
- **Do not code-split the pages.** `React.lazy` renders its fallback once before
  resolving *even when the chunk is already cached*, so page-level splitting
  buys a permanent skeleton flash on each page's first visit. Prefetching does
  not suppress it, and `startTransition` cannot either. Measured 2026-08-10:
  static imports give 0–2 ms synchronous nav. The split worth keeping is
  `main.tsx`'s App-vs-overlay/toast/presence one.
- **Zustand updates cannot be deferred.** It reaches React through
  `useSyncExternalStore`, which React always renders synchronously —
  `startTransition(() => set(...))` is a no-op.
- `key={page}` on the content shell is usually wrong for "snappy nav" — it
  forces remount + CSS enter animation every click.

### WebView memory

- Counting "WebView2 Manager (N)" in Task Manager: one browser process + GPU +
  utility + **one renderer per webview window**. Secondary labels
  `toast` / `overlay` / `presence` are intentional product surfaces, not
  leaks — but they must not outlive their need.
- **Never prewarm toast at boot** again for "first-toast latency" without
  measuring RAM cost.
- ⚠️ **Never build a WebView window on the event-loop thread** on Windows — it
  deadlocks: the window is created, `build()` never returns, and every later
  main-thread task is wedged (tray Quit included). Reintroduced **four times**
  from four directions. You reach the event loop from **three non-obvious
  places**:
  1. inside a `run_on_main_thread` closure;
  2. an `on_window_event` handler;
  3. **any synchronous `#[tauri::command]`** — Tauri 2 runs those on the main
     thread. This is the one that keeps catching people.

  There is a guard: `refuse_if_main_thread()` in `lib.rs`, called at the top of
  every `ensure_window`. It refuses and names the offender instead of hanging,
  and `debug_assert!`s so `tauri:dev` fails loudly. **Call it from any new
  webview builder.** Create on a worker thread; only show/destroy on main.
- `on_window_event` is **global across all four webviews** — scope every arm by
  `window.label()`. An unscoped `prevent_close` once swallowed tray Quit.

### Supabase / backend

- **"Automatically expose new tables" is OFF** (deliberate). Every new table
  starts with **no privileges for any Data API role — `service_role` included**
  — so each migration must `grant all on public.<table> to service_role;`.
  Symptom when forgotten: an Edge Function write fails with Postgres **42501**
  although its key is correct, which reads like a database fault rather than
  config.
- This project uses the **new API key system**, so `SUPABASE_SERVICE_ROLE_KEY`
  may not be injected into functions — read it with fallbacks and fail loudly.
  `createClient(url, undefined)` **does not throw**; it silently downgrades
  every write to `anon`.
- **RLS is row-level, not column-level.** A `select` policy exposes the whole
  row; use a view over a locked-down base table to publish a column subset.
  (This is why `public_profiles` is a view, and why publishing decks needed one.)
- Never return raw Postgres messages from a public Edge Function — return the
  error *code* plus a stage label and log the rest.
- **Subject orientation is load-bearing on Matchups.** Community rows are
  "A vs B", so a field rate is only comparable to yours when both describe the
  same deck facing the same opponent. `subjectArchetype()` requires a 60%
  majority recognised deck; no clear subject means **no comparison is offered**.
  Do not "fix" that with a field average — it is not comparable.
- The public deck page prints deck, format, size and last played — **not the
  list**: `main` is Arena card ids and there is no id→name map on the server.
  If card names on public decks are wanted, ship an id→name map first.

### Sets feed

- Live/released sets: slim index + lazy `meta/sets/<code>.json`. Spoiling sets
  stay fat inline. Do not regress to full-gallery-in-index for every live set.
- Offline cache (`bbi.sets.lastGood`) strips live full galleries (same policy),
  with the bundled copy as an offline floor.

### CI

- **Stage directories, not file lists.** `sets-refresh.yml` hand-listed two
  files to stage; v2.7.1 added per-set lazy galleries writing ~19 more, they
  stayed unstaged, the following `git pull --rebase` refused, and the job exited
  **128 every 4 hours for two days** — with the *build step still reporting
  success*. The set radar was frozen the whole time.
- Nothing with a dot in its basename goes in `netlify/functions/` — it is read
  as a function name and a dot is illegal, failing every deploy.

### Release / git

- `main` can move under you via scheduled set-radar commits. Rebase release onto
  `origin/main` before push; retarget the version tag if it was created
  pre-rebase.
- Signing: `TAURI_SIGNING_PRIVATE_KEY` (file path or contents) +
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; clear from the shell after. Key id
  **67FCA9900F523D49** — check it against the pubkey in `tauri.conf.json` before
  publishing, because a sig from the abandoned repo-root key looks fine and
  breaks auto-update. On this Linux box the key lives in `~/.tauri/` and the
  NSIS build is `tauri build --bundles nsis --runner cargo-xwin --target x86_64-pc-windows-msvc`.
- PowerShell mangles HEREDOC / JSON argv — use temp files or node scripts for
  multi-line commits and version bumps on Windows.
- Install counting: the signal is **`/updater/latest.json`**, not
  `/version.json` (`docs/INSTALL-COUNTING.md`). **Never put a function in front
  of `/updater/latest.json`** — it drives the signed auto-update.
- Dual Netlify config: root `netlify.toml` governs build + functions;
  `website/netlify.toml` governs **headers and redirects**. A redirect in the
  root file silently does nothing.
- Test feed/origin changes in an **installed** build — prod origin is
  `tauri.localhost` and `tauri:dev` does not enforce the CSP.

### MSIX / reading app data

- My reads of `%APPDATA%` can be a frozen copy-on-write snapshot. Verify via
  `\\localhost\c$` or the in-app diagnostic before concluding a persistence bug.

---

## Background queue (nothing here blocks v3.0.0)

| Priority | Item | Notes |
|----------|------|--------|
| Defect | Tracker persistence — root cause | Data loss FIXED (reconcile pass, 2026-08-11). Why appends stalled is still unknown; `persistRepairs` in the next diagnostic is the trail |
| Measurement | Search Console checkpoint ~2026-08-24 | Baseline 2026-08-11: 3 clicks, 32 impressions, position 11.2 |
| Product | Email OTP needs custom SMTP **and tests** | Hidden for now |
| Product | Wildcard craft-cost feature | Buildable locally, never built — `PLATFORM-STRATEGY.md` §2.4 |
| Optional | Upload Windows exe/sig to GitHub Releases | macOS dmgs are there; Windows lives on the site CDN + local archive only |
| Disk | `src-tauri/target/` regrows to ~9 GB | `cargo clean` reclaims it at the cost of one full rebuild |
| Later | macOS signed updater | Workflow disables updater artifacts; key is local-only |
| Later | `.git` is ~1.6 GB | Needs the coordinated filter-repo in `docs/GIT-HISTORY-BLOAT.md`. **Never from CI or an agent** |

---

## Dev / release commands

```bash
npm install
npm run tauri:dev
npm test              # 625 vitest across 84 files
npm run sets          # rebuild slim sets index + galleries
npm run meta          # daily meta (no app bump required)
npm run meta:site     # regenerate /meta-web/ + sitemap
npm run tauri:build   # set TAURI_SIGNING_* for Windows updater artifacts
```

Release definition of done: root **`AGENTS.md`** checklist (binary + downloads +
updater + version.json + site + OG + Netlify live + tag/macOS).

---

## Docs map

| File | Role |
|------|------|
| `handoff.md` | **This file** — live session state |
| `AGENTS.md` | Binding project rules, release checklist, cloud rules, non-goals |
| `docs/PLATFORM-STRATEGY.md` | Growth phases — all buildable ones now shipped; kept for the reasoning |
| `docs/BACKEND-PHASE-2.md` | The backend as designed *and as built* |
| `docs/MAINTENANCE.md` | What self-maintains vs. the monthly hands-on checklist |
| `docs/DATA-AND-UPDATES.md` | Pipeline sources + updater mechanics |
| `docs/INSTALL-COUNTING.md` | Post-mortem: right machinery, wrong endpoint |
| `docs/GIT-HISTORY-BLOAT.md` | The optional history rewrite, and why not to automate it |
| `docs/AUDIT-2026-08-12-v3.0.0.md` | Latest deep audit — 9 findings across the v2.7.3→v2.8.2 backend push |
| `docs/WEB-PLATFORM.md` | Site-as-destination plan (Goldfish × AetherHub × Untapped). Gates, not a build list |

Removed 2026-08-12 as shipped history (recover from git if ever needed):
`ROADMAP.md`, `100X-ROADMAP.md`, `docs/AUDIT-2026-08-10-v2.7.3.md`,
and earlier `docs/PAGE-10X.md` / `docs/AUDIT-2026-07-22-v2.5.0.md`.

# Working on FND from two machines — open questions, not conclusions

**Written:** 2026-09-02, by Claude, on the **Windows** box, at the owner's request.
**Status:** ⚠️ **UNVERIFIED CLAIMS. Do not act on this as fact.**

The owner is moving to Omarchy (Arch) as their daily driver and asked how to
maintain FND from two operating systems without breaking users. This file is
the answer I gave — captured so the **Linux-side agent can pick it up**, argue
with it, and turn it into decisions.

> **The owner has already said some of this is wrong.** Specifically: they have
> *already* produced Tauri/NSIS Windows builds from the Linux box, via some
> workaround or virtualization layer they could not recall the name of. Item 1
> below is written as if that were harder than it is. **Assume I am wrong until
> checked.**

## How to use this file

Work through it **with the owner**. For each item:

1. Run the verification command. Do not trust my claim.
2. Say whether it is correct, wrong, or already handled.
3. Decide: do it, drop it, or defer it.
4. Edit this file in place with the answer, and delete items once resolved.

This is a scratch document with a short life. When every item is resolved,
fold anything durable into `AGENTS.md` and delete this file.

---

## Item 1 · Can Omarchy produce an installable *Linux* FND?

**⚠️ THE ITEM MOST LIKELY TO BE WRONG. The owner has already contradicted it.**

**What I verified:** `src-tauri/tauri.conf.json` has
`bundle.targets: ["nsis", "dmg"]`. There is no `deb`, `appimage` or `rpm`.

**What I inferred, and probably overstated:** that there is therefore "no way to
produce an installable FND on Omarchy". That is too strong. Adding a Linux
target, or passing `--bundles deb`, would presumably do it. And the owner says
they have already built the *Windows* NSIS from Linux, which means their
toolchain there is considerably more capable than I assumed.

**Check:**

```
grep -A3 '"targets"' src-tauri/tauri.conf.json
```

Then ask the owner what the Linux→Windows build actually uses (cargo-xwin? a
container? a VM?). `handoff.md` mentions cargo-xwin and local NSIS.

**What I still think is right, and is the actually useful part:** for *using*
FND on Linux right now, `npm run tauri:dev` is enough — it runs natively,
tails the Proton logs, and needs no bundling or signing. Worth confirming that
works before touching bundle config at all.

**Decide:** does the Linux box need a real installable build, or is dev mode
fine until there is an actual Linux release?

---

## Item 2 · CI never compiles the Linux code

**Confidence: high. This is the item I would fix first.**

**Verified:** `.github/workflows/ci.yml` has two jobs — `web` on
`ubuntu-latest`, and `rust` on **`windows-latest` only**.

**Therefore:** the `#[cfg(target_os = "linux")]` blocks in `src-tauri/src/tracker.rs`
(Proton log tailing, ~line 679 and ~line 2237) are compiled by **no CI job at
all**. Windows cannot compile them by definition.

**Supporting evidence this is a real hole:** commit `16f5403`,
*"stop Windows clippy failing on the Linux Proton log helper"* — the mirror
image, caught only because it broke Windows. A change that breaks **only Linux**
has nothing in front of it.

**Check:**

```
grep -n "runs-on" .github/workflows/ci.yml
```

**Proposed fix:** add `ubuntu-latest` to the `rust` job (a matrix, or a second
job). Costs one runner. This is what makes "let an agent tweak things on the
Linux box" structurally safe rather than hopeful.

**Decide:** matrix both, or a separate Linux job? Note Linux needs WebKitGTK
system deps installed in CI, which the current Windows-only job does not.

---

## Item 3 · Frontend Linux fixes reach Windows users — Rust ones do not

**Confidence: high on the mechanism, unverified on the specific example.**

Rust has platform gates and `tracker.rs` already uses them properly. A gated
Linux fix physically cannot enter a Windows build.

**CSS and TSX have no such gate.** Commit `21f10a4`,
*"Linux WebKitGTK white native selects (owner box)"*, was a Linux rendering fix
— and I believe it shipped to every Windows and macOS user, because there is no
`#[cfg]` for a stylesheet. **I did not verify how that fix was scoped**; it may
have been written defensively. Check it:

```
git show 21f10a4
```

**Proposed standing rule for any agent on the Linux box:**

> A Linux-only fix goes behind a platform gate. If it is frontend and cannot be
> gated, say so explicitly and justify why it is safe on Windows and macOS —
> do not just make it look right on the machine in front of you.

**Decide:** is that worth adding to `AGENTS.md`? It is the rule that most
directly protects users during the two-OS period.

---

## Item 4 · Pull first, push last

**Confidence: high — this is history, not analysis.**

Three near-misses already, all the same root cause:

- The Windows box sat **33 commits behind** while the site served a newer
  version (`handoff.md` entry 1).
- A **local-only stash** on Windows nearly died with that clone (same entry).
- **2026-09-02, this session:** commit `08f2c72` sat unpushed on Windows,
  invisible from Omarchy, until Grok rebased it into `7a12d4f`.

None caused damage. All were avoidable.

**The failure mode that actually matters:** an agent on a stale clone will
confidently "fix" something that is not broken, because it cannot tell it is
behind. Pulling first is not tidiness — it is giving the agent correct inputs.

**Decide:** nothing to decide. Just do it. Possibly worth a line in `AGENTS.md`.

---

## Item 5 · No line-ending policy

**Confidence: high on the fact, low on how much it matters.**

**Verified:** there is no `.gitattributes`. Every `git add` on the Windows box
prints `LF will be replaced by CRLF`.

Two operating systems with no line-ending policy can produce phantom conflicts
— files that appear entirely rewritten when nothing changed.

**Check:**

```
ls -la .gitattributes
```

**Proposed fix:** a small `.gitattributes` normalising text to LF in the repo,
with `*.exe`/`*.dmg`/`*.png` marked binary.

**Caveat I have not checked:** whether normalising now produces one large
one-off diff across the repo, and whether that is acceptable. Check before
committing to it.

**Decide:** worth it, or noise? It is genuinely minor.

---

## Item 6 · The Linux install cannot auto-update (probably fine)

**Confidence: medium. The config is verified; the runtime behaviour is inferred.**

**Verified:** `website/updater/latest.json` contains only a `windows-x86_64`
platform key. The updater endpoints in `tauri.conf.json` point at it.

**Inferred, not tested:** a Linux build querying that manifest finds no matching
platform and reports "no update available" rather than doing anything harmful.
That is how I understand Tauri's updater to work, but **nobody has run it**.

**Why it is good news:** it means a Linux copy only changes when the owner pulls
and rebuilds. Nothing on the Linux box can reach users, because there is no
Linux artifact being served.

**Decide:** confirm the behaviour when FND first runs on Linux — does *Check for
updates* misbehave, or quietly do nothing? If it shows an error, that is worth
fixing before a Linux release.

---

## Item 7 · Releases stay on the Windows box — check this too

**Confidence: low. The owner has already partly contradicted the premise.**

I assumed releases should be cut from Windows because Authenticode is
Windows-only. But `handoff.md` states the Omarchy box **can** produce the signed
NSIS and updater `.sig`, and that Authenticode is skipped there — expected, and
not a blocker for auto-update.

So the real question is narrower than I framed it: **is an Authenticode-signed
installer worth requiring a Windows box for?** That affects the SmartScreen
warning users see, which `website/index.html` already apologises for.

**Decide:** with the owner. This is a product call, not a technical one.

---

## Not in scope here

A **real Linux release** — bundle targets, a Linux platform key in
`latest.json`, Linux CI, and marketing-site copy — is a separate piece of work.
The owner has said explicitly that it is a later decision, gated on actually
using FND on Linux for a while first. Do not start it.

# Packaging (winget + Homebrew) — local prep

**Status:** drafted against **v1.5.1** artifacts. Nothing has been submitted to
`microsoft/winget-pkgs`, `homebrew/cask`, or a personal tap. Ask before any PR.

Roadmap item: **A1** in `100X-ROADMAP.md` / handoff todo #2.

## Artifacts (already shipping)

| Platform | File | Live URL |
|----------|------|----------|
| Windows x64 NSIS | `Filthy-Net-Deck-Setup-1.5.1.exe` | `https://filthy-net-deck.com/downloads/Filthy-Net-Deck-Setup-1.5.1.exe` |
| macOS universal dmg | `Filthy-Net-Deck-1.5.1-universal.dmg` | GitHub release `v1.5.1` + `website/downloads/` |

SHA-256 (recomputed from local `website/downloads/`):

```
648206b5a0ee6fc30c4e901aa504baa7a502a6dc712108d63de22083bcdae006  Filthy-Net-Deck-Setup-1.5.1.exe
d7aa3a831374df68d95180b36afe8bef69a2ebd0ec11745fe2e9b0448c50281f  Filthy-Net-Deck-1.5.1-universal.dmg
```

## winget

Package ID: **`L0nE-F0x.FilthyNetDeck`**
Manifests: `packaging/winget/L0nE-F0x/FilthyNetDeck/1.5.1/`

### Validate locally

```powershell
winget validate --manifest packaging/winget/L0nE-F0x/FilthyNetDeck/1.5.1
```

### Install from the local folder (does not touch community repo)

```powershell
winget install --manifest packaging/winget/L0nE-F0x/FilthyNetDeck/1.5.1
```

### Submit later (explicit go required)

1. Fork https://github.com/microsoft/winget-pkgs
2. Copy the `1.5.1` folder into `manifests/l/L0nE-F0x/FilthyNetDeck/1.5.1/`
3. Open a PR with the winget-pkgs contribution checklist
4. Prefer Komac / YAMLCreate only if you want automation; the hand-written set is valid.

On each app release, bump the version folder, recompute installer SHA-256, and
open a new version PR (same PackageIdentifier).

## Homebrew Cask

Cask: `packaging/homebrew/filthy-net-deck.rb`
Token: **`filthy-net-deck`**

### Paths to publish (pick one, ask before either)

1. **Personal tap (recommended first):** create `L0nE-F0x/homebrew-tap`, put the
   file under `Casks/filthy-net-deck.rb`, then users run:
   `brew install --cask L0nE-F0x/tap/filthy-net-deck`
2. **Official cask:** PR to Homebrew/homebrew-cask once the app has stable
   releases and a public homepage (already true).

### Local smoke (macOS only)

```bash
brew install --cask --force ./packaging/homebrew/filthy-net-deck.rb
brew uninstall --cask filthy-net-deck
```

Confirm the dmg mounts an app named **`Filthy Net Deck.app`** (Tauri
`productName`). If the bundle name differs, fix the `app` stanza before
publishing.

## Chocolatey (not drafted yet)

Also listed under A1. Same NSIS `.exe` + SHA-256 as winget. Defer until winget
is validated; pattern is a `filthy-net-deck.nuspec` + `tools/chocolateyinstall.ps1`
with `checksumType = 'sha256'`.

## Release checklist hook

When cutting a version, also:

- [ ] Recompute SHA-256 for `.exe` and `.dmg`
- [ ] New winget version folder under `packaging/winget/.../<ver>/`
- [ ] Bump `version` + `sha256` in `packaging/homebrew/filthy-net-deck.rb`
- [ ] (After first submission) open winget-pkgs version PR + push tap/cask update

Do **not** claim distribution is live until the PR/tap is merged and
`winget search FilthyNetDeck` / `brew search filthy-net-deck` finds the package.

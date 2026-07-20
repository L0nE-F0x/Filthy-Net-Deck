# Git history bloat — installers in pack

## Status (2026-07-20)

| Surface | State |
|---------|--------|
| **Working tree** | Only current release under `website/downloads/` (e.g. v1.8.0 exe + dmg + sig) |
| **`public/downloads/`** | Gitignored — never re-add installers here (Vite would ship them in the app bundle) |
| **`.git` pack** | ~480+ MiB — historical Setup/dmg blobs from past releases still in pack history |

The product is fine. Clones and CI checkouts are slow because old NSIS/dmg binaries remain in object history even after HEAD pruning.

## Safe hygiene (do this every release)

1. Keep **only the current version** (or current + previous) in `website/downloads/`.
2. Commit the prune with the release (“downloads pruned”) so HEAD stays small.
3. Never put installers under `public/`.

## Optional history rewrite (force-push — coordinate first)

This shrinks the pack for everyone but **rewrites published history**. Only run during a quiet window when no one has open PRs depending on old SHAs.

### Prerequisites

- [ ] Owner approval for force-push to `main`
- [ ] All collaborators know to re-clone or hard-reset after
- [ ] Tags that should keep pointing at the same *content* will need re-pointing if they include old blobs

### Recommended tool: `git filter-repo`

```bash
# Install: https://github.com/newren/git-filter-repo
# From a clean main with no uncommitted work:

# 1) Strip every historical installer path except you re-add current ones after
git filter-repo --path-glob 'website/downloads/*.exe' --invert-paths --force
git filter-repo --path-glob 'website/downloads/*.dmg' --invert-paths --force
git filter-repo --path-glob 'website/downloads/*.sig' --invert-paths --force
git filter-repo --path-glob 'public/downloads/*' --invert-paths --force

# 2) Restore current artifacts from a local backup (or rebuild), then commit
# 3) Force-push (owner only):
git push origin main --force-with-lease
# 4) Re-push release tags if needed
```

### Alternative: BFG

```bash
# java -jar bfg.jar --delete-files 'Filthy-Net-Deck-Setup-*.exe'
# java -jar bfg.jar --delete-files 'Filthy-Net-Deck-*-universal.dmg'
# git reflog expire --expire=now --all && git gc --prune=now --aggressive
```

### After rewrite

- Confirm `git count-objects -vH` pack size dropped dramatically
- Confirm live site still serves current `website/downloads/` via Netlify
- Tell anyone with a clone to `git fetch origin && git reset --hard origin/main`

## What we will **not** do by default

- Automatic force-push from CI or agent sessions
- Git LFS for installers (CDN already serves them from Netlify; LFS does not shrink past history without a rewrite)

## CI note

Working-tree size is already controlled by release pruning. History rewrite is **optional maintenance**, not a release blocker.

---
name: commandwave-release
description: 'Cut a CommandWave release — verify the full CI-equivalent gate (rustfmt + clippy + cargo test, vitest + the tsc/vite build), bump the version in package.json / src-tauri/tauri.conf.json / src-tauri/Cargo.toml, commit, and after explicit confirmation push main and the v* tag that triggers the three-platform release CI (draft release with macOS dmg, Windows msi + NSIS setup, Linux deb/AppImage/rpm). Use whenever the user wants to release, ship, publish, or tag a CommandWave version, bump the version, or says 发版/发布/出新版本/升个版本/打个 tag — even a bare "release 0.2.0" or "发个版". Even when the user only mentions one piece (e.g. just bump the version), proactively check the other sync points: a half-bumped version breaks the release chain.'
---

# CommandWave release

A release is: bump the version in the three manifests → commit on `main` → push → push a `v*` tag. The tag triggers `.github/workflows/release.yml`, which creates a **draft** GitHub Release and then builds macOS (dmg), Windows (msi + NSIS `-setup.exe`) and Linux (deb + AppImage + rpm) bundles in parallel via `tauri-apps/tauri-action`. Publishing the draft is a separate, manual step.

**This skill always stops before pushing.** The tag push triggers the builds and produces the artifacts users download. Invoking this skill is the user's explicit request to bump / commit, but never push `main` or a tag without the user's explicit yes — not even with every check green.

macOS artifacts are **Developer ID signed and notarized** (the six `APPLE_*` secrets are configured, and `release.yml` re-notarizes + staples the dmg); if those secrets are ever cleared the build falls back to an unsigned dmg needing right-click → Open. Windows and Linux packages are unsigned — a SmartScreen "More info → Run anyway" is needed on Windows.

## 1. Determine the version

- An explicit version in the invocation wins (accept `0.2.0` or `v0.2.0`).
- Otherwise derive a suggestion:
  - Latest tag: `git fetch --tags && git describe --tags --abbrev=0`
  - What's shipping: `git log <latest-tag>..HEAD --oneline`
  - Suggest the next semver from those commits: `feat` → minor, `fix`/`chore`/`docs` → patch; bump the **minor** for anything user-visible while the project is 0.x.
- State the suggestion and the commits it's based on, then ask the user to confirm or override. Never bump an unconfirmed version.
- Never reuse a version that already has a tag: published releases are immutable. If a release went wrong, pick a new number — don't move the tag.

## 2. Pre-flight — abort on any failure

Run these before touching any file; a red tree never gets bumped.

1. `git status --porcelain` — must be empty. The bump rewrites 3 files (+ the lockfile); committing on a dirty tree mixes unrelated changes into the release commit.
2. `git branch --show-current` must be `main`, then `git pull --ff-only` — releases are always cut from an up-to-date main (GitHub Flow).
3. Full gate, CI-equivalent (`ci.yml`):
   - Rust (in `src-tauri/`):
     - `cargo fmt --all -- --check`
     - `cargo clippy --all-targets -- -D warnings`
     - `cargo test --all-targets`
   - Frontend (repo root):
     - `pnpm test`
     - `pnpm build` (runs `tsc && vite build`)

On failure: stop, show the failing output, and let the user decide what to fix. Do not bump.

> The local gate can only exercise the current OS. CI runs the same steps on macOS, Windows and Linux; the tag build is the real cross-platform check.

## 3. Bump

There is no bump script. Edit the version by hand in exactly three files (same value everywhere):

- `package.json` — `"version"`
- `src-tauri/tauri.conf.json` — `"version"`
- `src-tauri/Cargo.toml` — `version`

Then refresh the lockfile entry:

```
cargo update -p commandwave   # run in src-tauri/
```

`pnpm-lock.yaml` is deliberately untouched — it does not record the root package's own version.

Verify with `git status --porcelain`: expect exactly `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`. Anything else in the diff — investigate before committing.

Residue check: `grep -rn "<old-version>" package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml` — CommandWave's own version should only appear at the new value (matches inside unrelated dependencies don't count).

## 4. Commit

```
git commit -m "chore(release): vX.Y.Z"
```

## 5. Summarize, then STOP

Show the user, concretely:

- The version and the commits going out since the previous tag
- What release CI will build once the tag lands: a **draft** release with macOS dmg, Windows msi + NSIS setup, Linux deb + AppImage + rpm
- That macOS is Developer ID signed + notarized (opens cleanly) and Windows/Linux are unsigned
- That the dmg / installers only reach users when a maintainer publishes the draft

Then ask, and wait: "Push main + tag vX.Y.Z now?" A yes to the summary is consent to push; silence or anything ambiguous is not.

## 6. Push (only after the user's explicit yes)

```
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin main vX.Y.Z
```

Tag timing is a hard constraint: the tag snapshots HEAD at creation, so it must be created only after the bump commit is merged into `main` and is HEAD. Pushing newer commits never moves an existing tag; a mistagged release gets a new number.

## 7. Monitor, then let the user publish

```
gh run list --workflow=release.yml
gh run watch <run-id>
```

When CI is green, help the user verify the draft under Releases before publishing: assets present for all three platforms and the generated notes accurate. **Publishing is the user's manual click** — the skill never publishes the draft.

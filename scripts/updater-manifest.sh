#!/usr/bin/env bash
#
# Generate and upload the updater manifest (`latest.json`) for a release.
#
# Why not let tauri-action do it: every platform job builds the file from the
# release assets it can see (read -> merge -> delete -> upload). The three jobs
# run concurrently against the same asset, so a slow job can read a stale copy
# and drop the platforms another job had already recorded. Running this once,
# after all three builds, makes the result deterministic.
#
# Requires `gh` authenticated through GH_TOKEN/GITHUB_TOKEN and jq.
#
# Usage: GITHUB_REPOSITORY=owner/repo bash scripts/updater-manifest.sh v0.3.0
set -euo pipefail

tag="${1:-}"
if [ -z "$tag" ]; then
  echo "usage: $0 <tag>   (e.g. v0.3.0)" >&2
  exit 2
fi

command -v jq >/dev/null || {
  echo "::error::jq is required" >&2
  exit 3
}

version="${tag#v}"
case "$version" in
  [0-9]*.[0-9]*.[0-9]*) ;;
  *)
    echo "::error::tag '$tag' is not a semantic version; the updater would reject it" >&2
    exit 2
    ;;
esac

: "${GITHUB_REPOSITORY:?set GITHUB_REPOSITORY to owner/repo}"
repo="$GITHUB_REPOSITORY"
asset_base="https://github.com/${repo}/releases/download/${tag}"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "Reading assets of release $tag"
assets="$(gh release view "$tag" --json assets --jq '.assets[].name')"
printf '%s\n' "$assets" | sed 's/^/  asset: /'

notes="$(gh release view "$tag" --json body --jq '.body')"

# The manifest embeds the signature *contents*, so fetch the .sig assets. A
# release without any means the signing key is missing, so say that instead of
# letting `gh` fail with "no assets match the file pattern".
gh release download "$tag" --pattern '*.sig' --dir "$tmp" --clobber || {
  echo "::error::release $tag has no .sig assets; is TAURI_SIGNING_PRIVATE_KEY configured?"
  exit 1
}

# Each platform contributes exactly one entry, picked explicitly instead of
# "whichever asset comes first", so the result cannot depend on upload order:
#   darwin  -> the `.app.tar.gz` the updater unpacks
#   windows -> the NSIS `-setup.exe` (an MSI install cannot self-update)
#   linux   -> the bare `.AppImage` (the layout the Tauri v2 docs describe);
#              `.AppImage.tar.gz` is accepted as a fallback
darwin_sig=""
darwin_key="darwin-aarch64"
windows_sig=""
linux_sig=""
linux_fallback=""

while IFS= read -r name; do
  [ -n "$name" ] || continue
  # Bundles themselves are not manifest entries; only their signatures are.
  case "$name" in
    *.sig) ;;
    *) continue ;;
  esac

  case "$name" in
    *.app.tar.gz.sig)
      # Key and signature are chosen together: deriving the key from one asset
      # and the signature from another is exactly how a manifest ends up
      # advertising an x86_64 bundle under the `darwin-aarch64` key.
      if [ -n "$darwin_sig" ]; then
        echo "::warning::skipping $name: $darwin_key already uses $darwin_sig"
        continue
      fi
      case "$name" in
        *aarch64*) darwin_key="darwin-aarch64" ;;
        *universal*) darwin_key="darwin-universal" ;;
        *x86_64* | *x64*) darwin_key="darwin-x86_64" ;;
        *)
          echo "::error::cannot infer the macOS architecture from $name"
          exit 1
          ;;
      esac
      darwin_sig="$name"
      ;;
    *-setup.exe.sig)
      if [ -z "$windows_sig" ]; then
        windows_sig="$name"
      else
        echo "::warning::skipping $name: windows-x86_64 already uses $windows_sig"
      fi
      ;;
    *.AppImage.sig)
      if [ -z "$linux_sig" ]; then
        linux_sig="$name"
      else
        echo "::warning::skipping $name: linux-x86_64 already uses $linux_sig"
      fi
      ;;
    *.AppImage.tar.gz.sig)
      if [ -z "$linux_fallback" ]; then
        linux_fallback="$name"
      else
        echo "::warning::skipping duplicate $name"
      fi
      ;;
    *)
      echo "::warning::ignoring unrecognised signature asset $name"
      ;;
  esac
done <<<"$assets"

if [ -z "$linux_sig" ] && [ -n "$linux_fallback" ]; then
  echo "  linux-x86_64 falls back to $linux_fallback (no bare .AppImage.sig asset)"
  linux_sig="$linux_fallback"
fi

manifest="$tmp/latest.json"
jq -n \
  --arg version "$version" \
  --arg notes "$notes" \
  --arg pub_date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{version: $version, notes: $notes, pub_date: $pub_date, platforms: {}}' >"$manifest"

missing=""

add_platform() {
  # $1 = platform key, $2 = signature asset name ("" when the platform is absent)
  local key="$1" sig="$2" bundle url
  if [ -z "$sig" ]; then
    # Reported by the required-platform check at the end, which also catches a
    # macOS build that produced an unexpected arch key.
    return
  fi
  bundle="${sig%.sig}"
  if ! printf '%s\n' "$assets" | grep -Fxq "$bundle"; then
    echo "::error::signature $sig has no matching bundle asset $bundle"
    exit 1
  fi
  url="${asset_base}/${bundle}"
  jq --arg k "$key" --arg s "$(cat "$tmp/$sig")" --arg u "$url" \
    '.platforms[$k] = {signature: $s, url: $u}' "$manifest" >"$tmp/next.json"
  mv "$tmp/next.json" "$manifest"
  echo "  $key <- $bundle"
}

add_platform "$darwin_key" "$darwin_sig"
add_platform "windows-x86_64" "$windows_sig"
add_platform "linux-x86_64" "$linux_sig"

# The app validates the whole manifest before looking at `version`, so a missing
# (or unknown) platform entry stops updates for everyone — fail loudly instead.
for key in darwin-aarch64 windows-x86_64 linux-x86_64; do
  jq -e --arg k "$key" '.platforms[$k]' "$manifest" >/dev/null || missing="$missing $key"
done
if [ -n "$missing" ]; then
  echo "::error::latest.json is missing platform(s):$missing"
  jq . "$manifest"
  exit 1
fi

echo "Writing $manifest"
jq . "$manifest"

gh release upload "$tag" "$manifest" --clobber
echo "Uploaded latest.json to release $tag"

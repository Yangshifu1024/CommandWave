#!/usr/bin/env bash
#
# Fail a release unless the tag, the three manifests and the lockfile all agree
# on one version.
#
# Why this exists: the in-app updater compares the running app's version (read
# from `src-tauri/tauri.conf.json` at build time) against the `version` field in
# the published `latest.json` (generated from the tag). If those two disagree the
# app either never sees an update or offers the same "new" version forever, and
# the mistake only surfaces after users are involved.
#
# Usage: bash scripts/release-version-check.sh v0.3.0
set -euo pipefail

cd "$(dirname "$0")/.."

tag="${1:-}"
if [ -z "$tag" ]; then
  echo "usage: $0 <tag>   (e.g. v0.3.0)" >&2
  exit 2
fi

version="${tag#v}"
if ! printf '%s' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$'; then
  echo "::error::tag '$tag' is not a semantic version; the updater would reject it"
  exit 1
fi

pkg=$(jq -r '.version' package.json)
conf=$(jq -r '.version' src-tauri/tauri.conf.json)

# Only the [package] section: dependency `version = ...` lines live in tables.
cargo=$(awk '
  /^\[/ { section = $0 }
  section == "[package]" && $1 == "version" {
    gsub(/.*=[[:space:]]*"/, ""); gsub(/".*/, ""); print; exit
  }
' src-tauri/Cargo.toml)

# `cargo update -p commandwave` refreshes this entry, and it is easy to forget.
lock=$(awk '
  /^\[\[package\]\]/ { name = "" }
  $1 == "name" && $3 == "\"commandwave\"" { name = "commandwave" }
  name == "commandwave" && $1 == "version" { gsub(/"/, "", $3); print $3; exit }
' src-tauri/Cargo.lock)

status=0
check() {
  # $1 = label, $2 = value read from the tree
  if [ "$2" = "$version" ]; then
    printf '  %-34s %s\n' "$1" "$2"
  else
    printf '  %-34s %s   <-- expected %s\n' "$1" "${2:-<missing>}" "$version"
    status=1
  fi
}

echo "Release tag $tag (version $version)"
check "package.json" "$pkg"
check "src-tauri/tauri.conf.json" "$conf"
check "src-tauri/Cargo.toml" "$cargo"
check "src-tauri/Cargo.lock" "$lock"

if [ "$status" -ne 0 ]; then
  echo "::error::version mismatch: tag $tag does not match the manifests above"
  echo "Set every file to $version (and run 'cargo update -p commandwave' in src-tauri/) before tagging."
  exit 1
fi

echo "OK: tag and all manifests agree on $version"

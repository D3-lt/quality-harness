#!/bin/sh
# ADR-110/116: one verified native hook engine. Only SessionStart may bootstrap it.
set -eu
script=$0
# Git Bash may receive a native Windows path from the host.
case "$script" in *\\*) script=$(printf '%s' "$script" | tr '\\' '/') ;; esac
case "$script" in */*) directory=${script%/*} ;; *) directory=. ;; esac
root=$(CDPATH= cd -- "$directory/.." && pwd)
version=$(
  while IFS= read -r line; do
    case "$line" in
      (*'"version"'*:*)
        version=${line#*:}
        case "$version" in
          (*\"*\"*) version=${version#*\"}; version=${version%%\"*} ;;
          (*) version='' ;;
        esac
        printf '%s\n' "$version"; break ;;
    esac
  done < "$root/.claude-plugin/plugin.json"
)
case "$version" in ''|*[!0-9.]*) echo 'quality-harness: could not run: core version is unreadable' >&2; exit 1 ;; esac
platform=$(uname -sm) || { echo 'quality-harness: could not run: unsupported core platform' >&2; exit 1; }
case "${platform%% *}" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  MINGW*|MSYS*|CYGWIN*) os=windows ;;
  *) echo 'quality-harness: could not run: unsupported core platform' >&2; exit 1 ;;
esac
case "${platform#* }" in
  arm64|aarch64) arch=arm64 ;;
  x86_64|amd64) arch=amd64 ;;
  *) echo 'quality-harness: could not run: unsupported core architecture' >&2; exit 1 ;;
esac
asset="qh-$os-$arch"
if [ "$os" = windows ]; then
  [ "$arch" = amd64 ] || { echo 'quality-harness: could not run: unsupported Windows architecture' >&2; exit 1; }
  asset="$asset.exe"
fi
data=${CLAUDE_PLUGIN_DATA:-${XDG_CACHE_HOME:-$HOME/.cache}/quality-harness}
if [ "$os" = windows ]; then
  data=$(cygpath -u "$data")
  export CLAUDE_PLUGIN_ROOT=$(cygpath -w "$root")
else
  export CLAUDE_PLUGIN_ROOT="$root"
fi
binary="$data/qh/$version/$asset"
verified() {
  [ -f "$binary" ] && [ -f "$binary.sha256" ] || return 1
  IFS= read -r expected < "$binary.sha256" || return 1
  [ "${#expected}" -eq 64 ] || return 1
  case "$expected" in *[!0-9a-f]*) return 1 ;; esac
  if command -v sha256sum >/dev/null 2>&1; then
    actual=$(sha256sum "$binary") || return 1
  elif command -v shasum >/dev/null 2>&1; then
    actual=$(shasum -a 256 "$binary") || return 1
  else
    return 1
  fi
  [ "${actual%% *}" = "$expected" ]
}
if ! verified; then
  if [ "${1:-}" = hook ] && [ "${2:-}" = SessionStart ] && [ "${QUALITY_HARNESS_QH_FETCH:-}" != off ]; then
    node "$root/scripts/qh-fetch.mjs" "$data" </dev/null || exit 1
  fi
  verified || { echo 'quality-harness: could not run: a verified Go core is missing or its checksum differs; run SessionStart or the qh-fetch CLI' >&2; exit 1; }
fi
exec "$binary" "$@"

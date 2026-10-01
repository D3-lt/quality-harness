#!/usr/bin/env bash
# verdict-diff.sh — does any verdict on this corpus change between plugin/ at a sha and
# the working tree's plugin/? (ADR-079 T4, the owner's bar: no verdict changes.)
#
#   bash scripts/verdict-diff.sh [--control] <sha>
#
# Rebuilds plugin/ at <sha> from git, never from a copy taken earlier, then runs both
# plugins over the same tracked records (adr-lint) and specs (spec-verify), one after the
# other, from this checkout. Each side's output is kept whole with every exit status;
# only what differs between two plugin trees by construction is normalised: the version
# stamp with its plugin path, temp paths and durations.
#
# --control runs the working-tree side through an adr-lint that prints one extra line per
# record, so a comparator that cannot see a difference is caught (CLAUDE.md §4).
#
# Exit 0: the two sides printed the same. Exit 1: they did not, and the diff is printed.
# Exit 2: usage, or a side that could not be built. Nothing here edits the tree.
set -u
control=0
if [ "${1:-}" = "--control" ]; then control=1; shift; fi
sha=${1:-}
if [ -z "$sha" ]; then
  echo "usage: bash scripts/verdict-diff.sh [--control] <sha>" >&2
  exit 2
fi
repo=$(git rev-parse --show-toplevel) || exit 2
cd "$repo" || exit 2
work=$(mktemp -d) || exit 2
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/before"
if ! git archive "$sha" plugin | tar -x -C "$work/before"; then
  echo "verdict-diff: could not rebuild plugin/ at $sha from git" >&2
  exit 2
fi
before="$work/before/plugin"
after="$repo/plugin"
# Routes a plugin's adr-lint through a copy that prints one more line after the real output.
wrap() {
  mv "$1/bin/adr-lint" "$1/bin/adr-lint.real" || exit 2
  cat > "$1/bin/adr-lint" <<PY || exit 2
import subprocess, sys
from pathlib import Path
run = subprocess.run([sys.executable, str(Path(__file__).with_name("adr-lint.real")), *sys.argv[1:]])
print("control: a finding naming $2")
sys.exit(run.returncode)
PY
}
if [ "$control" = 1 ]; then
  # The two sides differ only in a path-like word, so a normalisation that erased such a
  # word would read them as equal, and the control would catch that too.
  mkdir -p "$work/control"
  cp -R "$repo/plugin" "$work/control/" || exit 2
  after="$work/control/plugin"
  wrap "$before" /tmp/alpha
  wrap "$after" /tmp/beta
fi

# One run is bounded, so a hang reads as exit 124 on that side rather than no answer.
bound=""
if command -v timeout >/dev/null 2>&1; then bound="timeout 300"
elif command -v gtimeout >/dev/null 2>&1; then bound="gtimeout 300"; fi

# Only the version stamp, which names the plugin's own path, is taken out; every other byte
# is compared. A side's plugin path printed anywhere else reads `<plugin>` on both sides.
norm() {
  sed -E -e 's/ · (adr-lint|spec-verify) [0-9.]+ \([^)]*\)//'
}

records=$(git ls-files 'docs/adr/ADR-*.md' | grep -v '/tasks/' | sort)
specs=$(git ls-files 'docs/specs/*.md' | sort)

side() {
  local plugin=$1 out code
  for r in $records; do
    out=$($bound python3 "$plugin/bin/adr-lint" "$r" 2>&1); code=$?; out=${out//"$plugin"/<plugin>}
    printf '=== adr-lint %s exit %s\n%s\n' "$r" "$code" "$(printf '%s\n' "$out" | norm)"
  done
  for s in $specs; do
    out=$($bound python3 "$plugin/bin/spec-verify" --spec "$s" 2>&1); code=$?; out=${out//"$plugin"/<plugin>}
    printf '=== spec-verify %s exit %s\n%s\n' "$s" "$code" "$(printf '%s\n' "$out" | norm)"
  done
}

side "$before" > "$work/before.txt"
side "$after" > "$work/after.txt"
nrec=$(printf '%s\n' "$records" | grep -c .)
nspec=$(printf '%s\n' "$specs" | grep -c .)
echo "verdict-diff: plugin/ at $sha against the working tree$([ "$control" = 1 ] && echo ' (control)'): $nrec record(s), $nspec spec(s)"
if diff -u "$work/before.txt" "$work/after.txt"; then
  echo "verdict-diff: no verdict changed"
  exit 0
fi
echo "verdict-diff: the two sides differ (above)"
exit 1

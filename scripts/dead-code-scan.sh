#!/usr/bin/env bash
# dead-code-scan.sh — the pre-release dead-code scan (CLAUDE.md §13), with local tools.
#
# Three scanners, each reporting its version, its command and its count:
#   1. scripts/orphan-sweep.mjs — this repository's own: a definition in plugin/ that
#      nothing shipped reaches.
#   2. vulture, for the Python (plugin/bin, plugin/lib, scripts, tests), run through
#      `uvx` so nothing is installed into a system Python. Deliberate names are in
#      scripts/vulture-allowlist.py, each with its reason.
#   3. knip, for the JavaScript, run through `npx` on a scratch copy of the tracked
#      tree: the repository ships no package.json, and knip needs one. Exports used
#      inside their own file are not findings (`ignoreExportsUsedInFile`): orphan-sweep
#      already proves those are reached.
#
# A tool that is not available is said, with how to get it, and the scan is UNPROVEN
# rather than clean (exit 3). Exit 0: every tool ran and found nothing. Exit 1: a
# finding. Nothing here edits the tree.
set -u
here=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$here" || exit 2
findings=0
unrun=0

echo "== orphan-sweep (this repository's own)"
node scripts/orphan-sweep.mjs || findings=1

echo "== vulture (Python)"
if command -v uvx >/dev/null 2>&1; then
  files=()
  while IFS= read -r f; do
    case "$f" in
      tests/fixtures/*) continue ;;
      *.py) files+=("$f") ;;
      *) head -1 "$f" | grep -q python && files+=("$f") ;;
    esac
  done < <(git ls-files --cached --others --exclude-standard 'plugin/bin/*' 'plugin/lib/*.py' 'scripts/*.py' 'tests/*.py' | grep -vxF scripts/vulture-allowlist.py)
  echo "vulture $(uvx vulture --version 2>/dev/null | awk '{print $2}') over ${#files[@]} file(s), --min-confidence 60"
  uvx vulture --min-confidence 60 "${files[@]}" scripts/vulture-allowlist.py || findings=1
else
  echo "UNRUN: vulture needs uvx (brew install uv) or pipx (brew install pipx; pipx run vulture)."
  unrun=1
fi

echo "== knip (JavaScript)"
if command -v npx >/dev/null 2>&1; then
  scratch=$(mktemp -d "${TMPDIR:-/tmp}/qh-knip.XXXXXX")
  trap 'rm -rf "$scratch"' EXIT
  git archive HEAD | tar -x -C "$scratch"
  # The working tree as it stands: modified tracked files and new untracked ones too
  # (CLAUDE.md §8: git ls-files plus --others --exclude-standard), or a file being
  # added is never scanned before the commit that adds it.
  git ls-files -z -m --others --exclude-standard | while IFS= read -r -d '' f; do mkdir -p "$scratch/$(dirname "$f")"; cp "$f" "$scratch/$f"; done
  printf '%s\n' '{ "name": "qh-dead-code-scan", "private": true, "type": "module" }' > "$scratch/package.json"
  printf '%s\n' '{
  "entry": ["scripts/*.mjs", "plugin/scripts/*.mjs", "tests/*.test.mjs", "tests/*.mjs"],
  "project": ["scripts/**/*.mjs", "plugin/**/*.mjs", "tests/*.mjs"],
  "ignoreExportsUsedInFile": true,
  "ignoreBinaries": ["mkfifo"],
  "ignoreDependencies": ["internal"]
}' > "$scratch/knip.json"
  echo "knip $(cd "$scratch" && npx -y knip@6 --version 2>/dev/null | tail -1), --include-entry-exports"
  (cd "$scratch" && npx -y knip@6 --no-progress --include-entry-exports) || findings=1
else
  echo "UNRUN: knip needs npx (Node.js)."
  unrun=1
fi

if [ "$findings" -ne 0 ]; then echo "dead-code-scan: findings above"; exit 1; fi
if [ "$unrun" -ne 0 ]; then echo "dead-code-scan: UNPROVEN — a scanner could not run"; exit 3; fi
echo "dead-code-scan: every scanner ran and found nothing"

#!/usr/bin/env bash
# unused-names.sh — an import or a local variable nothing in its own file reads (CLAUDE.md §13).
#
# The owner, 2026-10-12: the linters run on every gate, not by hand before a release. The
# pre-release scan could not see this class: vulture matches names across the whole program,
# and knip and orphan-sweep read exports, so an import unused in the file that imports it is
# invisible to all three. About twenty had shipped by then, in plugin/ and in the tests.
#
# Two pinned tools:
#   ruff over the Python (plugin/bin, plugin/lib, scripts, tests): F401 an unused import,
#     F811 a redefined unused name, F841 an unused local. F405 (a name from a star import) is
#     not selected: the gates import the shared fence module with `*` on purpose.
#   biome over the JavaScript: noUnusedImports everywhere, and noUnusedVariables in plugin/
#     and scripts/. In tests/ only imports: a test callback's unused `t`, and a local inside a
#     locked test (CLAUDE.md §2), are not code anyone may delete. plugin/workflows/*.js is not
#     read: a Workflow script returns at the top level, which biome refuses to parse.
#
# A tool that cannot run is UNRUN and exits 3, never clean (ADR-005); so does a tree whose files
# git could not list. Exit 0: every tool ran and found nothing. Exit 1: a finding. Nothing here
# edits the tree.
#
# usage: unused-names.sh [ROOT]   (default: this repository)
set -u
RUFF_VERSION=0.15.6
BIOME_VERSION=2.5.12
here=${BASH_SOURCE[0]%/*}
[ "$here" = "${BASH_SOURCE[0]}" ] && here=.
root=${1:-"$here/.."}
cd "$root" || exit 2
findings=0
unrun=0

# A pinned tool or none: a ruff of another version can disagree about what is unused and still answer clean.
ruff=()
if command -v uvx >/dev/null 2>&1; then ruff=(uvx "ruff@$RUFF_VERSION")
elif command -v python3 >/dev/null 2>&1; then
  installed=$(python3 -m ruff --version 2>/dev/null || true)
  if [ "$installed" = "ruff $RUFF_VERSION" ]; then ruff=(python3 -m ruff)
  elif [ -n "$installed" ]; then ruff_absent="python3 -m ruff is ${installed#ruff }, and this pins $RUFF_VERSION"
  fi
fi
biome=()
if command -v npx >/dev/null 2>&1; then biome=(npx -y "@biomejs/biome@$BIOME_VERSION"); fi

# A verdict needs the tool's own word for it: its clean line, or its own count of findings. Anything else, a non-zero exit
# included, is a tool that could not run (a package that could not be fetched, a runtime that would not start), never a finding.
lint() { # <clean pattern> <finding pattern> <command...>
  local clean=$1 found=$2 out rc
  shift 2
  out=$("$@" 2>&1); rc=$?
  printf '%s\n' "$out"
  if [ "$rc" -eq 0 ] && printf '%s\n' "$out" | grep -Eq "$clean"; then return 0; fi
  if [ "$rc" -ne 0 ] && printf '%s\n' "$out" | grep -Eq "$found"; then findings=1; return 0; fi
  echo "UNRUN: $1 exited $rc without a verdict of its own."
  unrun=1
}

# A listing git could not give reads nothing and says so, and the tools are still asked for, so one run names everything
# that could not look. core.quotePath=false keeps a non-ASCII name readable; a path git still quotes is named, not skipped.
if ! listing=$(git -c core.quotePath=false ls-files --cached --others --exclude-standard 2>/dev/null); then
  echo "UNRUN: git could not list the files of $(pwd)."
  listing=''
  unrun=1
fi
python=() product=() tests=()
while IFS= read -r f; do
  case "$f" in
    '') continue ;;
    '"'*) echo "UNRUN: git quoted a path this cannot read: $f"; unrun=1; continue ;;
    tests/fixtures/*|docs/*|plugin/workflows/*|scripts/vulture-allowlist.py) continue ;;
  esac
  [ -f "$f" ] || continue
  case "$f" in
    *.py) python+=("$f") ;;
    tests/*.mjs|tests/*.cjs|tests/*.js) tests+=("$f") ;;
    *.mjs|*.cjs|*.js) product+=("$f") ;;
    plugin/bin/*|scripts/*)
      case "${f##*/}" in *.*) ;; *) IFS= read -r first <"$f" || true; case "$first" in '#!'*python*) python+=("$f") ;; esac ;; esac ;;
  esac
done < <(printf '%s\n' "$listing")

# A class with nothing in it was not read, which is not the same as clean (ADR-005).
for class in python product tests; do
  eval "count=\${#$class[@]}"
  if [ "$count" -eq 0 ]; then echo "UNRUN: no $class file was listed to read."; unrun=1; fi
done

echo "== ruff (Python: unused imports and locals)"
if [ "${#ruff[@]}" -eq 0 ]; then
  echo "UNRUN: ruff needs uvx (brew install uv) or python3 -m ruff at $RUFF_VERSION (pip install ruff==$RUFF_VERSION)${ruff_absent:+; $ruff_absent}."
  unrun=1
elif [ "${#python[@]}" -gt 0 ]; then
  echo "ruff $RUFF_VERSION over ${#python[@]} file(s), --select F401,F811,F841"
  lint '^All checks passed!$' '^Found [1-9][0-9]* errors?\.$' "${ruff[@]}" check --no-cache --select F401,F811,F841 --output-format concise "${python[@]}"
fi

echo "== biome (JavaScript: unused imports, and unused variables outside tests/)"
if [ "${#biome[@]}" -eq 0 ]; then
  echo "UNRUN: biome needs npx (Node.js)."
  unrun=1
else
  if [ "${#product[@]}" -gt 0 ]; then
    echo "biome $BIOME_VERSION over ${#product[@]} file(s) outside tests/"
    lint '^Checked [1-9][0-9]* files? in ' '^Found [1-9][0-9]* (errors?|warnings?)\.$' "${biome[@]}" lint --error-on-warnings --max-diagnostics=50 --only=correctness/noUnusedImports --only=correctness/noUnusedVariables "${product[@]}"
  fi
  if [ "${#tests[@]}" -gt 0 ]; then
    echo "biome $BIOME_VERSION over ${#tests[@]} file(s) in tests/, imports only"
    lint '^Checked [1-9][0-9]* files? in ' '^Found [1-9][0-9]* (errors?|warnings?)\.$' "${biome[@]}" lint --error-on-warnings --max-diagnostics=50 --only=correctness/noUnusedImports "${tests[@]}"
  fi
fi

if [ "$findings" -ne 0 ]; then echo "unused-names: findings above"; exit 1; fi
if [ "$unrun" -ne 0 ]; then echo "unused-names: UNRUN — a linter could not run"; exit 3; fi
echo "unused-names: every linter ran and found nothing"

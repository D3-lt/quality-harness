#!/usr/bin/env bash
# Fast, advisory syntax/type checks after native Edit/Write tools. Project-owned
# completion checks remain authoritative and run once after the final edit.
set -euo pipefail

tool_name=${1-}
case "$tool_name" in
  Edit|Write|MultiEdit|NotebookEdit) ;;
  *) exit 0 ;;
esac

file_path=${2-}
[ -n "$file_path" ] && [ -f "$file_path" ] || exit 0

find_up() {
  local markers="$1" current="$2" marker parent
  while [ -n "$current" ]; do
    for marker in $markers; do
      [ -e "$current/$marker" ] && { printf '%s' "$current"; return 0; }
    done
    parent=$(dirname "$current")
    [ "$parent" != "$current" ] || break
    current="$parent"
  done
  return 1
}

debounce() {
  local key="$1" marker now last tmp_root
  tmp_root=${TMPDIR:-/tmp}
  case "$tmp_root" in
    [A-Za-z]:\\*|\\\\*) tmp_root=$(printf '%s' "$tmp_root" | tr '\\' '/') ;;
  esac
  marker="$tmp_root/claude-quality-$(printf '%s' "$key" | cksum | awk '{print $1}').last"
  now=$(date +%s)
  last=$(stat -c %Y "$marker" 2>/dev/null || stat -f %m "$marker" 2>/dev/null || echo 0)
  [ $((now - last)) -ge 5 ] || return 1
  touch "$marker"
}

file_dir=$(dirname "$file_path")
case "$file_path" in
  *.js|*.mjs|*.cjs)
    command -v node >/dev/null 2>&1 || exit 0
    # ⚠ NOT `node --check` — TWICE WRONG on a .js file. It reports a SyntaxError on a
    # CORRECT Workflow script (`Illegal return statement`, node 26), and on node 24 it
    # exits 0 on ANY .js file containing an `export`, whatever error follows — so the
    # silence was not evidence either (BACKLOG §161). workflow-parse.mjs accepts a file
    # that parses as an ES module OR as a Workflow script, and refuses the rest.
    # ⚠ `| tail -30 || true` USED TO EAT THE EXIT STATUS ENTIRELY, so a check that
    # CRASHED and a file that was fine looked identical here — the same could-not-look
    # rendered as an all-clear that §161 is about. The status is read, and only 1
    # means "the checker looked and found something".
    # ⚠ THE PARSER'S ABSENCE IS CHECKED FIRST, because node's own MODULE_NOT_FOUND
    # exits 1 — the same code the parser uses for a finding — so a broken install
    # would otherwise print a stack trace under the heading "here is what is wrong
    # with your file".
    parser="$(dirname "$0")/workflow-parse.mjs"
    if [ ! -f "$parser" ]; then
      echo "UNRUN — $parser is missing, so this file is unchecked rather than clean"
      exit 0
    fi
    parse_status=0
    parse_out=$(node "$parser" --js "$file_path" 2>&1) || parse_status=$?
    # ⚠ THE MARKER, NOT THE EXIT CODE, IS WHAT SAYS THE CHECK RAN. An interpreter that
    # dies inside the parser also exits 1, so requiring the parser's own completion
    # line is the only way a stack trace does not get printed as a finding about the
    # user's file. Absence of the marker is could-not-look (ADR-005).
    case "$parse_out" in
      *QH-PARSE-COMPLETE*) ran=yes ;;
      *) ran=no ;;
    esac
    parse_out=$(printf '%s\n' "$parse_out" | grep -v '^QH-PARSE-COMPLETE$' || true)
    if [ "$ran" = no ]; then
      echo "UNRUN — the syntax check did not complete (exit $parse_status); this file is unchecked, not clean"
      printf '%s\n' "$parse_out" | tail -10
    elif [ "$parse_status" = 1 ]; then
      printf '%s\n' "$parse_out" | tail -30
    elif [ "$parse_status" != 0 ]; then
      echo "UNRUN — the syntax check could not look (exit $parse_status); this file is unchecked, not clean"
      printf '%s\n' "$parse_out" | tail -10
    fi
    ;;
  *.sh|*.bash)
    bash -n "$file_path" 2>&1 | tail -30 || true
    ;;
  *.json)
    command -v jq >/dev/null 2>&1 || exit 0
    jq empty "$file_path" 2>&1 | tail -30 || true
    ;;
  *.rs)
    project=$(find_up 'Cargo.toml' "$file_dir") || exit 0
    find_up '.claude/hooks/post_edit.py' "$file_dir" >/dev/null 2>&1 && exit 0
    debounce "rs:$project" || exit 0
    command -v cargo >/dev/null 2>&1 || exit 0
    (cd "$project" && cargo check --workspace --message-format=short 2>&1 | tail -40) || true
    ;;
  *.ts|*.tsx)
    project=$(find_up 'tsconfig.json' "$file_dir") || exit 0
    debounce "ts:$project" || exit 0
    command -v npx >/dev/null 2>&1 || exit 0
    (cd "$project" && npx --no-install tsc --noEmit 2>&1 | tail -40) || true
    ;;
  *.py)
    project=$(find_up 'pyproject.toml setup.py setup.cfg requirements.txt Pipfile .venv' "$file_dir" || true)
    if [ -n "$project" ] && command -v ruff >/dev/null 2>&1; then
      debounce "py:$project" || exit 0
      (cd "$project" && ruff check "$file_path" 2>&1 | tail -40) || true
    else
      debounce "py:$file_path" || exit 0
      command -v python3 >/dev/null 2>&1 || exit 0
      python3 -B -c 'import ast, pathlib, sys; ast.parse(pathlib.Path(sys.argv[1]).read_text(), filename=sys.argv[1])' \
        "$file_path" 2>&1 | tail -30 || true
    fi
    ;;
  *.php)
    debounce "php:$file_path" || exit 0
    command -v php >/dev/null 2>&1 || exit 0
    php -l "$file_path" 2>&1 | tail -30 || true
    ;;
  *.go)
    project=$(find_up 'go.mod' "$file_dir") || exit 0
    debounce "go:$project" || exit 0
    command -v go >/dev/null 2>&1 || exit 0
    (cd "$project" && go build ./... 2>&1 | tail -40) || true
    ;;
esac

#!/usr/bin/env bash
# Fast, advisory syntax/type checks after native Edit/Write tools. Project-owned
# completion checks remain authoritative and run once after the final edit.
set -euo pipefail

input=$(cat)
tool_name=$(printf '%s' "$input" | jq -r '.tool_name // ""')
case "$tool_name" in
  Edit|Write|MultiEdit|NotebookEdit) ;;
  *) exit 0 ;;
esac

file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // ""')
[ -n "$file_path" ] && [ -f "$file_path" ] || exit 0

find_up() {
  local markers="$1" current="$2" marker
  while [ "$current" != "/" ] && [ -n "$current" ]; do
    for marker in $markers; do
      [ -e "$current/$marker" ] && { printf '%s' "$current"; return 0; }
    done
    current=$(dirname "$current")
  done
  return 1
}

debounce() {
  local key="$1" marker now last
  marker="${TMPDIR:-/tmp}/claude-quality-$(printf '%s' "$key" | shasum | awk '{print $1}').last"
  now=$(date +%s)
  last=$(stat -f %m "$marker" 2>/dev/null || echo 0)
  [ $((now - last)) -ge 5 ] || return 1
  touch "$marker"
}

file_dir=$(dirname "$file_path")
case "$file_path" in
  *.js|*.mjs|*.cjs)
    command -v node >/dev/null 2>&1 || exit 0
    node --check "$file_path" 2>&1 | tail -30 || true
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

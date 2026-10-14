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
  # ADR-102: a `.js` or `.jsx` file's dialect (ES module, CommonJS, Workflow script, JSX,
  # Flow) cannot be known from the file, and what this hook prints reaches the agent, where
  # a finding about a valid file is worse than none. Neither is checked.
  *.js|*.jsx)
    ;;
  *.cjs)
    # Always CommonJS, so node's own parser is the authority, and the §161 hazard below (a
    # `.js` carrying `export`) cannot occur in it (ADR-102).
    command -v node >/dev/null 2>&1 || exit 0
    # The error alone: node follows it with its own stack frames, a version line and blank
    # lines, none of which is about the edited file (ADR-102 T4).
    if ! cjs_out=$(node --check "$file_path" 2>&1); then
      cjs_said=$(printf '%s\n' "$cjs_out" | { grep -v -e '^    at ' -e '^Node\.js v' -e '^[[:space:]]*$' || true; } | tail -30)
      # A checker that failed without a word could not look: never silence, never exit 1 (ADR-102 T6).
      printf '%s\n' "${cjs_said:-UNRUN — node --check failed without a diagnostic; $file_path is unchecked, not clean}"
    fi
    ;;
  *.mjs)
    # An ES module only: node's module goal is the only one a `.mjs` has, and the Workflow
    # fallback once accepted a `.mjs` carrying a top-level `return` silently.
    parse_mode=--module
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
    # ⚠ SEPARATE CHANNELS: the marker is read from STDOUT ALONE. Merged with stderr,
    # a parser that died could have the exact line `QH-PARSE-COMPLETE` echoed back
    # inside node's own syntax diagnostic of the corrupt source, which set `ran=yes`
    # and presented a crash as a finding about the user's file. Diagnostics cannot
    # reach the protocol channel now.
    parse_status=0
    parse_err=$(mktemp 2>/dev/null) || {
      echo "UNRUN — no temporary file for the checker's diagnostics, so this file is unchecked"
      exit 0
    }
    parse_out=$(node "$parser" "$parse_mode" "$file_path" 2>"$parse_err") || parse_status=$?
    parse_diag=$(cat "$parse_err" 2>/dev/null || true)
    rm -f "$parse_err"
    # ⚠ AN EXACT LINE, ON STDOUT ALONE. A `case` glob accepted the token ANYWHERE in
    # the output, and merging stderr let node echo it back inside its own diagnostic
    # of a corrupt parser — both made a crash read as a finding about the user's file.
    # The loop is pure shell: `grep -v … || true` could not tell its own exit 1
    # (nothing matched) from exit 2 (grep itself failed), which turned a real finding
    # plus a failed filter into silence.
    ran=no
    while IFS= read -r line || [ -n "$line" ]; do
      case "$line" in
        QH-PARSE-COMPLETE|QH-PARSE-COMPLETE$'\r') ran=yes ;;
      esac
    done <<PARSE_OUT
$parse_out
PARSE_OUT
    if [ "$ran" = no ]; then
      echo "UNRUN — the syntax check did not complete (exit $parse_status); this file is unchecked, not clean"
      printf '%s\n' "$parse_diag" | tail -10
    elif [ "$parse_status" = 1 ]; then
      printf '%s\n' "$parse_diag" | tail -30
    elif [ "$parse_status" != 0 ]; then
      echo "UNRUN — the syntax check could not look (exit $parse_status); this file is unchecked, not clean"
      printf '%s\n' "$parse_diag" | tail -10
    fi
    ;;
  *.sh|*.bash)
    bash -n "$file_path" 2>&1 | tail -30 || true
    ;;
  *.json)
    command -v jq >/dev/null 2>&1 || exit 0
    if ! json_out=$(jq empty "$file_path" 2>&1); then
      # Named only when it is not JSONC either, read as TypeScript's parser reads it: a leading
      # BOM is dropped, a line comment ends at CR or LF, a comment becomes a space (so it cannot
      # join two halves of a token), then trailing commas go, and the rest must parse (ADR-102 T3, T6).
      if command -v node >/dev/null 2>&1 && node -e 'const t = require("fs").readFileSync(process.argv[1], "utf8").replace(/^\uFEFF/, "").replace(/("(?:\\.|[^"\\])*")|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g, (m, s) => s ?? " ").replace(/("(?:\\.|[^"\\])*")|(?<![\[{,]\s*),(?=\s*[}\]])/g, (m, s) => s ?? ""); JSON.parse(t)' "$file_path" 2>/dev/null; then
        :
      else
        # jq names no file; the agent is told which one (ADR-102 T4).
        printf '%s: %s\n' "$file_path" "$(printf '%s\n' "$json_out" | tail -30)"
      fi
    fi
    ;;
  # Project-wide TypeScript, Rust and Go checks belong in explicit acceptance
  # commands. A per-edit debounce neither bounds their cost nor prevents overlap.
  *.ts|*.tsx|*.rs|*.go)
    ;;
  *.py)
    debounce "py:$file_path" || exit 0
    command -v python3 >/dev/null 2>&1 || exit 0
    # Syntax only, with warnings off: a SyntaxWarning (an invalid escape) is not an error, and
    # lint debt in a file the agent touched is not a syntax error, so ruff is not run (ADR-102).
    # The error itself, as path:line:column, never a traceback through `<string>` and ast.py
    # (ADR-102 T4); bytes, so a coding cookie is honoured and an undecodable file is named too. A console that cannot
    # encode the source line (Windows' cp1252) escapes it, rather than raising inside the handler (ADR-102 T8).
    python3 -W ignore -B -c '
import ast, pathlib, sys
sys.stdout.reconfigure(errors="backslashreplace")
path = sys.argv[1]
try:
    ast.parse(pathlib.Path(path).read_bytes(), filename=path)
except SyntaxError as error:
    print(f"{path}:{error.lineno}:{error.offset}: SyntaxError: {error.msg}")
    if error.text:
        print(error.text.rstrip())
except ValueError as error:
    print(f"{path}: could not be read as Python source ({type(error).__name__}: {error})")
' "$file_path" 2>&1 | tail -30 || true
    ;;
  *.php)
    debounce "php:$file_path" || exit 0
    command -v php >/dev/null 2>&1 || exit 0
    # php -l says `No syntax errors detected` on a clean file and exits 255 on an error
    # (measured 2026-10-14), so only a failing run is printed (ADR-102).
    # The display only, the log off, whatever the host php.ini says: by default php -l printed the
    # parse error twice, once to each (ADR-102 T5).
    if ! php_out=$(php -d display_errors=1 -d log_errors=0 -l "$file_path" 2>&1); then
      php_said=$(printf '%s\n' "$php_out" | { grep -v '^[[:space:]]*$' || true; } | tail -30)
      printf '%s\n' "${php_said:-UNRUN — php -l failed without a diagnostic; $file_path is unchecked, not clean}"
    fi
    ;;
esac

#!/usr/bin/env bash
set -euo pipefail
# BACKLOG §130: no child of this runner outlives it. Whatever a test left
# behind — a fence, a probe, a heartbeat — is killed when the shell exits, and
# the last step below asserts nothing is still attached, so a leak is a red run
# here rather than a hot laptop later.
if command -v pkill >/dev/null 2>&1; then trap 'pkill -P $$ 2>/dev/null || true' EXIT; fi

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
# ADR-008 split the two: the tests live in the repository, the thing they
# check lives under it. `source` in marketplace.json names this directory,
# and the shipped-set test in tests/package.test.mjs is what keeps the two
# from disagreeing.
ROOT="$REPO/plugin"

# The manifest/skill validation needs the Claude Code CLI. Where it is absent
# the run says so and the final line downgrades to PARTIAL — a check that
# silently vanishes is the failure mode this project exists to prevent. CI sets
# QUALITY_HARNESS_REQUIRE_CLI=1 so the absence is an error there, where the CLI
# is installed on purpose.
verdict="PASS — quality-harness is self-contained and verified."
if command -v claude >/dev/null 2>&1; then
  claude plugin validate --strict "$REPO"
  claude plugin validate --strict "$ROOT/.claude-plugin/plugin.json"
  claude plugin validate --strict "$ROOT/skills"
elif [ "${QUALITY_HARNESS_REQUIRE_CLI:-0}" = "1" ]; then
  printf 'FAIL — the Claude Code CLI is required here and was not found on PATH.\n' >&2
  exit 1
else
  printf 'SKIPPED — claude plugin validate (CLI not on PATH); manifest and skill metadata unvalidated.\n'
  verdict="PARTIAL — tests and syntax checks passed; plugin validation was skipped."
fi

# QUALITY_HARNESS_TAP names a file to receive a TAP transcript alongside the
# normal output. It exists for BACKLOG §49: a Windows run failed once at FILE
# level — `✖ …\lifecycle.test.mjs`, location `1:1`, message `'test failed'` —
# naming no subtest anywhere in the log, so the next occurrence would cost the
# same investigation as the first. TAP reports each subtest as it completes, so
# the transcript names how far the file got even when the run dies without a
# failing assertion to report. Off by default: it is a diagnostic, not a gate,
# and nothing reads the file here.
if [ -n "${QUALITY_HARNESS_TAP:-}" ]; then
  node --test \
    --test-reporter=spec --test-reporter-destination=stdout \
    --test-reporter=tap --test-reporter-destination="$QUALITY_HARNESS_TAP" \
    "$REPO"/tests/*.test.mjs
else
  node --test "$REPO"/tests/*.test.mjs
fi

# The gates are the extensionless files; bin/*.cmd are Windows shims.
# `-f` is not decoration: a `__pycache__/` left in bin by any process that
# imported a gate has no extension either, and ast.parse died on it with "Is a
# directory" — the gate CRASHED instead of reporting, after every test had
# already passed. A check whose answer depends on what is on your disk is
# CLAUDE.md §8; tests/gates.test.mjs carried the same defect and was fixed
# 2026-08-29, and this second copy was found the same day by walking into it.
for file in "$ROOT"/bin/*; do
  case "$file" in *.*) continue ;; esac
  [ -f "$file" ] || continue
  python3 -B -c 'import ast, pathlib, sys; ast.parse(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"), filename=sys.argv[1])' "$file"
done

for file in "$ROOT"/scripts/*.sh; do
  bash -n "$file"
done

node --check "$ROOT/scripts/lifecycle.mjs"
node --check "$ROOT/scripts/run-shell-hook.mjs"
node --check "$ROOT/scripts/verify.mjs"
node --check "$ROOT/workflows/consensus.js"
node --check "$ROOT/workflows/quality-cycle.js"
node --check "$ROOT/workflows/review-ring.js"

# §130: a child still attached to this shell at the end is a leak, and a leak is
# not a pass. Direct children only — a grandchild that reparented is out of
# reach here, which is what the gates' own tree kill is for. Without pgrep the
# check is UNRUN and says so; it never reads "no children" (ADR-005).
#
# ⚠ THE FIRST SHAPE OF THIS CHECK MEASURED ITSELF. `leftover=$(pgrep -P $$
# 2>/dev/null)` reported one survivor on every Ubuntu run (33951187877,
# 33952517573) and none on macOS: bash 5.2 execs a bare command substitution
# in place, but the redirection defeats that, so it forks a subshell — a direct
# child of $$ — and pgrep, which excludes only itself, reports the subshell.
# bash 3.2 on macOS never matched. So pgrep writes to a file from THIS shell,
# where it is the direct child and excludes itself, and a survivor is named
# rather than only numbered: a bare "13461" attributes to nobody (BACKLOG §129).
if ! command -v pgrep >/dev/null 2>&1; then
  printf 'leak check UNRUN — pgrep is not available on this host, so nothing here says the suite left no child\n' >&2
else
  leak_list=$(mktemp)
  pgrep -P $$ >"$leak_list" 2>/dev/null || true
  if [ -s "$leak_list" ]; then
    printf 'FAIL — child process(es) still running after the suite:\n' >&2
    ps -o pid,ppid,etime,args -p "$(tr '\n' ',' <"$leak_list" | sed 's/,$//')" >&2 || cat "$leak_list" >&2
    rm -f "$leak_list"
    exit 1
  fi
  rm -f "$leak_list"
fi

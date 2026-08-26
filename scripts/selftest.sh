#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

# The manifest/skill validation needs the Claude Code CLI. Where it is absent
# the run says so and the final line downgrades to PARTIAL — a check that
# silently vanishes is the failure mode this project exists to prevent. CI sets
# QUALITY_HARNESS_REQUIRE_CLI=1 so the absence is an error there, where the CLI
# is installed on purpose.
verdict="PASS — quality-harness is self-contained and verified."
if command -v claude >/dev/null 2>&1; then
  claude plugin validate --strict "$ROOT"
  claude plugin validate --strict "$ROOT/.claude-plugin/plugin.json"
  claude plugin validate --strict "$ROOT/skills"
elif [ "${QUALITY_HARNESS_REQUIRE_CLI:-0}" = "1" ]; then
  printf 'FAIL — the Claude Code CLI is required here and was not found on PATH.\n' >&2
  exit 1
else
  printf 'SKIPPED — claude plugin validate (CLI not on PATH); manifest and skill metadata unvalidated.\n'
  verdict="PARTIAL — tests and syntax checks passed; plugin validation was skipped."
fi

node --test "$ROOT"/tests/*.test.mjs

# The gates are the extensionless files; bin/*.cmd are Windows shims.
for file in "$ROOT"/bin/*; do
  case "$file" in *.*) continue ;; esac
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

printf '%s\n' "$verdict"

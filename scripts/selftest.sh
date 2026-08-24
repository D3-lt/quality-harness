#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

claude plugin validate --strict "$ROOT"
claude plugin validate --strict "$ROOT/.claude-plugin/plugin.json"
claude plugin validate --strict "$ROOT/skills"
node --test "$ROOT"/tests/*.test.mjs

for file in "$ROOT"/bin/*; do
  python3 -B -c 'import ast, pathlib, sys; ast.parse(pathlib.Path(sys.argv[1]).read_text(), filename=sys.argv[1])' "$file"
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

printf 'PASS — quality-harness is self-contained and verified.\n'

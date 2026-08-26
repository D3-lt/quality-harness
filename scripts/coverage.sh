#!/usr/bin/env bash
# coverage.sh — measure this project's own test coverage and hold a floor.
#
# Two surfaces, measured separately because they are executed differently:
#   * the JavaScript hooks, measured by node's own coverage over tests/*.test.mjs
#   * the Python gates in bin/, which the same suite drives as SUBPROCESSES, so
#     they need coverage.py started inside each child (COVERAGE_PROCESS_START).
#
# The floors are a ratchet, not a target: they sit just under the measured value
# so a regression fails and an improvement is free. Raise them when the measured
# number moves up for good. `--report` prints the numbers without enforcing.
#
# Exit: 0 = every measured surface is at or above its floor
#       1 = a floor was breached, or a required measurement could not run
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
MODE=${1-}

# Floors. Measured 2026-08-25 (Wave 3): js 94.92 line / 85.43 branch / 95.59 funcs,
# python 83%. Every gate in bin/ is now at or above 69%; the whole surface was at
# 63% before the plan's waves, with adr-verify — the anti-fabrication tool — the
# least covered file in the repository at 47%. The JS branch figure sits close to
# its floor on purpose: it is held, not padded.
JS_LINES=${QUALITY_HARNESS_JS_LINES:-94}
JS_BRANCHES=${QUALITY_HARNESS_JS_BRANCHES:-85}
JS_FUNCTIONS=${QUALITY_HARNESS_JS_FUNCTIONS:-95}
PY_TOTAL=${QUALITY_HARNESS_PY_TOTAL:-82}

# A measurement that cannot run is not a pass. Locally a missing coverage.py is
# reported and skipped; CI sets this so the same absence fails the build.
STRICT=${QUALITY_HARNESS_COVERAGE_STRICT:-0}

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# The floor measures the PLUGIN, not the tools that test it. mutate.mjs is a test
# runner: it rewrites source and restores it, so importing it to exercise its
# functions would run a mutation campaign inside the coverage run. Its own guards
# are asserted through its CLI in tests/gate-rules.test.mjs, which is a
# subprocess and therefore invisible to --experimental-test-coverage. Excluding
# it is honest; letting it drag the floor down until someone lowers the floor is
# not, because the floor is what protects everything else.
# Both excludes, not one: passing --test-coverage-exclude REPLACES node's default,
# which is what keeps the test files themselves out of the report. Excluding only
# mutate.mjs pulled every tests/*.mjs in at ~100% and lifted "all files" from
# 93.6% to 97.9% — a floor that measures its own tests measures nothing.
js_flags=(--test-coverage-exclude='**/tests/**' --test-coverage-exclude='scripts/mutate.mjs')
if [ "$MODE" != "--report" ]; then
  js_flags+=(
    "--test-coverage-lines=$JS_LINES"
    "--test-coverage-branches=$JS_BRANCHES"
    "--test-coverage-functions=$JS_FUNCTIONS"
  )
fi

printf '== JavaScript hooks ==\n'
# ${a[@]+"${a[@]}"} — not "${a[@]}". Under `set -u`, bash 3.2 (still the system
# bash on macOS) treats an EMPTY array's expansion as an unbound variable and
# aborts. `--report` deliberately leaves js_flags empty, so the one mode that
# exists to read the numbers was the one mode that could not run there.
node --test --experimental-test-coverage ${js_flags[@]+"${js_flags[@]}"} "$ROOT"/tests/*.test.mjs \
  > "$WORK/js.log" 2>&1 || js_status=$?
js_status=${js_status:-0}
sed -n '/start of coverage report/,/end of coverage report/p' "$WORK/js.log" \
  | grep -Ev '^ℹ -+$' || true
if [ "$js_status" -ne 0 ]; then
  printf '\nFAIL — JavaScript coverage is below the floor (lines %s / branches %s / functions %s).\n' \
    "$JS_LINES" "$JS_BRANCHES" "$JS_FUNCTIONS"
  printf 'Add a test for the uncovered lines listed above, or lower the floor deliberately.\n'
  exit 1
fi

printf '\n== Python gates (bin/) ==\n'
# The gates run as children of the JS suite, so coverage has to start itself
# inside every Python process the suite spawns rather than wrapping one command.
if ! python3 -c 'import coverage' >/dev/null 2>&1; then
  printf 'SKIPPED — coverage.py is not importable by python3.\n'
  printf '  Install it (pip install coverage) to measure the gates in bin/.\n'
  if [ "$STRICT" = "1" ]; then
    printf 'FAIL — QUALITY_HARNESS_COVERAGE_STRICT=1 and the gates could not be measured.\n'
    exit 1
  fi
  printf '\nPARTIAL — JavaScript floors held; the Python gates were not measured.\n'
  exit 0
fi

mkdir -p "$WORK/hook"
cat > "$WORK/hook/sitecustomize.py" <<'PY'
# Started by every python3 the suite spawns, so a gate invoked as a subprocess
# is measured too. Silent on failure: a coverage hook must never break a gate.
try:
    import coverage
    coverage.process_startup()
except Exception:
    pass
PY
cat > "$WORK/coverage.cfg" <<CFG
[run]
branch = True
parallel = True
data_file = $WORK/.coverage
source = $ROOT/bin
CFG

(
  cd "$ROOT"
  PYTHONPATH="$WORK/hook${PYTHONPATH:+:$PYTHONPATH}" \
  COVERAGE_PROCESS_START="$WORK/coverage.cfg" \
    node --test "$ROOT"/tests/*.test.mjs > "$WORK/py-suite.log" 2>&1
) || {
  printf 'FAIL — the suite did not pass while measuring the gates.\n'
  tail -20 "$WORK/py-suite.log"
  exit 1
}

python3 -m coverage combine --rcfile="$WORK/coverage.cfg" >/dev/null 2>&1 || true
if [ "$MODE" = "--report" ]; then
  python3 -m coverage report --rcfile="$WORK/coverage.cfg" --sort=cover
  printf '\nREPORT — no floor enforced (--report).\n'
  exit 0
fi
if ! python3 -m coverage report --rcfile="$WORK/coverage.cfg" --sort=cover \
     --fail-under="$PY_TOTAL"; then
  printf '\nFAIL — Python gate coverage is below %s%%.\n' "$PY_TOTAL"
  printf 'Add a case to tests/gates.test.mjs or tests/gate-regressions.py.\n'
  exit 1
fi

printf '\nPASS — coverage holds its floor on both surfaces.\n'

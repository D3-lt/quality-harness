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

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
# ADR-008: the tests are the repository's, the measured surface is the plugin's.
ROOT="$REPO/plugin"
# ADR-126 T2: one surface per CI job, so the two passes of the suite run in parallel rather than in series (53 min, 2026-10-22).
# Neither floor moves; with no surface named, both are measured, as before.
MODE=
SURFACE=both
# ADR-139 T2: `--python --shard <i>/<n> --out <dir>` measures one slice of the suite (scripts/test-slice.mjs) and leaves its
# coverage.py data in <dir> unjudged; QUALITY_HARNESS_COVERAGE_SHARDS=<dir> with QUALITY_HARNESS_COVERAGE_SHARD_COUNT=<n> makes
# `--python` the fan-in instead: it combines every shard's data (scripts/coverage-combine.sh) and judges the floor once.
SHARD=
OUT=
usage() { printf 'usage: coverage.sh [--report] [--js | --python [--shard <i>/<n> --out <dir>]]\n' >&2; exit 2; }
while [ "$#" -gt 0 ]; do
  case "$1" in
    --report) MODE=--report ;;
    --js) SURFACE=js ;;
    --python) SURFACE=python ;;
    --shard) [ "$#" -ge 2 ] || usage; SHARD=$2; shift ;;
    --out) [ "$#" -ge 2 ] || usage; OUT=$2; shift ;;
    *) usage ;;
  esac
  shift
done
if [ -n "$SHARD$OUT" ] && { [ "$SURFACE" != python ] || [ -z "$SHARD" ] || [ -z "$OUT" ]; }; then
  printf 'coverage.sh: --shard and --out go together, with --python only\n' >&2
  exit 2
fi
# A bad <i>/<n> is refused before anything is built: test-slice.mjs owns the grammar.
if [ -n "$SHARD" ]; then node "$REPO/scripts/test-slice.mjs" "$SHARD" >/dev/null || exit 2; fi
# ADR-139 T3: the JavaScript floor runs serially unless QUALITY_HARNESS_JS_CONCURRENCY=default; any other value is refused, so a
# typo never silently changes how the floor is measured. The serial run is the deterministic one (see the node line below); the
# probe job measures default concurrency beside it until five landings show the two agree.
if [ -z "${QUALITY_HARNESS_JS_CONCURRENCY+set}" ]; then
  js_concurrency=(--test-concurrency=1)
elif [ "$QUALITY_HARNESS_JS_CONCURRENCY" = default ]; then
  js_concurrency=()
else
  printf 'coverage.sh: QUALITY_HARNESS_JS_CONCURRENCY="%s" is not "default" (unset runs the floor serially)\n' "$QUALITY_HARNESS_JS_CONCURRENCY" >&2
  exit 2
fi
# ADR-126 T3: the suite's own observe budget, as scripts/selftest.sh sets it (CLAUDE.md §7).
export QUALITY_HARNESS_OBSERVE_BUDGET_MS=60000

# Floors. Measured 2026-08-25 (Wave 3): js 94.92 line / 85.43 branch / 95.59 funcs,
# python 83%. Every gate in bin/ is now at or above 69%; the whole surface was at
# 63% before the plan's waves, with adr-verify — the anti-fabrication tool — the
# least covered file in the repository at 47%. The JS branch figure sits close to
# its floor on purpose: it is held, not padded.
JS_LINES=${QUALITY_HARNESS_JS_LINES:-94}
# 84, not 85, and the difference is a correction rather than a concession.
# The 85 was calibrated while measurement was NOISY-HIGH: parallel runs sometimes
# double-counted in-process paths and reported up to 97.00 lines / 85.43 branches
# on a tree that serially measures 94.85 / 85.31. Once --test-concurrency=1 made
# the numbers honest, branches settled at 85.09-85.42 locally and 84.97 on CI —
# straddling a floor derived from the inflated regime, which is why CI failed on
# a tree nobody had regressed.
#
# Lines and functions are UNCHANGED: they hold their floors with room to spare.
# Only branches were calibrated against noise, and only branches move.
#
# This is not "lower it until it passes". The gap is named and owned:
# scripts/sync-standalone.mjs 72.73, scripts/work-next.mjs 74.58,
# scripts/adr-state.mjs 80.85 — raising those raises this back, and BACKLOG §34
# carries the work. Raise this number when they do; do not raise it by hand.
JS_BRANCHES=${QUALITY_HARNESS_JS_BRANCHES:-84}
JS_FUNCTIONS=${QUALITY_HARNESS_JS_FUNCTIONS:-95}
PY_TOTAL=${QUALITY_HARNESS_PY_TOTAL:-82}

# A measurement that cannot run is not a pass. Locally a missing coverage.py is
# reported and skipped; CI sets this so the same absence fails the build.
STRICT=${QUALITY_HARNESS_COVERAGE_STRICT:-0}

# ADR-139 T2: the Python floor's fan-in judges the shards' data and runs no suite, so it builds nothing.
if [ -n "${QUALITY_HARNESS_COVERAGE_SHARDS:-}" ]; then
  if [ "$SURFACE" != python ] || [ -n "$SHARD" ]; then
    printf 'coverage.sh: QUALITY_HARNESS_COVERAGE_SHARDS is the Python fan-in: use it with --python alone\n' >&2
    exit 2
  fi
  exec bash "$REPO/scripts/coverage-combine.sh" "$QUALITY_HARNESS_COVERAGE_SHARDS" "${QUALITY_HARNESS_COVERAGE_SHARD_COUNT:-}" \
    "$ROOT" "$PY_TOTAL" ${MODE:+"$MODE"}
fi

# QH_COVERAGE_DRY=1 prints the JavaScript command's leading flags and runs nothing (tests/js-floor-probe.test.mjs).
if [ "${QH_COVERAGE_DRY:-0}" = 1 ]; then
  printf 'js command: node --test %s--experimental-test-coverage …\n' "${js_concurrency[*]+${js_concurrency[*]} }"
  exit 0
fi
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# CLI compatibility tests use this checkout's core, shared by the coverage workers.
QUALITY_HARNESS_QH_BIN="$WORK/qh"
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) QUALITY_HARNESS_QH_BIN="$QUALITY_HARNESS_QH_BIN.exe" ;; esac
node "$REPO/scripts/build-core.mjs" --native "$QUALITY_HARNESS_QH_BIN"
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) QUALITY_HARNESS_QH_BIN=$(cygpath -w "$QUALITY_HARNESS_QH_BIN") ;; esac
export QUALITY_HARNESS_QH_BIN
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

if [ "$SURFACE" != python ]; then
printf '== JavaScript hooks ==\n'
# ${a[@]+"${a[@]}"} — not "${a[@]}". Under `set -u`, bash 3.2 (still the system
# bash on macOS) treats an EMPTY array's expansion as an unbound variable and
# aborts. `--report` deliberately leaves js_flags empty, so the one mode that
# exists to read the numbers was the one mode that could not run there.
# --test-concurrency=1 is what makes this gate deterministic, and it is not a
# performance preference. `--experimental-test-coverage` measures only the parent
# process; NINE of fourteen test files here spawn subprocesses, so a line counts
# as covered when a test imports it and uncovered when a test spawns it. Run the
# files in parallel and which path wins varies per run.
#
# Measured 2026-08-27 on an unchanged tree. Parallel, ten runs: nine passed
# between 94.83 and 97.00 lines and ONE FAILED at 78.52 — a gate rejecting good
# code a tenth of the time, which teaches an agent that re-running is a valid
# response to red. Serial, ten runs: 94.83-94.85, spread 0.02, no failures.
# The cost is about 20s against 8s, which is nothing next to a flapping verdict.
node --test ${js_concurrency[@]+"${js_concurrency[@]}"} --experimental-test-coverage ${js_flags[@]+"${js_flags[@]}"} "$REPO"/tests/*.test.mjs \
  > "$WORK/js.log" 2>&1 || js_status=$?
js_status=${js_status:-0}
sed -n '/start of coverage report/,/end of coverage report/p' "$WORK/js.log" \
  | grep -Ev '^ℹ -+$' || true
if [ "$js_status" -ne 0 ]; then
  # `node --test` exits non-zero for a FAILING TEST and for a breached floor
  # alike, and this used to report both as the floor. On 2026-08-27 a forbidden
  # path in a new test comment was announced as "coverage is below the floor",
  # and the numbers printed above it were all above their floors — so the report
  # contradicted itself and the real failure was named nowhere. A gate that
  # misnames what broke sends people to fix the wrong thing.
  if grep -q '^✖ failing tests:' "$WORK/js.log"; then
    printf '\nFAIL — a JavaScript test failed, so coverage was not judged.\n'
    sed -n '/^✖ failing tests:/,$p' "$WORK/js.log" | head -40
    exit 1
  fi
  printf '\nFAIL — JavaScript coverage is below the floor (lines %s / branches %s / functions %s).\n' \
    "$JS_LINES" "$JS_BRANCHES" "$JS_FUNCTIONS"
  printf 'Add a test for the uncovered lines listed above, or lower the floor deliberately.\n'
  exit 1
fi
fi

if [ "$SURFACE" != js ]; then
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
  printf '\nPARTIAL — the Python gates were not measured.\n'
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
# A shard keeps its data where the workflow uploads it from; the whole-suite run keeps it in $WORK.
PY_DATA=$WORK
py_tests=("$REPO"/tests/*.test.mjs)
if [ -n "$SHARD" ]; then
  mkdir -p "$OUT"
  PY_DATA=$(cd "$OUT" && pwd)
  all_tests=()
  for test_file in "$REPO"/tests/*.test.mjs; do all_tests+=("tests/${test_file##*/}"); done
  py_tests=()
  while IFS= read -r test_file; do py_tests+=("$REPO/$test_file"); done < <(node "$REPO/scripts/test-slice.mjs" "$SHARD" "${all_tests[@]}")
  if [ "${#py_tests[@]}" = 0 ]; then printf 'coverage.sh: shard %s holds no test file\n' "$SHARD" >&2; exit 2; fi
  printf 'shard %s: %s of %s test files, first %s\n' "$SHARD" "${#py_tests[@]}" "${#all_tests[@]}" "${py_tests[0]##*/}"
fi
cat > "$WORK/coverage.cfg" <<CFG
[run]
branch = True
parallel = True
data_file = $PY_DATA/.coverage
source =
    $ROOT/bin
    $ROOT/lib
CFG

(
  cd "$REPO"
  PYTHONPATH="$WORK/hook${PYTHONPATH:+:$PYTHONPATH}" \
  COVERAGE_PROCESS_START="$WORK/coverage.cfg" \
    node --test "${py_tests[@]}" > "$WORK/py-suite.log" 2>&1
) || {
  printf 'FAIL — the suite did not pass while measuring the gates.\n'
  # The whole failing-tests block, not a fixed tail: twenty lines cut a failing test's own output
  # off above its assertion, so a failure that appears only here could not be diagnosed from CI
  # (BACKLOG §324). The block is the reporter's last section, so from its header to the end.
  if grep -q '^✖ failing tests:' "$WORK/py-suite.log"; then
    sed -n '/^✖ failing tests:/,$p' "$WORK/py-suite.log" | head -400
  else
    tail -60 "$WORK/py-suite.log"
  fi
  exit 1
}

if [ -n "$SHARD" ]; then
  printf 'SHARD — %s measured; its data is in %s, for the fan-in to combine and judge.\n' "$SHARD" "$PY_DATA"
  exit 0
fi
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
fi

printf '\nPASS — coverage holds its floor on the %s surface(s) measured.\n' "$SURFACE"

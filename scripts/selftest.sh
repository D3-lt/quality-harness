#!/usr/bin/env bash
set -euo pipefail
# BACKLOG §130: no child of this runner outlives it. Whatever a test left
# behind — a fence, a probe, a heartbeat — is killed when the shell exits, and
# the last step below asserts nothing is still attached, so a leak is a red run
# here rather than a hot laptop later.
#
# BACKLOG §310: nor does a temp directory. Tests, and every gate and hook they spawn,
# write through os.tmpdir() and Python's tempfile, which read TMPDIR/TMP/TEMP, so the
# run writes under one directory this script owns and removes on exit, a run cut
# short included. A peer session found 65,904 leaked `qh-*` directories on one Mac
# (2026-09-28); what the tests still forget is named at the end, then removed.
# Not on Windows: a CI runner there is discarded after the job, and a longer temp
# prefix eats into MAX_PATH under fixtures that are measured against it.
QH_RUN_TMP=''
QH_LEASES=''
cleanup() {
  if command -v pkill >/dev/null 2>&1; then pkill -P $$ 2>/dev/null || true; fi
  # A grandchild re-parented to pid 1 is out of pkill -P's reach; it still names this run's directory.
  if [ -n "$QH_RUN_TMP" ]; then node "$REPO/scripts/run-orphans.mjs" "$QH_RUN_TMP" --grace-ms 0 --kill >/dev/null 2>&1 || true; fi
  if [ -n "$QH_RUN_TMP" ]; then rm -rf "${QH_RUN_TMP:?}"; fi
  if [ -n "$QH_LEASES" ]; then rm -rf "${QH_LEASES:?}"; fi
}
trap cleanup EXIT
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) ;;
  *)
    QH_RUN_TMP=$(mktemp -d "${TMPDIR:-/tmp}/qh-selftest.XXXXXX")
    export TMPDIR="$QH_RUN_TMP" TMP="$QH_RUN_TMP" TEMP="$QH_RUN_TMP"
    ;;
esac
# ADR-077: the tests never read or leave the machine's leases, and nothing in them waits its turn.
QH_LEASES=$(mktemp -d "${TMPDIR:-/tmp}/qh-leases.XXXXXX")
export QUALITY_HARNESS_LEASE_DIR="$QH_LEASES"
unset QUALITY_HARNESS_WAIT
# ADR-120 T4: a session's own SessionStart exports QH_PLUGIN_ROOT, and every resolver prefers it, so a suite run from such a
# session tested that session's plugin rather than the shapes the resolver tests build (measured 2026-10-21: six resolver
# and qh-root tests failed only there). The tests that are about it set it themselves (tests/plugin-root.test.mjs).
unset QH_PLUGIN_ROOT
# ADR-080: the artifact pass runs in each hook's own process here, so no detached pass outlives
# the test that started it. Windows will not delete a directory a live process is still using,
# and a fixture's cleanup failed six times on it. tests/artifact-pass-behind.test.mjs chooses
# its runner explicitly.
export QUALITY_HARNESS_ARTIFACT_PASS_RUNNER=inline
# The same for SessionEnd, which hands its work to a detached copy of the hook (plugin/scripts/lifecycle.mjs `endsBehind`);
# tests/session-end-behind.test.mjs starts the detached copy explicitly.
export QUALITY_HARNESS_SESSION_END_RUNNER=inline
# ADR-111 T3: and for the session-start baseline, a detached `qh-check --baseline` that would otherwise outlive every test that
# starts a session with a check (tests/late-baseline.test.mjs's cleanup met one, 2026-10-18). tests/baseline.test.mjs chooses
# its runner explicitly.
export QUALITY_HARNESS_BASELINE_RUNNER=off
# ADR-126 T3: a test sets the budgets it depends on (CLAUDE.md §7). A hook-spawning test that inherited the product's 5 s
# observe budget read no decision on a slow runner (three of the week's 29 failed CI jobs, 2026-10-22). Forced, not defaulted:
# a value from the caller's shell is the product's tuning, not the suite's.
export QUALITY_HARNESS_OBSERVE_BUDGET_MS=60000

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
# ADR-008 split the two: the tests live in the repository, the thing they
# check lives under it. `source` in marketplace.json names this directory,
# and the shipped-set test in tests/package.test.mjs is what keeps the two
# from disagreeing.
ROOT="$REPO/plugin"

# ADR-095 T4: say, before anything heavy, how many test files run at once and the load this run found, so a timing read later can
# be attributed (a run on a busy machine is not comparable with one on a quiet one). QH_SELFTEST_CONCURRENCY overrides node's own
# default (one fewer than the cores) and is said; a value that is not a positive whole number is said and ignored. A load that
# cannot be read is "unknown", never 0: Windows has no load average, and os.loadavg() answers zeros there. QH_SELFTEST_DRY=1
# prints the line and stops, and QH_SELFTEST_LOAD=unreadable forces the unreadable case; both exist for tests/gate-concurrency.test.mjs.
cores=$(getconf _NPROCESSORS_ONLN 2>/dev/null || nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo unknown)
if [ "${QH_SELFTEST_LOAD:-}" = "unreadable" ]; then
  load=unknown
else
  load=$(node -e 'const os = require("node:os"); process.stdout.write(process.platform === "win32" ? "unknown" : os.loadavg()[0].toFixed(2))' 2>/dev/null || true)
  [ -n "$load" ] || load=unknown
fi
concurrency=default
concurrency_how=''
if [ -n "${QH_SELFTEST_CONCURRENCY:-}" ]; then
  case "$QH_SELFTEST_CONCURRENCY" in
    *[!0-9]*|0|0[0-9]*) printf 'selftest: QH_SELFTEST_CONCURRENCY=%s is not a positive whole number; ignored.\n' "$QH_SELFTEST_CONCURRENCY" ;;
    *)
      concurrency=$QH_SELFTEST_CONCURRENCY
      concurrency_how='; set by QH_SELFTEST_CONCURRENCY'
      ;;
  esac
fi
printf 'selftest: concurrency %s (cores %s, load %s%s)\n' "$concurrency" "$cores" "$load" "$concurrency_how"
# Stage 0 of making the check fast (BACKLOG §378, "qh-check cannot say where its time went"): every run keeps one row of
# per-file test times beside the check ledger, red runs too, since a file that failed is the first one an ordering wants.
# scripts/check-timing.mjs reads them. Outside a git checkout there is no ledger to keep them beside, and that is said.
timing_dir=$(git -C "$REPO" rev-parse --absolute-git-dir 2>/dev/null || true)
if [ -n "$timing_dir" ]; then
  timing_ledger="$timing_dir/quality-harness/selftest-files.jsonl"
  printf 'selftest: per-file times to %s\n' "$timing_ledger"
else
  timing_ledger=''
  printf 'selftest: per-file times not kept (no git directory for %s)\n' "$REPO"
fi
# Stage 1 (BACKLOG §378): the files run failed first, then unmeasured, then longest first, from the last run's own times
# (scripts/test-order.mjs). node starts files in the order given, nine at a time, and the glob's order started the longest one
# late enough to end the run alone. The same files run either way: the order is accepted only when it names as many files as
# the glob, and anything else falls back to the glob and says so. QH_SELFTEST_ORDER=glob keeps the glob's order (to measure
# one against the other), and QH_SELFTEST_TIMES names another times file (for tests/test-order.test.mjs).
# Repository-relative names, run from the repository root: as absolute paths, 225 files under a deep Windows checkout came to
# 34,928 characters, past the 32,767 a command line may hold, and the ordering died unsaid (a Windows run, 2026-10-15).
test_files=()
for test_file in "$REPO"/tests/*.test.mjs; do test_files+=("tests/${test_file##*/}"); done
order_how='in glob order (no per-file times yet)'
times_source=${QH_SELFTEST_TIMES:-$timing_ledger}
if [ "${QH_SELFTEST_ORDER:-}" = glob ]; then
  order_how='in glob order (QH_SELFTEST_ORDER=glob)'
elif [ -n "$times_source" ] && [ -s "$times_source" ]; then
  ordered=()
  order_said=''
  while IFS= read -r ordered_file; do
    if [ -z "$order_said" ]; then order_said=$ordered_file; continue; fi
    ordered+=("$ordered_file")
  done < <(cd "$REPO" && node scripts/test-order.mjs "$times_source" . "${test_files[@]}" 2>/dev/null || true)
  if [ "$order_said" = 'order: times' ] && [ "${#ordered[@]}" = "${#test_files[@]}" ]; then
    test_files=("${ordered[@]}")
    order_how='failed first, then unmeasured, then longest first, by the last run'"'"'s times'
  elif [ "$order_said" = 'order: times' ]; then
    order_how="in glob order (the ordering named ${#ordered[@]} of ${#test_files[@]} files)"
  else
    order_how='in glob order (no per-file times could be read)'
  fi
fi
printf 'selftest: test files run %s; first: %s\n' "$order_how" "${test_files[0]##*/}"
if [ "${QH_SELFTEST_DRY:-0}" = 1 ]; then exit 0; fi

# The manifest/skill validation needs the Claude Code CLI. Where it is absent
# the run says so and the final line downgrades to PARTIAL — a check that
# silently vanishes is the failure mode this project exists to prevent. CI sets
# QUALITY_HARNESS_REQUIRE_CLI=1 so the absence is an error there, where the CLI
# is installed on purpose.
# ⚠ A VALIDATE THAT DIES WITHOUT SAYING ANYTHING IS `UNRUN`, NOT A FAILING GATE.
# BACKLOG §121, observed three times: this script exits 1 with its output ending
# at 359 bytes right after a `claude plugin validate --strict`, no message
# anywhere, and a re-run passes with the whole suite green. `set -euo pipefail`
# turns any non-zero from that CLI into an immediate exit and the CLI writes
# nothing on the way out, so the repository's own entry point reported "could not
# look" in the vocabulary of a verdict — which is exactly what ADR-005 forbids
# every gate below it from doing.
#
# Measured 2026-09-06: 40 consecutive isolated runs of the third validate all
# exited 0, so this is NOT the CLI failing deterministically and the cause is
# still unattributed. That is the point of the arm below — it does not need to
# know the cause to stop the silence. A non-zero WITH output is a real finding
# and still fails; a non-zero with NO output says so, by name, and still fails,
# because a check that did not run must never read as one that passed.
validate() {
  local target="$1" out code
  set +e
  out=$(claude plugin validate --strict "$target" 2>&1)
  code=$?
  set -e
  [ -n "$out" ] && printf '%s\n' "$out"
  if [ "$code" -ne 0 ]; then
    if [ -z "$out" ]; then
      printf 'UNRUN — `claude plugin validate --strict %s` exited %s and wrote nothing at all.\n' \
        "$target" "$code" >&2
      printf '  Nothing was validated, and this is not a finding about the manifest. It is\n' >&2
      printf '  BACKLOG §121s signature; a re-run has passed every time it has been seen.\n' >&2
    fi
    exit "$code"
  fi
}

verdict="PASS — quality-harness is self-contained and verified."
if command -v claude >/dev/null 2>&1; then
  validate "$REPO"
  validate "$ROOT/.claude-plugin/plugin.json"
  validate "$ROOT/skills"
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
# Through scripts/run-tests.mjs, not `node --test`: node 24's CLI sorts the files it is given, so the order above never reached it
# (measured 2026-10-14). The runner keeps the order, prints the same spec report, writes the per-file times and the TAP
# transcript where it is told to, and exits 1 exactly when node --test would.
runner_args=()
[ "$concurrency" = default ] || runner_args+=(--concurrency "$concurrency")
# ADR-113 T5: the per-file row is taken on every run, kept or not: scripts/suite-accounting.mjs reads it below.
timing_rows=$(mktemp "${TMPDIR:-/tmp}/qh-file-times.XXXXXX") || timing_rows=''
if [ -n "$timing_rows" ]; then runner_args+=(--times "$timing_rows")
else printf 'selftest: per-file times not taken for this run (no temporary file)\n' >&2
fi
if [ -n "${QUALITY_HARNESS_TAP:-}" ]; then
  runner_args+=(--tap "$QUALITY_HARNESS_TAP")
fi
# The suite's status is read, not left to set -e, so a red run's times are kept before the script exits with it.
tests_status=0
# QH_TEST_SHARDED=1: a file cut into slices (tests/helpers/shard.mjs) runs each slice as its own process; the glob holds every
# shard file, so no slice goes unrun.
(cd "$REPO" && QH_TEST_SHARDED=1 QH_SELFTEST_ROOT="$REPO" QH_SELFTEST_CONCURRENCY_SAID="$concurrency" QH_SELFTEST_LOAD_SAID="$load" \
  node scripts/run-tests.mjs ${runner_args[@]+"${runner_args[@]}"} -- "${test_files[@]}") || tests_status=$?
if [ -n "$timing_rows" ] && [ -n "$timing_ledger" ]; then
  if [ -s "$timing_rows" ] && mkdir -p "$(dirname "$timing_ledger")" && cat "$timing_rows" >>"$timing_ledger"; then :
  else printf 'selftest: per-file times were not kept for this run\n' >&2
  fi
fi
if [ "$tests_status" != 0 ]; then rm -f "$timing_rows"; exit "$tests_status"; fi
# ADR-113 T5: every tracked test file is reached by this run, none registered no test unless named exempt, and every skip names
# its reason. A run with no per-file row is UNRUN here (exit 2), never a pass.
accounting_status=0
(cd "$REPO" && node scripts/suite-accounting.mjs --row "$timing_rows") || accounting_status=$?
rm -f "$timing_rows"
[ "$accounting_status" = 0 ] || exit "$accounting_status"

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
# §2: NOT `node --check` — a Workflow script is neither ESM nor CJS and node's two
# parse goals disagree about it between releases. workflow-parse.mjs reads it the way
# the runtime does, and ships beside the post-edit hook that needs the same answer.
node "$ROOT/scripts/workflow-parse.mjs" "$ROOT"/workflows/*.js
node --check "$ROOT/scripts/workflow-parse.mjs"

# The owner, 2026-10-12: the linters run on every gate, not by hand before a release. An import
# or a local nothing in its own file reads is a finding, and a linter that cannot start is UNRUN
# (exit 3); either one fails this run.
bash "$REPO/scripts/unused-names.sh"
# ADR-113 T3: a new writer of a check ledger or a task log, a new spawn of a publishing git verb, or a writing tool a hook
# group does not see, fails until scripts/side-doors.json names it with its reason.
node "$REPO/scripts/side-door-sweep.mjs"

# §130: a child still attached to this shell at the end is a leak, and a leak is
# not a pass. Direct children only — a grandchild that reparented is out of
# reach here; the orphan check after this one finds it by the run directory it names. Without pgrep the
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

# §130 again, for what -P cannot see: a grandchild whose parent died is re-parented to pid 1,
# and five lease holders lived 8 h 51 min that way (2026-10-15). Each still named this run's
# directory, which is how scripts/run-orphans.mjs finds one; after a grace it kills what is left
# and that is a red run. Could not look is UNRUN, as above, never "none".
if [ -n "$QH_RUN_TMP" ]; then
  orphan_status=0
  node "$REPO/scripts/run-orphans.mjs" "$QH_RUN_TMP" --grace-ms 5000 --kill || orphan_status=$?
  if [ "$orphan_status" = 3 ]; then
    printf 'orphan check UNRUN — ps did not run, so nothing here says no process outlived the suite\n' >&2
  elif [ "$orphan_status" != 0 ]; then
    printf 'FAIL — process(es) the suite started outlived it (named and killed above)\n' >&2
    exit 1
  fi
fi

# §310: what the tests left in their temp directory, by name, before the trap removes
# it. Advice, never a failure: the directory goes whatever it holds, and this line is
# how a new leak is seen rather than found on a full disk.
if [ -n "$QH_RUN_TMP" ] && [ -n "$(ls -A "$QH_RUN_TMP" 2>/dev/null)" ]; then
  left=$(ls -A "$QH_RUN_TMP" | wc -l | tr -d ' ')
  prefixes=$(ls -A "$QH_RUN_TMP" | sed -E 's/[-._][A-Za-z0-9]{6}$//; s/-[0-9a-f]{16,}$//' | sort | uniq -c | sort -rn \
    | awk '{ printf "%s%s x%s", sep, $2, $1; sep = ", " }')
  printf 'advice: the tests left %s entr%s in their temp directory, removed on exit: %s\n' \
    "$left" "$([ "$left" = 1 ] && echo y || echo ies)" "$prefixes"
fi

# The verdict is the last line, because it is the line a reader skims. PARTIAL
# exits 0 like PASS; printing neither made a run that skipped plugin validation
# end looking like one that did not. The print went with 39abcf1's leak-check
# rewrite, unnoticed, because nothing asserted it (BACKLOG §250).
printf '%s\n' "$verdict"

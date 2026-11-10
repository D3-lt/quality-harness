# Task ADR-144-T1: Five landing runs measure the merged raw-V8 figure, serial and sharded, beside the unchanged floor

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `coverage.sh --js --raw <n>`, `--root <dir>`; `scripts/coverage-compare.mjs`; the five runs' figures in docs/BACKLOG.md §459
**Consumes:** none
**Data dependency:** needs c8 fetchable through `npx` for the runner tests (without it the runner exits non-zero naming the fetch, so the fence is red, never skipped; a local fetch was refused by this session's classifier, 2026-11-10), and five green landing runs carrying the probe and compare jobs for S6
**Proof map:** v1
**Rests-on:** `the slice partition`, `the runner's exit on a failing slice`, `the runner's exit on a failed merge`, `the runner's exit on an empty measurement`, `the compare script's refusal of an incomplete surface`, `the compare job selected in the workflow`, `the sharded probe selected in the workflow`, `no probe among the required checks`

## Goal

`bash scripts/coverage.sh --js --report --raw <n>` measures the JavaScript surface from one c8 merge of the raw V8 profiles that
`<n>` concurrent slices of the suite wrote, and fails on any failing slice, a failed merge or an empty measurement;
`scripts/coverage-compare.mjs` applies ADR-144 Decision 4; two probe jobs and a compare job run them in every landing run, and five
runs decide the criterion.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/coverage.sh` | edit | `--raw <n>` (report only), `--root <dir>`, `--plan`, `QUALITY_HARNESS_JS_LCOV`, the c8 pin, the counterexample; header comment and usage line |
| `scripts/coverage-compare.mjs` | add | Decision 4: validity, the native file set accounted for, equal raw file sets, the 0.02 gap; exit 0, 1 or 2 |
| `scripts/coverage-raw-unmeasured.txt` | add | Native files the raw form does not measure, each with its reason; empty until a run shows one |
| `.github/workflows/selftest.yml` | edit | The two probe jobs and `coverage raw compare`, non-required, `timeout-minutes: 30`; `coverage floor` sets `QUALITY_HARNESS_JS_LCOV` and uploads it |
| `tests/coverage-raw.test.mjs` | add | The plan, and the runner over fixture trees: success and each failure's exit |
| `tests/coverage-compare.test.mjs` | add | The compare script over hand-built reports: complete, empty, commonly truncated, gap, missing |
| `tests/fixtures/raw-merge/` | add | Fixture trees (a `plugin/` module and a `tests/`): two-arm pass, a failing first slice, a test that corrupts its own profile, one that loads no measured file |
| `tests/mutations/scripts/coverage.sh.json` | add | A failing non-final slice ignored; a merge failure ignored |
| `tests/mutations/scripts/coverage-compare.mjs.json` | add | The subset check and the non-empty check removed |
| `docs/BACKLOG.md` | edit | §459: the five runs' table and the criterion's verdict |

## Ordered Steps

1. [S1] Write the failing tests first (TDD red): the plan (`--raw 4 --plan` slices every `tests/*.test.mjs` once, one shared
   `NODE_V8_COVERAGE` directory, `--test-concurrency=1` and no `--experimental-test-coverage`, `c8@x.y.z` exact with both
   excludes; `--raw 0`, `--raw x` and `--raw` without `--report` exit 2 naming the value); the runner through `--root` over each
   fixture tree with `--raw 2`; the compare script over hand-built reports.
2. [S2] Implement `--raw`, `--root` and `--plan` in coverage.sh, sharing the core build and the exported budget with `--js`. Every
   slice's exit is collected and any non-zero one fails the run naming the slice, with the failing-tests block as
   coverage.sh:115-131 prints it; a non-zero merge fails naming the merge; a summary that does not parse, lists no file or totals
   no line fails as "measured nothing". Print `raw: sha=<sha> slices=<n> nproc=<p> lines=<x> branches=<y> functions=<z> files=<k>
   wall_s=<w> merge_s=<m>`.
3. [S3] Implement `scripts/coverage-compare.mjs` as ADR-144 Decision 4 states it, reading the native file set from the lcov's
   `SF:` lines and the exemptions from `scripts/coverage-raw-unmeasured.txt`.
4. [S4] Add the probe jobs, the compare job and `coverage floor`'s lcov artifact; in the sharded job run the counterexample first.
   [proof: acceptance]
5. [S5] Add the mutants and record one killed per mechanism in Rests-on. [proof: mutation]
6. [S6] Over the first five counted landing runs, record per run: run id, sha, each probe's `raw:` line, the native figures of
   `coverage floor`, the compare job's verdict and the files it named, and each probe's queue minutes; then the verdict on
   ADR-144 Decision 4.
   [proof: human: the five run ids, both probes' raw lines, the native figures, each compare verdict and the criterion's verdict are in docs/BACKLOG.md §459]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/coverage-raw.test.mjs tests/coverage-compare.test.mjs 2>&1 | tee "$out" && grep -q "✔ the raw measurement slices every test file once and keeps the floor's excludes" "$out" && grep -q '✔ the raw runner passes a passing tree and fails a failing slice, a failed merge and an empty measurement' "$out" && grep -q '✔ the comparison refuses an empty and a commonly truncated measurement' "$out" && grep -q 'name: coverage raw compare' .github/workflows/selftest.yml && grep -q 'name: coverage raw probe (sharded)' .github/workflows/selftest.yml && ! grep -q 'coverage raw' .github/rulesets/main.json
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the raw measurement slices every test file once and keeps the floor's excludes` | `tests/coverage-raw.test.mjs` | Slices partition the files; one profile directory; the excludes; the exact pin | — | S1, S2 |
| `the raw measurement refuses a slice count it cannot use` | `tests/coverage-raw.test.mjs` | `0`, `x` and `--raw` without `--report` exit 2 naming the value | — | S1, S2 |
| `the raw runner passes a passing tree and fails a failing slice, a failed merge and an empty measurement` | `tests/coverage-raw.test.mjs` | Through the real runner and c8 with `--root` and `--raw 2`: the two-arm tree exits 0 with 100% branches; a failing test in the first slice, a corrupted profile and a tree loading no measured file each exit 1 naming the cause | — | S1, S2 |
| `the comparison refuses an empty and a commonly truncated measurement` | `tests/coverage-compare.test.mjs` | Two empty raw summaries, and two equal raw summaries both missing a native file not in the exemptions, each exit 1 naming why | — | S1, S3 |
| `the comparison passes a complete measurement and fails a gap over 0.02` | `tests/coverage-compare.test.mjs` | The complete pair exits 0; a 0.03 branch gap and unequal raw file sets exit 1; an exempted file with its reason passes | — | S1, S3 |
| `the comparison says UNRUN for a missing or unreadable report` | `tests/coverage-compare.test.mjs` | Exit 2, naming the report, never a verdict | — | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `--raw` in coverage.sh; `coverage-compare.mjs` |
| 2 — selected | the probe and compare jobs, checked by the fence's workflow greps |
| 3 — discoverable | coverage.sh's usage line and header comment; the compare script's header |
| 4 — used | the five runs' table in §459 |

## Mutation Log

## Invariants

- `bash scripts/coverage.sh --js` and the `coverage floor` job judge exactly as before; the lcov it now keeps changes no verdict, and
  no required check is added or renamed.
- Every test file is in exactly one slice; the excludes are defined once and used by both forms.
- A report that could not be read is UNRUN, never an agreement.

## Risks

- Five agreeing runs can still hide a rare outlier, as one in ten did on 2026-08-27: after the switch, each landing's figure is
  compared with T1's five serial raw figures in §459 (T2 Risks).
- The fixture trees model one module loaded in two processes; the real suite adds spawned hooks, temp-directory plugin copies and
  killed processes that leave partial profiles, which only the CI runs meet.
- c8 may tolerate a corrupted profile instead of failing: the failed-merge case shows it, and then the runner must fail on it
  itself (Stop Condition).

## Stop Condition

Stop and record, without counting the run, when a probe fails a test that `coverage floor` passed on the same sha: that is the
contention or the instrumentation, and it is fixed as its own change before measuring resumes. Stop the task, and record the
criterion as failed, when the counterexample does not give 100% branches: then c8 does not merge by range and H1 cannot be tested
with it. Stop and ask when c8 skips a corrupted profile silently and the runner cannot detect it. The criterion cannot fail only if
the probes measure nothing; the non-empty and native-subset checks are what refuse that, and their tests show them refusing.

## Out of Scope

- Changing the required job's verdict or the floors (T2's job).

## Verification Log

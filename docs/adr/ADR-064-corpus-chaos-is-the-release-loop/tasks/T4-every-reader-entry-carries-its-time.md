# Task ADR-064-T4: Every reader spawn is timed

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (one module)
**Owner:** unassigned
**Produces:** `timings[]` and `slowest[]` in the probe report
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `every spawn is timed`, `the slowest are listed`

## Goal

The probe report carries `timings[]`: one entry `{ reader, target, ms }` for every reader spawn — each adrLint and adrNext run, work-next, adr-state, SessionStart, each corpus-report and each sweep. Each `target` is scrubbed. A spawn that failed or timed out is timed too, so a reader that is `null` in the report still has its time here. `slowest[]` lists the five longest, sorted. `ms` is wall time from `performance.now()`, rounded to an integer.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/corpus-probe.mjs` | edit | time each spawn inside `reader()`; `timings` and `slowest` in the report |
| `tests/corpus-probe.test.mjs` | edit | the test below |
| `tests/mutations.json` | edit | mutants |

## Ordered Steps

1. [S1] Write the test(s) below and see each fail on an assertion (TDD red).
2. [S2] Time each spawn in `reader()`, the one wrapper every reader goes through, and derive `slowest`.
3. [S3] Run the fence green, and record mutants with `adr-verify --mutant`: skip timing when a reader fails; drop the sort from `slowest`. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test --test-reporter=tap tests/corpus-probe.test.mjs 2>&1 | tee /dev/stderr | grep -cxE 'ok [0-9]+ - (every reader spawn in the probe report is timed)' | grep -qx 1
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `every reader spawn in the probe report is timed` | `tests/corpus-probe.test.mjs` | over a scratch corpus with at least one record and one task directory, `timings` holds an integer `ms` for every adrLint, adrNext, work-next, adr-state, SessionStart and corpus-report spawn; a reader forced to fail is timed too; `slowest` holds at most five, sorted descending | none | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the timing in `reader()` |
| 2 — something selects it | every reader goes through `reader()` |
| 3 — the caller can discover it | `timings` and `slowest` in `--json` |
| 4 — it is used | T2's diff names a reader past its floor |

## Mutation Log

## Invariants

- Timing adds no spawn and no file read.

## Risks

- A timing is not a verdict; the report never calls a reader slow, it only says how long it took.

## Stop Condition

Stop and ask if timing a reader would change what it prints.

## Out of Scope

- A budget or threshold that fails the probe on time (permanent: boundary: the probe reports and never judges; ADR-064 Decision)

## Verification Log

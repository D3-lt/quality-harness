# Task ADR-075-T1: qh-check and a campaign say the load they ran under

**Depends-on:** none
**Covers:** F-10, UC2-S1, UC2-S2, UC2-S3
**Estimated scope:** M (a new module, qh-check, the campaign runner)
**Owner:** unassigned
**Produces:** `sampleLoad`, `contention`, `loadLine` in `plugin/scripts/load.mjs`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `contended above the core count`, `not contended at or below it`, `null with no load average`

## Goal

Every `qh-check` record carries the 1-minute load at start and end, the core count and `contended`; a result above the core count, and a campaign's, says "unattributable: load N on M cores", and one with no load average says it could not read the load — exit and verdict unchanged.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/load.mjs` | add | `sampleLoad({ loadavg, cores })`, `contention(before, after, cores)`, `loadLine(...)`; once it exists, it joins the ADR's `Governs:` line, which may name only a file git tracks |
| `plugin/scripts/qh-check.mjs` | edit | `runCheck`'s `loadavg` and `cores` seams; the record fields; the stderr line after the record line |
| `scripts/mutate.mjs` | edit | samples at start and end (`QUALITY_HARNESS_LOADAVG`, `QUALITY_HARNESS_CORES` seams) and prints the line beside the summary |
| `tests/qh-check.test.mjs` | edit | remove `todo` from its three tests |

## Ordered Steps

1. [S1] Remove `todo` from the three tests in `tests/qh-check.test.mjs` and record the red run with `adr-verify`: each fails on a missing field or line, not on an error (TDD red). [proof: acceptance]
2. [S2] `plugin/scripts/load.mjs`: `sampleLoad({ loadavg = os.loadavg, cores = os.availableParallelism() })` returns `{ load, cores }`, `load` null when all three averages are 0; `contention(before, after, cores)` is `true` when either load exceeds `cores`, `null` when either is null, else `false`; `loadLine` renders the unattributable or could-not-read sentence, or nothing.
3. [S3] `runCheck` takes `loadavg` and `cores`, samples beside `observe()`, writes `before.load`, `after.load`, `cores` and `contended`, and says `loadLine` on stderr after the record line. Exit and `verdict` untouched.
4. [S4] `scripts/mutate.mjs` samples at the start and the end of a campaign that applies mutants and prints `loadLine` with its summary; exit untouched.
5. [S5] Record one killed mutant per Rests-on name with `adr-verify --mutant`. [proof: mutation]

## Acceptance

```bash
set -o pipefail
test "$(node --test --test-reporter=tap tests/qh-check.test.mjs 2>&1 | tee /dev/stderr | grep -cxE 'ok [0-9]+ - (a check run below the core count is recorded as not contended|a check run above the core count is recorded as contended and said, and its exit is unchanged|a check with no load average records contended null and says the load could not be read)')" -eq 3 && node --test tests/qh-check-shell.test.mjs tests/fail-open.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a check run below the core count is recorded as not contended` | `tests/qh-check.test.mjs` | the fields, `contended: false`, no line | UC2-S1, F-10 | S2, S3 |
| `a check run above the core count is recorded as contended and said, and its exit is unchanged` | `tests/qh-check.test.mjs` | `contended: true`, the line, exit 0 and verdict passed; the campaign's line | UC2-S2, F-10 | S2, S3, S4 |
| `a check with no load average records contended null and says the load could not be read` | `tests/qh-check.test.mjs` | `contended: null` and the could-not-read line | UC2-S3, F-10 | S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `plugin/scripts/load.mjs` and its three tests |
| 2 — something selects it | `runCheck` and the campaign call it; deleting either call turns a test red |
| 3 — the caller can discover it | the record's fields and the printed line |
| 4 — it is used | every `qh-check` run; nothing reads `contended` yet |

## Mutation Log

## Invariants

- A contended check's exit code and `verdict` are exactly what an uncontended one's would be (CLAUDE.md §3).
- `ADR-061`'s publish refusal reads the same `verdict` it read before.

## Risks

- `os.availableParallelism()` counts what the process may use, not the machine's cores; that is the number a contended run competes for.

## Stop Condition

Stop and ask if the load average is not 0 0 0 on Windows CI: the could-not-read rule then needs another sign.

## Out of Scope

- A fence `adr-verify` records (deferred: docs/BACKLOG.md ADR-075 entry)

## Verification Log

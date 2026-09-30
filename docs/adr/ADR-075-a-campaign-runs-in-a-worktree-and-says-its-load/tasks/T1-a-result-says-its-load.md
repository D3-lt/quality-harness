# Task ADR-075-T1: qh-check and a campaign say the load at their ends

**Depends-on:** none
**Covers:** F-10, UC2-S1, UC2-S2, UC2-S3, UC2-S4
**Estimated scope:** M (a new module, qh-check, the campaign runner)
**Owner:** unassigned
**Produces:** `sampleLoad`, `contention`, `loadLine` in `plugin/scripts/load.mjs`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `contended when either sample exceeds the core count`, `not contended at or below it`, `null with no load average`, `both samples always said`

## Goal

Every `qh-check` record and every campaign says its load at start and at end and the core count: "load: A at start, B at end, on N cores". `contended` is true when either sample exceeds the core count, false at or below it, null when either could not be read, and it is said as the endpoint observation it is. Exit and verdict never change.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/load.mjs` | add | `sampleLoad({ loadavg, cores })`, `contention(start, end, cores)`, `loadLine(start, end, cores)`. Once it exists it joins the ADR's `Governs:` line, which may name only a file git tracks |
| `plugin/scripts/qh-check.mjs` | edit | `runCheck`'s `loadavg` and `cores` seams; `before.load`, `after.load`, `cores` and `contended` in the record; the load line on stderr after the record line |
| `scripts/mutate.mjs` | edit | samples at start and at end (`QUALITY_HARNESS_LOADAVG`, `QUALITY_HARNESS_CORES` seams) and prints the load line with every summary |
| `tests/qh-check.test.mjs` | edit | remove `todo` from its four tests |

## Ordered Steps

1. [S1] Remove `todo` from the four tests in `tests/qh-check.test.mjs` and record the red run with `adr-verify`: each fails on a missing field or line, not on an error (TDD red). [proof: acceptance]
2. [S2] `plugin/scripts/load.mjs`: `sampleLoad` returns `{ load, cores }`, with `load` null when all three averages are 0. `contention` is true when either load exceeds `cores`, null when either is null, else false. `loadLine` always renders both samples, and adds "unattributable" when contended and "the load could not be read" when null.
3. [S3] `runCheck` takes `loadavg` and `cores`, samples beside `observe()` at both ends, writes the four fields and prints `loadLine` on stderr after the record line. Exit and `verdict` are untouched.
4. [S4] `scripts/mutate.mjs` samples at the start and at the end of every campaign that applies mutants and prints `loadLine` with its summary. Exit is untouched. (T2 moves the printing into the isolated parent, once.)
5. [S5] Record one killed mutant per Rests-on name with `adr-verify --mutant`. [proof: mutation]

## Acceptance

```bash
set -o pipefail
T=$(mktemp)
node --test --test-reporter=tap tests/qh-check.test.mjs 2>&1 | tee "$T" && test "$(grep -cxE 'ok [0-9]+ - (a check run below the core count is recorded as not contended|a check run above the core count is recorded as contended and said, and its exit is unchanged|a check with no load average records contended null and says the load could not be read|a check whose load crosses the core count between its samples is contended, and one at the count is not)' "$T")" -eq 4 && node --test tests/qh-check-shell.test.mjs tests/fail-open.test.mjs
```

The runner's own exit status is carried by `pipefail` and `&&`, never discarded inside a `test "$(…)"`. Measured 2026-09-30 with a stand-in runner: an unrelated failing test, a missing named test and a remaining `todo` each fail this form; the earlier `test "$(… | grep -c …)" -eq N` passed the first of those.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a check run below the core count is recorded as not contended` | `tests/qh-check.test.mjs` | the fields, `contended: false`, both samples said by qh-check and by a campaign | UC2-S1, F-10 | S2, S3, S4 |
| `a check run above the core count is recorded as contended and said, and its exit is unchanged` | `tests/qh-check.test.mjs` | `contended: true`, "unattributable", exit 0 and verdict passed, and the campaign's line | UC2-S2, F-10 | S2, S3, S4 |
| `a check with no load average records contended null and says the load could not be read` | `tests/qh-check.test.mjs` | `contended: null` and the could-not-read line, for qh-check and a campaign | UC2-S3, F-10 | S2, S3, S4 |
| `a check whose load crosses the core count between its samples is contended, and one at the count is not` | `tests/qh-check.test.mjs` | changing samples, and equality with the core count | UC2-S4, F-10 | S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `plugin/scripts/load.mjs` and its four tests |
| 2 — something selects it | `runCheck` and the campaign call it; deleting either call turns a test red |
| 3 — the caller can discover it | the record's fields and the printed line |
| 4 — it is used | every `qh-check` run and campaign; nothing acts on `contended` yet (the nervous-system plan, N2) |

## Mutation Log

## Invariants

- A contended check's exit code and `verdict` are exactly what an uncontended one's would be (CLAUDE.md §3).
- ADR-061's publish refusal reads the same `verdict` it read before.
- Two samples say nothing about the time between them, and no line says otherwise.

## Risks

- `os.availableParallelism()` counts the cores the process may use, not the machine's; that is the number a contended run competes for.

## Stop Condition

Stop and ask if the load average is not `0 0 0` on Windows CI: the could-not-read rule would then need another sign.

## Out of Scope

- A fence `adr-verify` records (deferred: docs/BACKLOG.md ADR-075 entry)
- A reader that acts on `contended` (deferred: docs/research/2026-09-30-the-nervous-system-plan.md)

## Verification Log

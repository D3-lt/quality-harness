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
- 2026-09-30 · 31349a2* · mutant killed · exit 1 · `scripts/mutate.mjs` · the campaign samples its load and never says it · acceptance-sha256:73fce96e1d97d4ed681c5fcc2d5404408367dc03a0acc7819b0247263bc3bdff
- 2026-09-30 · 31349a2* · mutant killed · exit 1 · `plugin/scripts/load.mjs` · the end sample is ignored, so a load that crosses the core count while the check runs reads as not contended · acceptance-sha256:73fce96e1d97d4ed681c5fcc2d5404408367dc03a0acc7819b0247263bc3bdff · covers:contended when either sample exceeds the core count
- 2026-09-30 · 31349a2* · mutant killed · exit 1 · `plugin/scripts/load.mjs` · a load exactly at the core count reads as contended · acceptance-sha256:73fce96e1d97d4ed681c5fcc2d5404408367dc03a0acc7819b0247263bc3bdff · covers:not contended at or below it
- 2026-09-30 · 31349a2* · mutant killed · exit 1 · `plugin/scripts/load.mjs` · a platform with no load average reads as a quiet machine, not as could-not-read · acceptance-sha256:73fce96e1d97d4ed681c5fcc2d5404408367dc03a0acc7819b0247263bc3bdff · covers:null with no load average
- 2026-09-30 · 31349a2* · mutant killed · exit 1 · `plugin/scripts/load.mjs` · a quiet result says no samples at all · acceptance-sha256:73fce96e1d97d4ed681c5fcc2d5404408367dc03a0acc7819b0247263bc3bdff · covers:both samples always said

## Invariants

- A contended check's exit code and `verdict` are exactly what an uncontended one's would be (CLAUDE.md §3).
- ADR-061's publish refusal reads the same `verdict` it read before.
- Two samples say nothing about the time between them, and no line says otherwise.
- Class sweep, 2026-09-30: `git grep -lE 'loadavg|load average' -- scripts plugin` returns `plugin/scripts/load.mjs`, `plugin/scripts/qh-check.mjs` and `scripts/mutate.mjs`: the one sampler and its two callers. It returned nothing before this task. The results left without a load are ADR-075's deferrals (a fence `adr-verify` records).

## Risks

- `os.availableParallelism()` counts the cores the process may use, not the machine's; that is the number a contended run competes for.

## Stop Condition

Stop and ask if the load average is not `0 0 0` on Windows CI: the could-not-read rule would then need another sign.

## Out of Scope

- A fence `adr-verify` records (deferred: docs/BACKLOG.md ADR-075 entry)
- A reader that acts on `contended` (deferred: docs/research/2026-09-30-the-nervous-system-plan.md)

## Verification Log
- 2026-09-30 · 31349a2* · exit 1 · `set -o pipefail …` · acceptance-sha256:73fce96e1d97d4ed681c5fcc2d5404408367dc03a0acc7819b0247263bc3bdff · ms:1393 · test-lock-sha256:dde5720a667a7f884d89021b97fc4d9c121240f5b077876deba1203c54602abe · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3FoLWNoZWNrLnRlc3QubWpzCWEgY2hlY2sgcnVuIGFib3ZlIHRoZSBjb3JlIGNvdW50IGlzIHJlY29yZGVkIGFzIGNvbnRlbmRlZCBhbmQgc2FpZCwgYW5kIGl0cyBleGl0IGlzIHVuY2hhbmdlZAljM2ViYmE4MzIyNzFiOThiN2UzOTQzYTNkMGNlMTQwZjJlMWMwMDBkODI1NWZhMTE1NGVmNjRiM2JmMDViMzhhCmJvZHkJdGVzdHMvcWgtY2hlY2sudGVzdC5tanMJYSBjaGVjayBydW4gYmVsb3cgdGhlIGNvcmUgY291bnQgaXMgcmVjb3JkZWQgYXMgbm90IGNvbnRlbmRlZAlkODhmNzQzYjYzNDlhMDZjY2IxNWI4YmU0NmM1MjcwZDVmMjQwNjg5NjFhMDk5NzliNWRiNjI2ZGMyNGI0YTA4CmJvZHkJdGVzdHMvcWgtY2hlY2sudGVzdC5tanMJYSBjaGVjayB3aG9zZSBsb2FkIGNyb3NzZXMgdGhlIGNvcmUgY291bnQgYmV0d2VlbiBpdHMgc2FtcGxlcyBpcyBjb250ZW5kZWQsIGFuZCBvbmUgYXQgdGhlIGNvdW50IGlzIG5vdAlkMzUxZmI2NzQ1MTA0ZTVkOTlkODA4YzNlNGZmMzUxOTQwN2ZiY2YzMzYwNWE5OWUwMmU5NGIxNDM1ZjkxY2Y1CmJvZHkJdGVzdHMvcWgtY2hlY2sudGVzdC5tanMJYSBjaGVjayB3aXRoIG5vIGxvYWQgYXZlcmFnZSByZWNvcmRzIGNvbnRlbmRlZCBudWxsIGFuZCBzYXlzIHRoZSBsb2FkIGNvdWxkIG5vdCBiZSByZWFkCTBhNTZhNmFiYzI1OTM4MzMyMmQ3M2JiOWUyYmVhZTQ0MzdmNGRkOTc3NjBkNzQ0NGQxNWUzMmM3MTY2MzU5YjQ
  ```
  --- last 10 line(s) of stdout (of 102 after folding 102 raw)
    ...
  1..4
  # tests 4
  # suites 0
  # pass 0
  # fail 4
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 1230.525125
  ```
- 2026-09-30 · 31349a2* · exit 0 · `set -o pipefail …` · acceptance-sha256:73fce96e1d97d4ed681c5fcc2d5404408367dc03a0acc7819b0247263bc3bdff · ms:20930
- 2026-09-30 · 31349a2* · exit 0 · `set -o pipefail …` · acceptance-sha256:73fce96e1d97d4ed681c5fcc2d5404408367dc03a0acc7819b0247263bc3bdff · ms:20473
- 2026-09-30 · 31349a2* · exit 0 · `set -o pipefail …` · acceptance-sha256:73fce96e1d97d4ed681c5fcc2d5404408367dc03a0acc7819b0247263bc3bdff · ms:20369
- 2026-09-30 · 31349a2* · exit 0 · `set -o pipefail …` · acceptance-sha256:73fce96e1d97d4ed681c5fcc2d5404408367dc03a0acc7819b0247263bc3bdff · ms:19761
- 2026-09-30 · 31349a2* · exit 0 · `set -o pipefail …` · acceptance-sha256:73fce96e1d97d4ed681c5fcc2d5404408367dc03a0acc7819b0247263bc3bdff · ms:19812

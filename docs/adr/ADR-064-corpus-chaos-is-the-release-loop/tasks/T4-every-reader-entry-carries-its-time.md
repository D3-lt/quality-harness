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
| `plugin/scripts/corpus-probe.mjs` | edit | a `timed` wrapper around every spawn — adr-lint and SessionStart call theirs directly, the rest go through `reader()`; `timings` and `slowest` in the report |
| `tests/corpus-probe.test.mjs` | edit | the test below |
| `tests/mutations.json` | edit | mutants |

## Ordered Steps

1. [S1] Write the test(s) below and see each fail on an assertion (TDD red).
2. [S2] Wrap every reader spawn in one `timed(reader, target, run)` helper inside `probe()` — adr-lint's and SessionStart's direct spawns as well as everything `reader()` runs — and derive `slowest`.
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
| 1 — exists | `timed` in `probe()` |
| 2 — something selects it | every spawn in `probe()` goes through `timed` |
| 3 — the caller can discover it | `timings` and `slowest` in `--json` |
| 4 — it is used | T2's diff names a reader past its floor |

## Mutation Log
- 2026-09-25 · c4acfae* · mutant killed · exit 1 · `plugin/scripts/corpus-probe.mjs` · SessionStart's spawn goes untimed · acceptance-sha256:c6ce1b114fa66ca6feb63af1b1eb2a902f89462d3f192b9f44602c3ddb23d3c2 · covers:every spawn is timed
- 2026-09-25 · c4acfae* · mutant killed · exit 1 · `plugin/scripts/corpus-probe.mjs` · slowest lists the first five spawns, not the five longest · acceptance-sha256:c6ce1b114fa66ca6feb63af1b1eb2a902f89462d3f192b9f44602c3ddb23d3c2 · covers:the slowest are listed

## Invariants

- Timing adds no spawn and no file read.

## Risks

- A timing is not a verdict; the report never calls a reader slow, it only says how long it took.

## Stop Condition

Stop and ask if timing a reader would change what it prints.

## Out of Scope

- A budget or threshold that fails the probe on time (permanent: boundary: the probe reports and never judges; ADR-064 Decision)

## Verification Log
- 2026-09-25 · c4acfae* · exit 1 · `set -o pipefail …` · acceptance-sha256:c6ce1b114fa66ca6feb63af1b1eb2a902f89462d3f192b9f44602c3ddb23d3c2 · ms:1090 · test-lock-sha256:13b8954fc26a141c1df9b7d1b47ad5325b31484a0f2f417c58d32a0fe6e8a7c1 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL2NvcnB1cy1wcm9iZS50ZXN0Lm1qcwljb21wYXJlUmVhZGVyczogYSBkaXJlY3Rvcnkgd29yay1uZXh0IGNvdWxkIG5vdCByZWFkIGlzIG5vdCBhIGRpc2FncmVlbWVudCwgYW5kIGEgY3Jhc2hlZCByZWFkZXIgY29tcGFyZXMgbm90aGluZwk1MTQ1ZjJlZjI4NTRkOWZjZGIxZGUwZDNlOWVlZDQxNzUzNjEyMjAxMTNhMDQ1Y2U5ZWVmYTgyMDBmYWJhNjQzCmJvZHkJdGVzdHMvY29ycHVzLXByb2JlLnRlc3QubWpzCWNvbXBhcmVSZWFkZXJzOiBhIHRhc2sgb2YgYSByZWNvcmQgdGhhdCBpcyBub3QgQWNjZXB0ZWQgaXMgbm90IGEgZGlzYWdyZWVtZW50CTNlYmZjNDY1ODIxN2Y5YzA0MTdiYjBiMDZmOTQ0MmY5N2RkOGNjOWVkYWJmYWM0ZjM3MTI5MWFjNWRlNjM1MzUKYm9keQl0ZXN0cy9jb3JwdXMtcHJvYmUudGVzdC5tanMJZXZlcnkgcmVhZGVyIHNwYXduIGluIHRoZSBwcm9iZSByZXBvcnQgaXMgdGltZWQJZWEwNDBmYjM4YzE4OTc1MDIxMjczZDVhYWRhYmNmNTVmOWFiMDJiYmVhZjlhZGRjMTk1MmQ4MGEyZjVlMjNiOApib2R5CXRlc3RzL2NvcnB1cy1wcm9iZS50ZXN0Lm1qcwlmYWlsZWRUb1J1bjogYSBjaGlsZCBraWxsZWQgYXQgdGhlIGRlYWRsaW5lIGlzIHNhaWQgdG8gaGF2ZSBiZWVuIGtpbGxlZCwgd2l0aCB0aGUgYnVkZ2V0CWM5MWY3OTc0MjgwMmU0N2ZlOWI2NzlkZDUzZWI0NmI4YTEwNWEwNTRhY2RjMDlmZTczYWQ5NTFlNTQzNTk1NGEKYm9keQl0ZXN0cy9jb3JwdXMtcHJvYmUudGVzdC5tanMJcHJvYmU6IGEgcnVuIGxlYXZlcyBub3RoaW5nIGluIHRoZSBwcm9iZWQgcmVwb3NpdG9yeSwgaXRzIGdpdCBkaXIgaW5jbHVkZWQJY2Q5NmNjYjU2NWUxZjIzNDY2M2EwZWZkNTE2MTI2YmFlY2U5MjZmMGIzMzdkMjQyNmMzNmIyNzU2OGQ2YjkyMApib2R5CXRlc3RzL2NvcnB1cy1wcm9iZS50ZXN0Lm1qcwlzY3J1YmJlcjogZXZlcnkgYWJzb2x1dGUgcGF0aCBpcyBhIHBsYWNlaG9sZGVyLCBhbmQgYSByZXBvc2l0b3J5LXJlbGF0aXZlIG9uZSBpcyB1bnRvdWNoZWQJYTUzNjhjZjJkMDYxNzgyNWQzOGRjZDBmZDlmOTYzYjU2MzQyMmJjZDc2YTQyODExNDM4Y2QxMTk1ZTQ4Y2MxZApib2R5CXRlc3RzL2NvcnB1cy1wcm9iZS50ZXN0Lm1qcwlzdGF0ZURpcjogYW4gb3ZlcnJpZGUga2VlcHMgZWFjaCByZXBvc2l0b3J5IGFwYXJ0CTRkODRhMjAyOTUxODY5ODEyOWZkNDNjNTRkMDk0YjJkNzg0MTdmZDYzZTlkMjFmMjc5ZTA2MDIwMDE3ZTcxNWQKYm9keQl0ZXN0cy9jb3JwdXMtcHJvYmUudGVzdC5tanMJdGhlIHByb2JlIGZpbmdlcnByaW50cyB0aGUgcmVhZGVycyBpdCByYW4JMmQ2ODUyYTMyMjdiNDY2MzM5NTFiYjZlYWUxZDg3MThjZDU5Mzc1YTAxYjc0NTAxMGU2NWZhM2EzNmU4NDA1NApib2R5CXRlc3RzL2NvcnB1cy1wcm9iZS50ZXN0Lm1qcwl1bmNvbW1pdHRlZCByZWFkZXIgZWRpdHMgbWFyayB0aGUgZmluZ2VycHJpbnQgZGlydHkJZjAwNmVhNTQ5ODEzMGFhYWUwZTI2N2I5MzgwNWE5OWI5OTUxMTdlMzcwNThjMmY5ZjA5ZGViNmQ3ODNlNzhkMQ
  ```
  --- last 10 line(s) of stderr (of 77 after folding 77 raw)
    ...
  1..9
  # tests 9
  # suites 0
  # pass 8
  # fail 1
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 1012.638083
  ```
- 2026-09-25 · c4acfae* · exit 0 · `set -o pipefail …` · acceptance-sha256:c6ce1b114fa66ca6feb63af1b1eb2a902f89462d3f192b9f44602c3ddb23d3c2 · ms:1297
- 2026-09-25 · c4acfae* · exit 0 · `set -o pipefail …` · acceptance-sha256:c6ce1b114fa66ca6feb63af1b1eb2a902f89462d3f192b9f44602c3ddb23d3c2 · ms:1090

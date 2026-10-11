# Task ADR-095-T4: the gate says the concurrency and the load it ran under, and takes an override

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (the gate script, one test file, a measurement)
**Owner:** unassigned
**Produces:** `QH_SELFTEST_CONCURRENCY` and the printed line `selftest: concurrency N (cores C, load L)`
**Consumes:** `scripts/hook-cost.mjs --json` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the gate says what it ran with and the load it found`, `an override is honoured and said`, `a load that cannot be read is said as unknown`

## Goal

The repository's own gate says, at the start of every run, how many test files it runs at once and the load it found, takes an override for the concurrency, and records what the measured alternatives cost; an automatic rule is shipped only if a measurement shows it faster, and is otherwise declined with the numbers.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/selftest.sh` | edit | prints `selftest: concurrency N (cores C, load L)` before anything heavy, passes `--test-concurrency` when `QH_SELFTEST_CONCURRENCY` is set, and in dry mode (`QH_SELFTEST_DRY=1`) prints the line and exits |
| `tests/gate-concurrency.test.mjs` | add | three tests |
| `tests/mutations/scripts/selftest.sh.json` | add | one entry per `Rests-on` name |

## Ordered Steps

1. [S1] Write the three tests of the Tests table and record the red run (TDD red).
2. [S2] Measure, after loading the `costly-runs` skill (a full gate is 4 to 6 minutes, one at a time, each bounded): the wall time of the whole gate at the default and at two lower concurrencies, with the load before and after each. Put the table in the sign-off. [proof: human: the table is in the sign-off with the load of each run]
3. [S3] Decide the automatic rule from the table by the Goal's criterion: faster than the default under load without being slower when quiet. Where no setting shows it, no rule is shipped and the sign-off says DECLINED with the numbers; the printed line and the override stay. [proof: human: the decision and its numbers are in the sign-off]
4. [S4] Print the line and take the override in `selftest.sh`; a load that cannot be read (Windows has no load average) is said as unknown, never as zero.
5. [S5] Record one killed mutant per `Rests-on` name. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/gate-concurrency.test.mjs 2>&1) \
  && for t in 'the gate says what it ran with and the load it found' 'an override is honoured and said' 'a load that cannot be read is said as unknown'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the gate says what it ran with and the load it found` | `tests/gate-concurrency.test.mjs` | `QH_SELFTEST_DRY=1 bash scripts/selftest.sh` prints `selftest: concurrency <n or default> (cores <c>, load <l>)` and exits 0 without running a test | none | S1, S4 |
| `an override is honoured and said` | `tests/gate-concurrency.test.mjs` | with `QH_SELFTEST_CONCURRENCY=2` the line says 2 and names the variable; a value that is not a positive whole number is said and ignored | none | S1, S4 |
| `a load that cannot be read is said as unknown` | `tests/gate-concurrency.test.mjs` | the fixture forces an unreadable load (`QH_SELFTEST_LOAD=unreadable` in dry mode); the line says `load unknown`, never `load 0` | none | S1, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three tests |
| 2 — something selects it | the line is printed by `selftest.sh` itself; removing the print turns the first test red |
| 3 — the caller can discover it | the line is the first thing every run prints |
| 4 — it is used | every full gate prints it from now on; the measurement of S2 is the evidence behind the declined rule |

## Mutation Log
- 2026-10-11 · fc778913* · mutant killed · exit 1 · `scripts/selftest.sh` · never prints the line, so a run says nothing about its concurrency or load · acceptance-sha256:70831a89c83382f3f95eb544f1fd5aecbf726b407ae14fa4d3a71683200870c3 · covers:the gate says what it ran with and the load it found
- 2026-10-11 · fc778913* · mutant killed · exit 1 · `scripts/selftest.sh` · does not say that the concurrency came from the override · acceptance-sha256:70831a89c83382f3f95eb544f1fd5aecbf726b407ae14fa4d3a71683200870c3 · covers:an override is honoured and said
- 2026-10-11 · fc778913* · mutant killed · exit 1 · `scripts/selftest.sh` · accepts a zero concurrency, so node is handed --test-concurrency=0 · acceptance-sha256:70831a89c83382f3f95eb544f1fd5aecbf726b407ae14fa4d3a71683200870c3 · covers:an override is honoured and said
- 2026-10-11 · fc778913* · mutant killed · exit 1 · `scripts/selftest.sh` · ignores a load that cannot be read, so the line carries a number it did not read · acceptance-sha256:70831a89c83382f3f95eb544f1fd5aecbf726b407ae14fa4d3a71683200870c3 · covers:a load that cannot be read is said as unknown

## Invariants

- A concurrency it did not use is never printed.
- An unreadable load is "unknown", never a number (CLAUDE.md §16, ADR-005).

## Risks

- One run per setting on a machine other sessions share is noisy: the sign-off says so, and a difference inside the noise is not a finding.

## Stop Condition

Stop and ask if the measurement shows run-to-run noise larger than the effect being claimed: then no rule is shipped and the sign-off says UNPROVEN.

## Out of Scope

- An automatic concurrency rule (declined when the measurement shows no faster setting; re-open per docs/BACKLOG.md §378)
- A per-test verdict cache (deferred: docs/BACKLOG.md §378)

## Verification Log
- 2026-10-11 · fc778913* · exit 1 · `out=$(node --test --test-reporter=tap tests/gate-concurrency.test.mjs 2>&1) \ …` · acceptance-sha256:70831a89c83382f3f95eb544f1fd5aecbf726b407ae14fa4d3a71683200870c3 · ms:9277 · test-lock-sha256:0e963fb4a3923ba42bb43f3b334ca90d4aaa29c1e6aeb2d2ded6949ad8ab4e62 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvZ2F0ZS1jb25jdXJyZW5jeS50ZXN0Lm1qcwlhIGxvYWQgdGhhdCBjYW5ub3QgYmUgcmVhZCBpcyBzYWlkIGFzIHVua25vd24JOTlhYjQ5NjY3OGQzYjdhODk5YzIwNzA3ZjU5YWIxMjgxYjkxNjQwZWNlMjJjYjYyMWM2ODA5MjhmNTkzYWZhYgpib2R5CXRlc3RzL2dhdGUtY29uY3VycmVuY3kudGVzdC5tanMJYW4gb3ZlcnJpZGUgaXMgaG9ub3VyZWQgYW5kIHNhaWQJY2UzYjYwZGUzYTcyMDM3NThiMmZjNTJjMDBlMDUzNTk2M2FjNTM5Mzg3NzFkOGMwYzVmMzAxY2U5YTEwN2E5Ygpib2R5CXRlc3RzL2dhdGUtY29uY3VycmVuY3kudGVzdC5tanMJdGhlIGdhdGUgc2F5cyB3aGF0IGl0IHJhbiB3aXRoIGFuZCB0aGUgbG9hZCBpdCBmb3VuZAljZjJlZDA5MDNjYTExM2Q4ZDk4YWExYmMyYmQ1NDM2MDk0YjJjZWM5NWExNjMxZWE3MGJmZGI3ZjJlYTM0NzRk
  ```
  ```
- 2026-10-11 · fc778913* · exit 0 · `out=$(node --test --test-reporter=tap tests/gate-concurrency.test.mjs 2>&1) \ …` · acceptance-sha256:70831a89c83382f3f95eb544f1fd5aecbf726b407ae14fa4d3a71683200870c3 · ms:1200
- 2026-10-11 · fc778913* · exit 0 · `out=$(node --test --test-reporter=tap tests/gate-concurrency.test.mjs 2>&1) \ …` · acceptance-sha256:70831a89c83382f3f95eb544f1fd5aecbf726b407ae14fa4d3a71683200870c3 · ms:1055
- 2026-10-11 · fc778913* · exit 0 · `out=$(node --test --test-reporter=tap tests/gate-concurrency.test.mjs 2>&1) \ …` · acceptance-sha256:70831a89c83382f3f95eb544f1fd5aecbf726b407ae14fa4d3a71683200870c3 · ms:1026
- 2026-10-11 · fc778913* · exit 0 · `out=$(node --test --test-reporter=tap tests/gate-concurrency.test.mjs 2>&1) \ …` · acceptance-sha256:70831a89c83382f3f95eb544f1fd5aecbf726b407ae14fa4d3a71683200870c3 · ms:1031
- 2026-10-11 · human-observed · observed by the executing session on macOS, 2026-10-11, one run per setting of the whole gate (bash scripts/selftest.sh with QH_SELFTEST_CONCURRENCY), one at a time, on a machine other sessions share (10 cores): 9 test files at once (node's default) 268 s with the load going from 9.2 to 14.0; 5 at once 282 s with the load from 14.0 to 8.0; 3 at once 392 s with the load from 8.0 to 5.6; so five costs about 5% and three about 46%, and one run each under a load that moved by five points is noisy: a difference of 5% is inside it; S3 decision by the criterion in the Goal (faster than the default under load without being slower when quiet): no setting was faster, so no automatic rule is shipped and it is DECLINED with these numbers, the neighbour-friendly reading (five at once leaves about four cores free at a cost inside the noise) is recorded in BACKLOG 378 for the owner; what ships is the printed line selftest: concurrency N (cores C, load L) before anything heavy, the override, and a load that cannot be read said as unknown; I started one full run by mistake while checking the dry mode before it existed and stopped it at 28 s; approved
- 2026-10-11 · human-observed · observed by the executing session on macOS, 2026-10-11, one run per setting of the whole gate (bash scripts/selftest.sh with QH_SELFTEST_CONCURRENCY), one at a time, on a machine other sessions share (10 cores): 9 test files at once (node's default) 268 s with the load going from 9.2 to 14.0; 5 at once 282 s with the load from 14.0 to 8.0; 3 at once 392 s with the load from 8.0 to 5.6; so five costs about 5% and three about 46%, and one run each under a load that moved by five points is noisy: a difference of 5% is inside it; S3 decision by the criterion in the Goal (faster than the default under load without being slower when quiet): no setting was faster, so no automatic rule is shipped and it is DECLINED with these numbers, the neighbour-friendly reading (five at once leaves about four cores free at a cost inside the noise) is recorded in BACKLOG 378 for the owner; what ships is the printed line selftest: concurrency N (cores C, load L) before anything heavy, the override, and an unreadable load said as unknown; I started one full run by mistake while checking the dry mode before it existed and ended it at 28 s; approved

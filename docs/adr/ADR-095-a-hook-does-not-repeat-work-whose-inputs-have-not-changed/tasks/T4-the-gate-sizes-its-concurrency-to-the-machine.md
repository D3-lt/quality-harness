# Task ADR-095-T4: the gate sizes its test concurrency to the machine, or says it did not

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (one chooser, the gate script, tests, a measurement)
**Owner:** unassigned
**Produces:** `chooseConcurrency({ cores, load, floor, ceiling })`
**Consumes:** `scripts/hook-cost.mjs --json` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the chooser leaves the default on a quiet machine`, `the chooser lowers concurrency as load rises, within bounds`, `the gate says what it chose`

## Goal

The repository's own gate picks `--test-concurrency` from the cores and the load it samples, within bounds, prints what it picked and why, and ships the rule only if a measurement shows it is not slower on a quiet machine and faster on a loaded one.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/gate-concurrency.mjs` | add | `chooseConcurrency`, pure over its arguments, and a thin CLI the shell script calls |
| `scripts/selftest.sh` | edit | calls the chooser, passes the number to `node --test`, prints `selftest: concurrency N (cores C, load L)`; `QH_SELFTEST_CONCURRENCY` overrides |
| `tests/gate-concurrency.test.mjs` | add | three tests |
| `tests/mutations/scripts/gate-concurrency.mjs.json` | add | one entry per `Rests-on` name |

## Ordered Steps

1. [S1] Write the three tests of the Tests table and record the red run (TDD red).
2. [S2] Measure, after loading the `costly-runs` skill and with the owner's go because it is heavy (a full gate is 4 to 6 minutes): wall time of the gate at the default and at two lower concurrencies, once on a quiet machine and once with a background load on about half the cores. Put the table (concurrency, load, seconds) in the sign-off. [proof: human: the table is in the sign-off with the load of each run]
3. [S3] Set the chooser's floor and ceiling to the measured best. Where no setting beats the default under load without being slower when quiet, the chooser returns the default and the sign-off says the rule was DECLINED with the numbers.
4. [S4] Wire the chooser into `selftest.sh`; the printed line is always present.
5. [S5] Record one killed mutant per `Rests-on` name. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/gate-concurrency.test.mjs 2>&1) \
  && for t in 'the chooser leaves the default on a quiet machine' 'the chooser lowers concurrency as load rises, never below the floor and never above the ceiling' 'the gate says what it chose and why, and an override is honoured and said'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the chooser leaves the default on a quiet machine` | `tests/gate-concurrency.test.mjs` | cores 10, load 1: the number is the default (`cores - 1`) | none | S1, S3 |
| `the chooser lowers concurrency as load rises, never below the floor and never above the ceiling` | `tests/gate-concurrency.test.mjs` | a table of (cores, load) pairs, including load above the core count, a missing load, and one core | none | S1, S3 |
| `the gate says what it chose and why, and an override is honoured and said` | `tests/gate-concurrency.test.mjs` | `bash scripts/selftest.sh` in its dry mode prints the line; `QH_SELFTEST_CONCURRENCY=2` is used and said | none | S1, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three tests |
| 2 — something selects it | `selftest.sh` calls the chooser; removing the call turns the third test red |
| 3 — the caller can discover it | the printed line |
| 4 — it is used | every full gate prints it; the measurement of S2 is the evidence it helps or that it was declined |

## Mutation Log

## Invariants

- A concurrency it did not use is never printed.
- A missing or unreadable load is the default, said (could-not-look is not "quiet").

## Risks

- A rule tuned on one machine is slower on another: the bounds are conservative and the override exists.

## Stop Condition

Stop and ask if the measurement shows run-to-run noise larger than the effect: then nothing is shipped and the sign-off says UNPROVEN.

## Out of Scope

- A per-test verdict cache (deferred: docs/BACKLOG.md §378)

## Verification Log

# Task ADR-077-T1: qh-check holds a lease, names its neighbours, and waits its turn when asked

**Depends-on:** none
**Covers:** F-1, F-2, F-3, F-4, F-5, F-6, F-7, F-8, F-9, F-10, F-12, UC1-S1, UC1-S2, UC1-S3, UC2-S1, UC2-S2, UC2-S3, UC2-S4
**Estimated scope:** L (a module, one caller, its launcher, eleven tests)
**Owner:** unassigned
**Produces:** `take`, `mark`, `observe`, `release`, `leaseDir` and `alive` in `plugin/scripts/lease.mjs`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a run holds a lease while it runs`, `neighbours are named at start and end`, `a dead lease is removed and an unreadable one kept`, `a waiter is admitted in ticket order`, `a wait is bounded`, `a signal while waiting releases`, `an unusable directory is said`, `the suite has a private lease directory`

## Goal

`qh-check` takes a lease before its check, names and records the leases it observes at the check's start and end, waits its turn when asked under the admission protocol, and releases its lease after the check has closed, with its exit and verdict unchanged (ADR-077 Decision).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lease.mjs` | add | `leaseDir`, `take`, `mark`, `observe`, `release`, `alive` |
| `plugin/scripts/qh-check.mjs` | edit | take, observe, wait, record and release around `runLaunched`; `--wait`; cancellation while waiting |
| `plugin/bin/qh-check` | edit | the Windows timeout includes the wait bound |
| `scripts/selftest.sh` | edit | a temporary `QUALITY_HARNESS_LEASE_DIR`, and `QUALITY_HARNESS_WAIT` cleared |
| `tests/lease.test.mjs` | edit | remove `todo` from T1's tests |
| `tests/mutations.json` | edit | this task's entries |

## Ordered Steps

1. [S1] Remove `todo` from the ten T1 tests in `tests/lease.test.mjs` and record the red run with `adr-verify` (TDD red). [proof: acceptance]
2. [S2] Write `plugin/scripts/lease.mjs`. A unique lease name, published by writing a temporary file and renaming it. `alive` answers alive, dead or unknown. `observe` removes the dead, reports the unreadable and the unknown, and keeps both for a day. `release` removes only the run's own file.
3. [S3] In `runCheck`: take the lease (`running`, or `waiting` when asked), observe, print, run through `runLaunched` unchanged, observe again, record `beside`, `besideAtEnd` and `waitedMs`, and release in a `finally` after `runLaunched` returns.
4. [S4] Admission: poll each second; start when no other lease is `running` or unknown and none `waiting` holds an earlier ticket; `mark` it `running`; stop at `QUALITY_HARNESS_WAIT_MAX_S` and say so. A SIGINT or SIGTERM while waiting releases and exits 130 or 143, and removes its listeners.
5. [S5] `plugin/bin/qh-check`: the Windows timeout adds the wait bound when waiting. `scripts/selftest.sh`: export a temporary lease directory and clear `QUALITY_HARNESS_WAIT`.
6. [S6] Record one killed mutant per Rests-on name with `adr-verify --mutant`. [proof: mutation]

## Acceptance

```bash
set -o pipefail
T=$(mktemp)
node --test --test-reporter=tap tests/lease.test.mjs 2>&1 | tee "$T" && test "$(grep -cxE 'ok [0-9]+ - (a run holds a lease while it runs and releases it at its end|a run beside others names and records them, and its exit and verdict are its own|a dead lease is removed, and an unreadable one is named as unknown and kept|a waiting run starts its check only after the running lease is released, and says how long it waited|a wait past its bound says so and runs, within the bound|a lease directory that cannot be used is said, and the run proceeds|the lease directory is the environment.s, else one under the temp directory|two waiters are admitted in ticket order, one at a time)' "$T")" -eq 8 && test "$(grep -cxE 'ok [0-9]+ - a signal while waiting releases the lease and runs nothing( # SKIP Windows has no catchable SIGTERM)?' "$T")" -eq 1
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a run holds a lease while it runs and releases it at its end` | `tests/lease.test.mjs` | one lease with pid, command, root, start and state during the check; nothing, not even a temporary file, after | F-1, F-8 | S2, S3 |
| `a run beside others names and records them, and its exit and verdict are its own` | `tests/lease.test.mjs` | two neighbours named with command, pid and root; `beside` and `besideAtEnd`; exit 3 and `failed` | F-2, UC1-S1 | S3 |
| `a dead lease is removed, and an unreadable one is named as unknown and kept` | `tests/lease.test.mjs` | the three answers | F-3, UC1-S2 | S2 |
| `a waiting run starts its check only after the running lease is released, and says how long it waited` | `tests/lease.test.mjs` | the check's start follows the release | F-4, UC2-S1 | S4 |
| `a wait past its bound says so and runs, within the bound` | `tests/lease.test.mjs` | the bound, timed | F-5, UC2-S2 | S4 |
| `a lease directory that cannot be used is said, and the run proceeds` | `tests/lease.test.mjs` | could-not-use, the check's own exit | F-6, UC1-S3 | S2 |
| `the lease directory is the environment's, else one under the temp directory` | `tests/lease.test.mjs` | `leaseDir` | F-7 | S2 |
| `a signal while waiting releases the lease and runs nothing` | `tests/lease.test.mjs` | exit 143, lease gone, check never started (POSIX) | F-9, UC2-S3 | S4 |
| `two waiters are admitted in ticket order, one at a time` | `tests/lease.test.mjs` | early start, early end, late start, late end | F-10, UC2-S4 | S4 |
| `a campaign's tests and the selftest use a private lease directory` | `tests/lease.test.mjs` | the selftest half (T2 adds `childEnv`'s) | F-12 | S5 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the module and its tests |
| 2 — something selects it | every `qh-check` |
| 3 — the caller can discover it | the "running beside" lines and the record's fields |
| 4 — it is used | N2's reader, and the follow-up's count |

## Mutation Log

## Invariants

- The check's exit code and verdict are never changed by a lease (CLAUDE.md §3).
- Nothing waits unless asked, and nothing waits unbounded.
- `runLaunched`'s signal forwarding is unchanged.

## Risks

- A pid reused after its run ended keeps a lease live; the bound ends a wait on it, and the line names what the lease claims.

## Stop Condition

Stop and ask if releasing after `runLaunched` returns changes what `qh-check` records for an interrupted check.

## Out of Scope

- Other participants (deferred: ADR-077 Out of Scope)

## Verification Log

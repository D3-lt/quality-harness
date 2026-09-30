# Task ADR-077-T1: qh-check holds a lease, names its neighbours, and waits its turn when asked

**Depends-on:** none
**Covers:** F-1, F-2, F-3, F-4, F-5, F-6, F-7, F-8, F-9, F-10, F-12, UC1-S1, UC1-S2, UC1-S3, UC2-S1, UC2-S2, UC2-S3, UC2-S4
**Estimated scope:** L (a module, one caller, its launcher, eleven tests)
**Owner:** unassigned
**Produces:** `take`, `mark`, `observe`, `release`, `leaseDir` and `alive` in `plugin/scripts/lease.mjs`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a run holds a lease while it runs`, `neighbours are named at start and end`, `a dead lease is removed and an unreadable one kept`, `a waiter is admitted in ticket order`, `a wait is bounded`, `a signal while waiting releases`, `an unusable directory is said`

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
- 2026-09-30 · bdaba1b* · mutant killed · exit 1 · `plugin/scripts/lease.mjs` · take publishes nothing, so no lease is held while the check runs · acceptance-sha256:352015478b2a297840060b7161d3f0acd2849f583bd15922cc1145c20a074edb · covers:a run holds a lease while it runs
- 2026-09-30 · bdaba1b* · mutant killed · exit 1 · `plugin/scripts/qh-check.mjs` · the end observation is never taken, so besideAtEnd is not recorded · acceptance-sha256:352015478b2a297840060b7161d3f0acd2849f583bd15922cc1145c20a074edb · covers:neighbours are named at start and end
- 2026-09-30 · bdaba1b* · mutant killed · exit 1 · `plugin/scripts/lease.mjs` · a dead lease is kept and reported as unknown · acceptance-sha256:352015478b2a297840060b7161d3f0acd2849f583bd15922cc1145c20a074edb · covers:a dead lease is removed and an unreadable one kept
- 2026-09-30 · bdaba1b* · mutant survived · exit 0 · `plugin/scripts/lease.mjs` · a waiter ignores an earlier waiter's ticket, so two start together · acceptance-sha256:352015478b2a297840060b7161d3f0acd2849f583bd15922cc1145c20a074edb · covers:a waiter is admitted in ticket order
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-09-30 · bdaba1b* · mutant killed · exit 1 · `plugin/scripts/qh-check.mjs` · the wait outlasts its bound tenfold · acceptance-sha256:352015478b2a297840060b7161d3f0acd2849f583bd15922cc1145c20a074edb · covers:a wait is bounded
- 2026-09-30 · bdaba1b* · mutant killed · exit 1 · `plugin/scripts/qh-check.mjs` · a signal while waiting leaves the lease behind · acceptance-sha256:352015478b2a297840060b7161d3f0acd2849f583bd15922cc1145c20a074edb · covers:a signal while waiting releases
- 2026-09-30 · bdaba1b* · mutant killed · exit 1 · `plugin/scripts/qh-check.mjs` · a lease directory that cannot be used is not said · acceptance-sha256:352015478b2a297840060b7161d3f0acd2849f583bd15922cc1145c20a074edb · covers:an unusable directory is said
- 2026-09-30 · bdaba1b* · mutant killed · exit 1 · `plugin/scripts/lease.mjs` · a waiter ignores an earlier waiter's ticket, so a later one starts ahead of it · acceptance-sha256:352015478b2a297840060b7161d3f0acd2849f583bd15922cc1145c20a074edb · covers:a waiter is admitted in ticket order

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
- 2026-09-30 · bdaba1b* · exit 1 · `set -o pipefail …` · acceptance-sha256:352015478b2a297840060b7161d3f0acd2849f583bd15922cc1145c20a074edb · ms:48899 · test-lock-sha256:5b571839a30e8f5bf71fc984534ab8596229f06aca5780e3f77f038a6f2176f0 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL2xlYXNlLnRlc3QubWpzCWEgY2FtcGFpZ24gYXNrZWQgdG8gd2FpdCBzdGFydHMgaXRzIHN1aXRlIG9ubHkgYWZ0ZXIgdGhlIHJ1bm5pbmcgbGVhc2UgaXMgcmVsZWFzZWQJMjlmZGRkYzI4MmZjYTE0MmUxODY5NmUwYmM5N2VjMjA5NTg0NGZkYzgyMmRmMDI3ODc1OTczN2NiYjMzMzEwYwpib2R5CXRlc3RzL2xlYXNlLnRlc3QubWpzCWEgY2FtcGFpZ24gaG9sZHMgYSBsZWFzZSB0aGF0IHJlY29yZHMgaXRzIGlzb2xhdGVkIGNoaWxkLCBhbmQgcmVsZWFzZXMgaXQgYXQgaXRzIGVuZAliZTk4NThlOTkxYTY3MGJlMTExYmQ3OTU2MDkzM2I1NGMzNzJkNzg5YmQ1ZjE3N2MzM2Q2YjQ4MWI2ZmU5YmFiCmJvZHkJdGVzdHMvbGVhc2UudGVzdC5tanMJYSBjYW1wYWlnbidzIHRlc3RzIGFuZCB0aGUgc2VsZnRlc3QgdXNlIGEgcHJpdmF0ZSBsZWFzZSBkaXJlY3RvcnkJZGJlYTE3ZjgyOGEwNjZjNGIyNWFiODc0OTM2MTVlNjVlNTQ4NmRiZTgzODk1ZmFlYzA2ZTBkZmMyYTc4ZmJiZgpib2R5CXRlc3RzL2xlYXNlLnRlc3QubWpzCWEgZGVhZCBsZWFzZSBpcyByZW1vdmVkLCBhbmQgYW4gdW5yZWFkYWJsZSBvbmUgaXMgbmFtZWQgYXMgdW5rbm93biBhbmQga2VwdAkzZjEzMzU1MzA5NDZjYjVmZWFkMDcwMzJiMjI2M2Y4ZWIxNWUwZDBkMjliOTI2ZmVjNGM0NDUyOWUyMWQ3ZjYxCmJvZHkJdGVzdHMvbGVhc2UudGVzdC5tanMJYSBraWxsZWQgY2FtcGFpZ24gcGFyZW50J3MgbGVhc2Ugc3RheXMgbGl2ZSB3aGlsZSBpdHMgY2hpbGQgd29ya3MJMzllZWE4ODdiOWU5NDQwNGRjNjYzZWFlMDIyYzBhNTgwMzgwZmI0Yjk5NGQwZTVlMDNhMDY1YWY5MjM2MDIwMgpib2R5CXRlc3RzL2xlYXNlLnRlc3QubWpzCWEgbGVhc2UgZGlyZWN0b3J5IHRoYXQgY2Fubm90IGJlIHVzZWQgaXMgc2FpZCwgYW5kIHRoZSBydW4gcHJvY2VlZHMJODVhMWMwNmZmYTA3NDk0MDZmN2VmOTY0YzU0ZmYxZmY1MjYzM2E0OTY1N2FlMTJiNGI4YzZkNjVkNGJhOThkZgpib2R5CXRlc3RzL2xlYXNlLnRlc3QubWpzCWEgcnVuIGJlc2lkZSBvdGhlcnMgbmFtZXMgYW5kIHJlY29yZHMgdGhlbSwgYW5kIGl0cyBleGl0IGFuZCB2ZXJkaWN0IGFyZSBpdHMgb3duCWQ0YWY3N2Y5NTA2NzNhNjljOTg2ZjJjMTc3YWMyY2Q3ODM2NzVkZWQyZDk3NmJmNzA4YTlkOTE5YjJhYTVkNDQKYm9keQl0ZXN0cy9sZWFzZS50ZXN0Lm1qcwlhIHJ1biBob2xkcyBhIGxlYXNlIHdoaWxlIGl0IHJ1bnMgYW5kIHJlbGVhc2VzIGl0IGF0IGl0cyBlbmQJOWNkZDlkOWE4YTFjYjM1MTZmNzFjMzUwOTFlOGY2NzliNDI3N2Q2NmE1N2I5OWY4Y2JlMmNiM2UwZmM1OTI1Ywpib2R5CXRlc3RzL2xlYXNlLnRlc3QubWpzCWEgc2lnbmFsIHdoaWxlIHdhaXRpbmcgcmVsZWFzZXMgdGhlIGxlYXNlIGFuZCBydW5zIG5vdGhpbmcJNWI3MGQwYmE1NTE5MjgxYzA3NzY0YmYwNzg4MDY1ZTcwN2EzODUzZjRhZGJjYTk3MTdjOTU4ZjM3NGY3Yjg5OQpib2R5CXRlc3RzL2xlYXNlLnRlc3QubWpzCWEgd2FpdCBwYXN0IGl0cyBib3VuZCBzYXlzIHNvIGFuZCBydW5zLCB3aXRoaW4gdGhlIGJvdW5kCTIwZmQ3YjJjYWEyZTZmYmY0OGIyYzZlMWY1Nzc0MmFiYTg0ZDhhNTJmYWQzNmI0NTBlNDRlMzI2NDRiYzg4YWUKYm9keQl0ZXN0cy9sZWFzZS50ZXN0Lm1qcwlhIHdhaXRpbmcgcnVuIHN0YXJ0cyBpdHMgY2hlY2sgb25seSBhZnRlciB0aGUgcnVubmluZyBsZWFzZSBpcyByZWxlYXNlZCwgYW5kIHNheXMgaG93IGxvbmcgaXQgd2FpdGVkCTY4M2QwMmIzMGFkMzBjYTc3MjBlYzA0ZWQzMThhMmRjMzEzN2UwOWQ4MWMzNDk3NWZlZTY3NWU2MjQyMDJmMjIKYm9keQl0ZXN0cy9sZWFzZS50ZXN0Lm1qcwl0aGUgbGVhc2UgZGlyZWN0b3J5IGlzIHRoZSBlbnZpcm9ubWVudCdzLCBlbHNlIG9uZSB1bmRlciB0aGUgdGVtcCBkaXJlY3RvcnkJMjhlNmRmNTJhN2NiOTBiYzI2MzJkZjlhMzQ0YTYwNDFiNGYwMGZlNjk2YjIyYjk4NDRjOGQwZmMxOTZhYzdhOQpib2R5CXRlc3RzL2xlYXNlLnRlc3QubWpzCXR3byB3YWl0ZXJzIGFyZSBhZG1pdHRlZCBpbiB0aWNrZXQgb3JkZXIsIG9uZSBhdCBhIHRpbWUJMTJhOTc3OWRlNzVlNWY4ODNkMTg1YmI4YTdiYWU0ODJlODEwYTY5YTFmNDNiYjZlODUxZThmN2VhOWNlNDk4Zg
  ```
  --- last 10 line(s) of stdout (of 292 after folding 292 raw)
    ...
  1..13
  # tests 13
  # suites 0
  # pass 0
  # fail 9
  # cancelled 0
  # skipped 0
  # todo 4
  # duration_ms 48691.395208
  ```
- 2026-09-30 · bdaba1b* · exit 0 · `set -o pipefail …` · acceptance-sha256:352015478b2a297840060b7161d3f0acd2849f583bd15922cc1145c20a074edb · ms:15908
- 2026-09-30 · bdaba1b* · exit 0 · `set -o pipefail …` · acceptance-sha256:352015478b2a297840060b7161d3f0acd2849f583bd15922cc1145c20a074edb · ms:15982
- 2026-09-30 · bdaba1b* · exit 0 · `set -o pipefail …` · acceptance-sha256:352015478b2a297840060b7161d3f0acd2849f583bd15922cc1145c20a074edb · ms:15617
- 2026-09-30 · bdaba1b* · exit 0 · `set -o pipefail …` · acceptance-sha256:352015478b2a297840060b7161d3f0acd2849f583bd15922cc1145c20a074edb · ms:15809
- 2026-09-30 · bdaba1b* · exit 0 · `set -o pipefail …` · acceptance-sha256:352015478b2a297840060b7161d3f0acd2849f583bd15922cc1145c20a074edb · ms:15833
- 2026-09-30 · bdaba1b* · exit 0 · `set -o pipefail …` · acceptance-sha256:352015478b2a297840060b7161d3f0acd2849f583bd15922cc1145c20a074edb · ms:14792
- 2026-09-30 · bdaba1b* · exit 0 · `set -o pipefail …` · acceptance-sha256:352015478b2a297840060b7161d3f0acd2849f583bd15922cc1145c20a074edb · ms:14784
- 2026-09-30 · bdaba1b* · exit 0 · `set -o pipefail …` · acceptance-sha256:352015478b2a297840060b7161d3f0acd2849f583bd15922cc1145c20a074edb · ms:15939

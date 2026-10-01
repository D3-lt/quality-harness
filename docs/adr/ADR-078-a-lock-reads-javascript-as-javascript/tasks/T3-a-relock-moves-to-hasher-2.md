# Task ADR-078-T3: A relock compares under the recorded hasher and writes hasher 2

**Depends-on:** T2
**Covers:** F-8, UC3-S1, UC3-S2
**Estimated scope:** S (one caller, one comparison, one test)
**Owner:** unassigned
**Produces:** none
**Consumes:** `snapshot_lock(…, hasher=)`, the `check@2` record, `decode_lock(…)["hasher"]` (T2)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a relock compares under the recorded hasher`, `a relock writes hasher 2`

## Goal

`adr-verify --relock` compares the recorded bodies under the hasher that took the trailing lock and, when none moved, appends a lock taken by hasher 2, with no `--replace-hashes` (ADR-078 Decision).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-verify` | edit | `record_relock` (`:2654`): one snapshot under the recorded hasher for the comparison, one under hasher 2 for the appended lock |
| `plugin/lib/record.py` | edit | `moved_lock_bodies` returns the trailing lock's hasher beside the moved names, or takes the hasher from the caller — whichever keeps its other callers unchanged |
| `tests/test-lock.test.mjs` | edit | remove `todo` from this task's two tests |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Remove `todo` from the two tests and record the red run (TDD red) — taken after T2, when `record_relock` still compares a hasher-1 lock with a hasher-2 reading, so `relock moves a hasher-1 lock to hasher 2 when nothing moved under hasher 1` fails there. [proof: acceptance]
2. [S2] In `record_relock`, read the trailing lock's hasher and take the comparison snapshot with it; a moved body is refused as today.
3. [S3] Take the appended lock with `snapshot_lock`'s default, hasher 2.
4. [S4] Record one killed mutant per Rests-on name. [proof: mutation]

## Acceptance

```bash
set -o pipefail
T=$(mktemp)
node --test --test-reporter=tap tests/test-lock.test.mjs 2>&1 | tee "$T" && test "$(grep -cxE 'ok [0-9]+ - (relock moves a hasher-1 lock to hasher 2 when nothing moved under hasher 1|a relock of a frozen hasher-1 lock refuses a moved body)' "$T")" -eq 2
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `relock moves a hasher-1 lock to hasher 2 when nothing moved under hasher 1` | `tests/test-lock.test.mjs` | exit 0 over the frozen lock, the old row kept, the new lock `check@2` | F-8, UC3-S1 | S2, S3 |
| `a relock of a frozen hasher-1 lock refuses a moved body` | `tests/test-lock.test.mjs` | held: a moved hasher-1 body is still refused and the log untouched (passes before the work) | UC3-S2 | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the tests above |
| 2 — something selects it | `--relock` in `adr-verify`'s argument parser |
| 3 — the caller can discover it | `adr-verify --help` already documents `--relock` |
| 4 — it is used | the Follow-up relocks in ADR-078 |

## Mutation Log

## Invariants

- A relock never edits an earlier row (ADR-052).

## Risks

- None beyond T2's.

## Stop Condition

Stop and ask if a hasher-1 lock whose bodies match under hasher 1 cannot be relocked without `--replace-hashes`.

## Out of Scope

- Relocking this corpus's records — ADR-078 Follow-ups.

## Verification Log

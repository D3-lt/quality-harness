# ADR-006 Tasks

Implementation tasks for ADR-006: Prove a verdict with a baseline, not with coverage. See the parent
ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | a baseline per test-set, and the UNPROVEN verdict | done | UC1-S1, UC1-S2, UC1-S3, F-4, F-5, F-6, F-7, F-8, F-9 | `node --test tests/mutate-runner.test.mjs …` |
| T2 | amend the spec to the chosen mechanism and bind every fact | done | F-1, F-2, F-3 | `spec-verify --spec docs/specs/… ` |

Status: `pending` | `running` | `blocked` | `done` | `failed`.

## Contract Coupling

T1 produces the `UNPROVEN` verdict and the tests that exercise it; T2 binds the spec's facts to
them. T1 must be committed before T2 flips any tag, or the spec would name tests that do not exist —
which is the unbound-fact state the spec gate exists to reject.

## Notes

- The spec was written before the mechanism was chosen and argues for coverage. Deciding first was
  the owner's call on 2026-08-28 and the measurements vindicated it: coverage reports 100%/100% on a
  vacuous assertion before and after mutation, so F-4/F-5/F-6 as worded describe a mechanism that
  does not ship. T2 rewords them; it does not quietly bind them to something else.
- F-1 binds to a test that already exists — `tests/package.test.mjs::every catalogue entry still
  matches the source it mutates, exactly once`, shipped 2026-08-28. A fact whose behaviour already
  holds and is already asserted needs no new test, and writing one would be a second assertion of
  the same thing.

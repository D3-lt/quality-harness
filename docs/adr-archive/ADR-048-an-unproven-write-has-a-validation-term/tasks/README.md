# ADR-048 Tasks

Implementation tasks for ADR-048: An UNPROVEN write has a validation term. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | UNPROVEN Advise reads the validation term | done | F-1, UC1-S1, UC1-S2 | `node --test --test-name-pattern 'a passing recognised check after an UNPROVEN write silences Advise\|a failing check after an UNPROVEN write still Advises, and Read does not flag' tests/lifecycle.test.mjs` |
| T2 | lastUnprovenWrite advances only on success | done | F-2, UC2-S1, UC2-S2 | `node --test --test-name-pattern 'a failed UNPROVEN write does not advance lastUnprovenWrite' tests/lifecycle.test.mjs` |

Status: `pending` | `partial` | `blocked` | `done`.

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `unprovenWritePending` | T2 | T1 before T2 so a failed write plus a passing check is not F-1's dirty case |

## Notes

- T1's dirty case is UNPROVEN write + passing check → silent. A green FLAG-without-following-check test is not this fact.
- T2's dirty case is F-1 implemented while `executed()` still treats `is_error` as a write.

# ADR-041 Tasks

Implementation tasks for ADR-041: A probe prefix is not the mutation. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | describeCommand peels a leading read-only probe | done | F-1, UC1-S1, UC1-S2 | `node --test --test-name-pattern 'Stop names the mutating remainder after a probe prefix\|probe-only Bash is not Session authorship' tests/lifecycle.test.mjs` |

Status: `pending` | `partial` | `blocked` | `done`.

## Contract Coupling

None.

## Notes

- F-1 tests are bound and green. Probe-only authorship already held; the marker peel is the change.

# ADR-001 Tasks

Implementation tasks for ADR-001: Never install a personal copy of an artifact the plugin already
serves by name. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | none |

T1 and T2 are independent — they change different functions in different files and neither consumes
the other's output. They are ordered only so the class-level rule lands before the narrowing that
follows from it.

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | `linkPlan` emits no skill entry, on any platform | pending | — | `node --test tests/standalone-link.test.mjs 2>&1 \| tee /tmp/adr001-t1.out; ! grep -qE "^not ok\|ℹ fail [1-9]\|no tests to run" /tmp/adr001-t1.out` |
| T2 | a skill the user does not have is never created by a sync | pending | — | `node --test tests/lifecycle.test.mjs 2>&1 \| tee /tmp/adr001-t2.out; ! grep -qE "^not ok\|ℹ fail [1-9]\|no tests to run" /tmp/adr001-t2.out` |

Status: `pending` | `running` | `blocked` | `done` | `failed`.

## Contract Coupling

None — T1 produces a `linkPlan` guarantee that no sibling consumes, and T2 reads a different
function.

## Notes

- Both tasks were implemented before this record was written, in v2.18.2 (`6bbff6d`). The ADR says
  so in its opening. Executing them re-runs their acceptance fences and records tool-written
  evidence against the code as it stands; it does not re-do the work.

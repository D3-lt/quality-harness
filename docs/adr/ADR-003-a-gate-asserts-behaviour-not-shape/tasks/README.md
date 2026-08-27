# ADR-003 Tasks

Implementation tasks for ADR-003: A gate asserts behaviour, not shape. See the parent ADR for the
decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | a gate with no mutation makes the suite go red | pending | — | `node --test tests/package.test.mjs …` |

Status: `pending` | `running` | `blocked` | `done` | `failed`.

## Contract Coupling

None — one task.

## Notes

- Unlike ADR-001 and ADR-002, this record was written BEFORE its task was implemented. The invariant
  it asserts already holds by accident; T1 is what makes breaking it visible.

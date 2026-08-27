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
| T1 | a gate with no mutation makes the suite go red | done | — | `node --test tests/package.test.mjs …` |

Status: `pending` | `running` | `blocked` | `done` | `failed`.

## Contract Coupling

None — one task.

## Notes

- Unlike ADR-001 and ADR-002, this record was written BEFORE its task was implemented. The invariant
  it asserts already held by accident; T1 is what makes breaking it visible.
- T1's first version was a gate that could not fail, in the task that forbids them. `adr-verify
  --mutant` reported `survived`: with a complete catalogue, replacing the enumeration with `[]` left
  the fence green because an empty list equals an empty list. The predicate is now fed a synthetic
  uncovered gate before the real one. The tool caught it; review had not.

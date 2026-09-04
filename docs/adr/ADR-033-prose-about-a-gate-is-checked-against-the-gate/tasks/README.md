# ADR-033 Tasks

Implementation tasks for ADR-033: Check the prose about a gate against the gate's actual flags. See
the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` headers. This README is
a derived index — when it disagrees with a task file, the task file wins.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | [prose about a gate is checked against the gate](T1-prose-about-a-gate-is-checked-against-the-gate.md) | pending | — | `node --test tests/flag-claim-sweep.test.mjs …` |

## Contract Coupling

None — one task.

## Notes

- The sweep catches the FLAG class only. The COUNT, VOCABULARY and CONVENTION classes found the same
  day have nothing to key on and are named in the record's Out of Scope.
- The rejected `Documents:` header is the alternative to revisit if precision degrades; the record
  keeps its reasoning rather than deleting it.

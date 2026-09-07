# ADR-036 Tasks

Implementation tasks for ADR-036: The `asserted` arm is retired, and the false-success rate is
joined to evidence rather than read off the prose. See the parent ADR for the decision.

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
| T1 | The `asserted` arm is retired, and the rate says what it rests on | pending | — | `node --test --test-name-pattern 'asserted arm is retired\|completionClaim reads negation\|honest final message' tests/lifecycle.test.mjs` |

Status: `pending` | `partial` | `blocked` | `done`.

## Contract Coupling

None — one task, no inter-task contracts.

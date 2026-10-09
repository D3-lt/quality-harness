# ADR-093 Tasks

Implementation tasks for ADR-093: An armed session leaves a commit into a literal-variable directory to git. See the parent ADR for the decision.

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
| T1 | an armed session leaves a literal-variable directory commit to git | pending | none — no spec | `node --test tests/publish-command.test.mjs` (three named tests pass) |

## Contract Coupling

None: one task.

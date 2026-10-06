# ADR-086 Tasks

Implementation tasks for ADR-086: A commit into a repository the command creates is not this checkout's publish.
See the parent ADR for the decision.

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
| T1 | an armed session leaves a mktemp-directory commit to git | done | none — no spec | `node --test tests/publish-command.test.mjs` (four named tests pass) |
| T2 | an unarmed fresh-repository commit is advised | done | none — no spec | `node --test tests/publish-command.test.mjs` (four named tests pass) |

## Contract Coupling

T2 consumes T1's `freshDirectoryVariables`, so T1 completes first.

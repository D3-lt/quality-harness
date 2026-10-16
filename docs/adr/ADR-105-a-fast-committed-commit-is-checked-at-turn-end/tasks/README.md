# ADR-105 Tasks

Implementation tasks for ADR-105: a commit its declared fast check passed on is not named unchecked at turn end. See the
parent ADR for the decision.

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
| T1 | R2 leaves out a commit its fast check passed on | done | none — no spec | `node --test tests/observed-events.test.mjs` (named test passes, nothing skipped) |

## Contract Coupling

None

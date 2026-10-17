# ADR-108 Tasks

Implementation tasks for ADR-108: the hooks say what to do next, the mrw way. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | none |
| 3 | T3 | none |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | A check that could not start says what to do | done | none — no spec | `node --test tests/adr-108.test.mjs` (named test passes, nothing skipped) |
| T2 | The subagent contract carries the mrw way | pending | none — no spec | `node --test tests/adr-108.test.mjs` (named test passes, nothing skipped) |
| T3 | A write that left the tree unchanged is named | done | none — no spec | `node --test tests/adr-108.test.mjs` (named test passes, nothing skipped) |

## Contract Coupling

None

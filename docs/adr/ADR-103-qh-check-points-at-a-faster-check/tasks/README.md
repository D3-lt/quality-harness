# ADR-103 Tasks

Implementation tasks for ADR-103: qh-check points at a faster check, and says when a run was slow for its history. See the parent
ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | none |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | a fast check is named where the runner offers one that can pass | pending | none — no spec | `node --test tests/fast-check-hint.test.mjs` (named tests pass, nothing skipped) |
| T2 | a slow run is said against its own history | pending | none — no spec | `node --test tests/slow-run.test.mjs` (named tests pass, nothing skipped) |

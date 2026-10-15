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
| 3 | T3 | T1, T2 |
| 4 | T4 | T3 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | a fast check is named where the runner offers one that can pass | done | none — no spec | `node --test tests/fast-check-hint.test.mjs` (named tests pass, nothing skipped) |
| T2 | a slow run is said against its own history | done | none — no spec | `node --test tests/slow-run.test.mjs` (named tests pass, nothing skipped) |
| T3 | a dependency is a declaration, and history ends at this run | done | none — no spec | `node --test tests/fast-check-hint.test.mjs tests/slow-run.test.mjs` (two named tests pass, nothing skipped) |
| T4 | only a dependency position declares a dependency | done | none — no spec | `node --test tests/fast-check-hint.test.mjs` (one named test passes, nothing skipped) |

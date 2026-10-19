# ADR-115 Tasks

Implementation tasks for ADR-115: a release judges the load the run did not bring. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Wave | Task | Depends-on |
|------|------|------------|
| 1 | T1 | none |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | The release check's end sample waits for the run's own load to leave | done | none — no spec | `node --test tests/release.test.mjs` (each named test passes once, nothing skipped) |

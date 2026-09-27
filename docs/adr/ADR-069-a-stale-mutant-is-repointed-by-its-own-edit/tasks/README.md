# ADR-069 Tasks

Implementation tasks for ADR-069: A stale mutant is repointed by its own edit. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers. This README is a derived index.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |

## Task Index

| Task | File | Status |
|------|------|--------|
| T1 | [T1-the-repoint-rule-and-its-read-only-flag.md](T1-the-repoint-rule-and-its-read-only-flag.md) | done |
| T2 | [T2-the-write-is-measured-before-it-is-trusted.md](T2-the-write-is-measured-before-it-is-trusted.md) | done |

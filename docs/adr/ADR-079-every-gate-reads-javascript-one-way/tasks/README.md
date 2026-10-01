# ADR-079 Tasks

Implementation tasks for ADR-079: Every gate reads JavaScript one way. See the parent ADR for the decision.

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
| T1 | spec-verify reads a JavaScript test file with the lexer | pending | F-1, F-2, UC1-S1, UC1-S2 | `node --test tests/js-reading.test.mjs` (two named tests pass) |
| T2 | adr-lint reads a JavaScript test file with the lexer | pending | F-3, F-4, F-5, F-6, UC2-S1, UC2-S2, UC2-S3 | `node --test tests/js-reading.test.mjs tests/corpus-lint.test.mjs` (four named tests pass) |

## Contract Coupling

None

## Notes

- Every test these tasks turn green was committed as node:test `todo`. Each task's first step removes `todo` from its own tests before recording the red run.

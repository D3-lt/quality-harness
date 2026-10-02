# ADR-083 Tasks

Implementation tasks for ADR-083: The lexer reads JSX. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | T1 |
| 4 | T4 | T2, T3 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | The lexer reads JSX | done | F-1, F-2, F-3, F-7, F-8, UC1-S1, UC1-S2, UC1-S3 | `node --test tests/test-lock.test.mjs` (four named tests pass) |
| T2 | A lock over JSX is taken by hasher 3 | done | F-4, F-5, UC2-S1, UC2-S2 | `node --test tests/test-lock.test.mjs` (two named tests pass) |
| T3 | The gates read JSX, and the stop-gap is gone | done | F-6, UC2-S3 | `node --test tests/js-reading.test.mjs` (one named test passes, the stop-gap names gone) |
| T4 | No verdict on this corpus changes | done | — | `bash scripts/verdict-diff.sh` (its control fails, then the comparison against e8a3de8 is empty) |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `_js_lex(…, jsx=)`, `JSX_SUFFIXES` | T2, T3 | T1 first |
| T2 | hasher 3 | T4 | T2 before T4 |

## Notes

- Every test these tasks turn green was committed as node:test `todo`. Each task's first step removes `todo` from its own tests before recording the red run.

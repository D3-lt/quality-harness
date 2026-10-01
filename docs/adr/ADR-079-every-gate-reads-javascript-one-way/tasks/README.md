# ADR-079 Tasks

Implementation tasks for ADR-079: Every gate reads JavaScript one way. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | T2 |
| 4 | T4 | T3 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | One JavaScript reader, and spec-verify reads with it | pending | F-1, F-2, F-3, F-4, UC1-S1, UC1-S2, UC1-S3 | `node --test tests/js-reading.test.mjs` (three named tests pass) |
| T2 | adr-lint finds a JavaScript test on the lexer, and UNPROVEN withholds done | pending | F-5, F-6, F-7, F-9, F-10, F-11, F-12, UC2-S1, UC2-S2, UC2-S3, UC2-S5, UC2-S6, UC2-S7, UC2-S8 | `node --test tests/js-reading.test.mjs` (seven named tests pass) |
| T3 | adr-lint judges a JavaScript body and its helpers on the code view | pending | F-8, UC2-S4 | `node --test tests/js-reading.test.mjs` (one named test passes) |
| T4 | No verdict on this corpus changes | pending | — | `bash scripts/verdict-diff.sh` (its control fails, then the comparison is empty) |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `js_test_lookup`, `JS_FAMILY_SUFFIXES` | T2, T3 | T1 first |
| T2 | `js_test_body` | T3 | T2 first |

## Notes

- Every test these tasks turn green was committed as node:test `todo`. Each task's first step removes `todo` from its own tests before recording the red run.
- The baseline T4 compares against was taken from `plugin/` frozen at `cd8f95f`, before any edit.

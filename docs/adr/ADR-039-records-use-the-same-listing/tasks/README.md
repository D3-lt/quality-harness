# ADR-039 Tasks

Implementation tasks for ADR-039: Records use the same listing. See the parent ADR for the decision.

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
| T1 | Observe passes the listing into adrCorpus | done | F-1, UC1-S1, UC1-S2 | `node --test --test-name-pattern 'observe passes the listing into adrCorpus\|a failed listing is not a disk corpus of records' tests/staged-product.test.mjs` |
| T2 | Listed records are the corpus, including leftover callers | done | F-2, F-3, UC1-S3, UC1-S4, UC2-S1, UC2-S2 | `node --test --test-name-pattern 'disk-only record files are not the corpus\|leftover adrCorpus callers use the listing, not the disk' tests/staged-product.test.mjs` |

Status: `pending` | `partial` | `blocked` | `done`.

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `adrCorpus(..., { tracked })` listing inventory | T2 | T1 before T2 |

## Notes

- Acceptance fences name the new tests so an already-green suite cannot carry the verdict.

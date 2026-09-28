# ADR-072 Tasks

Implementation tasks for ADR-072: A mutant runs only the tests that kill it. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers. This README is a derived index.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T4 | T2 |
| 4 | T5 | T4 |
| 5 | T3 | T2, T4, T5 |

## Task Index

| Task | File | Status |
|------|------|--------|
| T1 | [T1-the-cache-records-killers.md](T1-the-cache-records-killers.md) | done |
| T2 | [T2-narrow-proposes-and-writes-only-what-it-measured.md](T2-narrow-proposes-and-writes-only-what-it-measured.md) | done |
| T3 | [T3-the-catalogue-narrowed-and-the-campaign-measured.md](T3-the-catalogue-narrowed-and-the-campaign-measured.md) | done |
| T4 | [T4-the-review-findings-closed.md](T4-the-review-findings-closed.md) | done |
| T5 | [T5-the-second-review-closed.md](T5-the-second-review-closed.md) | done |

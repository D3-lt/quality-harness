# ADR-074 Tasks

Implementation tasks for ADR-074: One Status reading and one record definition for every reader. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers. This README is a derived index.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | T2 |
| 4 | T4 | none |

## Task Index

| Task | File | Status |
|------|------|--------|
| T1 | [T1-one-status-reader.md](T1-one-status-reader.md) | done |
| T2 | [T2-a-status-section-is-read.md](T2-a-status-section-is-read.md) | pending |
| T3 | [T3-a-record-by-name-is-a-canonical-adr-name.md](T3-a-record-by-name-is-a-canonical-adr-name.md) | pending |
| T4 | [T4-an-unsigned-human-proof-is-advised.md](T4-an-unsigned-human-proof-is-advised.md) | pending |

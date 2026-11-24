# ADR-145 Tasks

Implementation tasks for ADR-145: `adr-next` answers a batch of task directories in one process, and `work-next` takes an
answer only well inside the single call's limits.

**Source of truth:** task-file Depends-on, Produces, Consumes and Covers headers.

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | `adr-next --batch` answers each directory as its own process would | done | none — no spec | `node --test tests/adr-next-batch.test.mjs` |
| T2 | `work-next` asks once, and takes an answer only inside the margins | pending | none — no spec | `node --test tests/work-next-batch.test.mjs` |
| T3 | The gain is measured on this design before it ships | pending | none — no spec | human-observed |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `adr-next --batch`, `the batch frame` | T2 | The mode before its caller |
| T2 | `batchedAnswers` | T3 | The caller before its measurement |

## Notes

- T3 needs an uncontended machine and this repository's own corpus; it is not hermetic.
- Accepted by the owner 2026-11-24.

# ADR-142 Tasks

Implementation tasks for ADR-142: The decision readers bound their reads in bytes and say what they did not read.

**Source of truth:** task-file Depends-on, Produces, Consumes and Covers headers.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T4 | none |
| 2 | T1 | T4 |
| 3 | T2 | T1, T4 |
| 4 | T3 | T4 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | Every read in a look stops at 512 KiB, and says so | pending | none — no spec | `node --test tests/decision-file-limit.test.mjs` |
| T2 | One byte budget per look, the archive walk included | pending | none — no spec | `node --test tests/decision-byte-budget.test.mjs` |
| T3 | The core reads one file once, however its listing spells it | pending | none — no spec | `node --test tests/decision-case-identity.test.mjs` |
| T4 | The decision context says PARTIAL when the look did not read something that could carry scope | pending | none — no spec | `node --test tests/decision-context-partial.test.mjs` |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T4 | `incomplete`, the PARTIAL line, `tests/helpers/decision-rows.mjs` | T1, T2, T3 | The line lands before any limit that adds a cause to it |
| T1 | the bounded cached reader | T2 | The per-file bound before the budget that charges it |

## Notes

- T4 is first on purpose: no limit may land before the edit can say what it did not read (ADR-142 Decision 1).

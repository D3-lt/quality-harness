# ADR-101 Tasks

Implementation tasks for ADR-101: One reader per check ledger. See the parent ADR for the decision.

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
| T1 | The session log has one verdict reader; treeChecked is gone | done | none — no spec | two named tests, the goldens and decision tables, a clean `mutate.mjs --stale` |
| T2 | checks.jsonl and fast-checks.jsonl are read by one strict reader | done | none — no spec | two named tests, the prose-reuse and ledger suites, the goldens, a clean `mutate.mjs --stale` |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T2 | `ledgerPass` | `passedAlready`, `latestFastPass` (same task) | none across tasks |

## Notes

- T1 and T2 edit disjoint functions of one file; run them in either order, not at once.

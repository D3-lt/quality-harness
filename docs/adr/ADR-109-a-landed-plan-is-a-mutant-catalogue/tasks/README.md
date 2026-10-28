# ADR-109 Tasks

Implementation tasks for ADR-109: a landed plan is a mutant catalogue. See the parent ADR for the decision.

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
| T1 | Measure what the tests do not see in this repository's own landed hunks | done | none — no spec | human-observed: the counts in the record's Follow-ups |
| T2 | adr-verify runs a landed plan's inverses, and breaks its invariants, as mutants | pending | none — no spec | `node --test tests/inverse-plan.test.mjs` (named test passes, nothing skipped) |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | the counts in Follow-ups | T2 | T2 only if T1 crosses the threshold |

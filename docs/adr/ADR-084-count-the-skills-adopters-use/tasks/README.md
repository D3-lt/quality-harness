# ADR-084 Tasks

Implementation tasks for ADR-084: Count the skills adopters use, and read the ledgers in one report.
See the parent ADR for the decision.

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
| T1 | a Skill call is recorded and prints nothing | done | none — no spec | `node --test tests/skill-usage.test.mjs` (two named tests pass) |
| T2 | ledger-report reads the ledgers | done | none — no spec | `node --test tests/ledger-report.test.mjs` (two named tests pass) |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `skill.invoked` event | T2 | T1 first |

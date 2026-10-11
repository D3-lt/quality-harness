# ADR-095 Tasks

Implementation tasks for ADR-095: A hook does not repeat work whose inputs have not changed. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | T1 |
| 4 | T4 | T1 |
| 5 | T5 | T3 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | a tool counts the children, repeats and reads of one hook event | done | none — no spec | `node --test tests/hook-cost.test.mjs` (three named tests pass) |
| T2 | the ready-task lines come from a cache keyed by content | withdrawn | none — no spec | withdrawn before release, see the parent record; its evidence stays in the log |
| T3 | a hook process asks git for the repository's identity once | done | none — no spec | `node --test tests/identity-memo.test.mjs` (three named tests pass) |
| T4 | the gate says the concurrency and the load it ran under, and takes an override | done | none — no spec | `node --test tests/gate-concurrency.test.mjs` (three named tests pass) |
| T5 | a hook event reads the working tree status once | done | none — no spec | `node --test tests/status-memo.test.mjs` (three named tests pass) |

## Contract Coupling

T1 produces `scripts/hook-cost.mjs --json`, which T2, T3 and T4 use for their before and after figures.

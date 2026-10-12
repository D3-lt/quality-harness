# ADR-097 Tasks

Implementation tasks for ADR-097: Remove what nothing acts on. See the parent ADR for the decision.

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
| T1 | `verify.mjs` is removed, and nothing shipped sends an agent to it | done | none — no spec | `node --test tests/subtracted.test.mjs` (one named test passes) |
| T2 | eval tooling leaves the shipped plugin, and the keyless evals workflow goes | pending | none — no spec | `node --test tests/subtracted.test.mjs` (one named test passes) |

## Contract Coupling

None

## Notes

- T1 retakes the lock maps of three tasks in other records (ADR-068 T2, ADR-075 T2, ADR-091 T3); a relock snapshots hashes and runs no fence.

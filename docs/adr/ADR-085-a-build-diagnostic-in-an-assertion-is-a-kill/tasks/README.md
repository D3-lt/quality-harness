# ADR-085 Tasks

Implementation tasks for ADR-085: A build diagnostic inside a failing assertion is a kill.
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
| T1 | a nested build failure inside a failing assertion is a kill | done | none — no spec | `node --test tests/evidence-chain.test.mjs` (three named tests pass) |
| T2 | a Go setup failure or a TAP parse error is not a kill | pending | none — no spec | `node --test tests/evidence-chain.test.mjs` (four named tests pass) |

## Contract Coupling

None — T2 follows T1 only because both edit `BUILD_BROKE`.

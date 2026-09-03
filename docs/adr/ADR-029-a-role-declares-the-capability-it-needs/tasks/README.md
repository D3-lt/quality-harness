# ADR-029 Tasks

Implementation tasks for ADR-029: A spawned role declares the capability it needs. See the parent
ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` headers. This README is
a derived index — when it disagrees with a task file, the task file wins.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | [every spawned role declares a capability](T1-every-spawned-role-declares-a-capability.md) | done | — | `node --test tests/workflows.test.mjs …` |
| T2 | [the spawn says what it was asked to be](T2-the-spawn-says-what-it-was-asked-to-be.md) | pending | — | `node --test tests/lifecycle.test.mjs …` |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | every shipped `agent()` call carries `model` | T2 | T1 before T2 — T2 reports the declared role and has nothing to report until T1 declares one |

## Notes

- T1 sets the aliases; the parent ADR deliberately does NOT name which role gets which. An
  assignment written in prose drifts from the call sites it describes, and the call sites are what
  the test reads.

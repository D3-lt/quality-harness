# ADR-096 Tasks

Implementation tasks for ADR-096: Turn-end findings reach the agent. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | T2 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | the host continues a turn on Stop context, and §3 names it | done | none — no spec | `node --test tests/turn-end-delivery.test.mjs` (one named test passes) |
| T2 | Stop delivers findings to the agent, each with an identity, once per tree | done | none — no spec | `node --test tests/turn-end-delivery.test.mjs tests/hook-goldens.test.mjs` (six named tests pass) |
| T3 | a project can keep turn-end findings user-only, and the skill says how | done | none — no spec | `node --test tests/turn-end-delivery.test.mjs` (two named tests pass) |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | the live observation of Stop `additionalContext` | T2 | T1 before T2 |
| T2 | `deliver` emitting `additionalContext` on Stop | T3 | T2 before T3 |

## Notes

- T1 needs a live session in a scratch project; nothing in `plugin/` changes until it confirms the host.

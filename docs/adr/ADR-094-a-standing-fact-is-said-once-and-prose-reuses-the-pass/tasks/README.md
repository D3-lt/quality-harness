# ADR-094 Tasks

Implementation tasks for ADR-094: A standing fact is said once, and a prose-only change reuses the last pass. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T4 | none |
| 3 | T2 | T4 |
| 4 | T3 | T2 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | a red CI is said in full once, and a withheld snapshot says nothing | done | none — no spec | `node --test tests/branch-state.test.mjs` (three named tests pass) |
| T4 | a write outside the repository is not an unseen write | done | none — no spec | `node --test tests/outside-root-writes.test.mjs` (two named tests pass) |
| T2 | SessionStart says a standing paragraph once, and the notice only without a pass | done | none — no spec | `node --test tests/standing-facts.test.mjs` (four named tests pass) |
| T3 | a prose-only change reuses the last pass where the project declared it | pending | none — no spec | `node --test tests/prose-reuse.test.mjs` (six named tests pass) |

## Contract Coupling

T4 produces `unobservableWrites(log, root)`, which T2's notice count consumes. T2 produces `passedAlready` and `firstMentionHere` in `lifecycle.mjs`, which T3 consumes.

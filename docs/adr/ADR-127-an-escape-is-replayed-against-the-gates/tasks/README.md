# ADR-127 Tasks

Implementation tasks for ADR-127: every defect that escaped to someone outside is replayed against today's tests. See the
parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Task Index

| ID | Title | Status | Depends-on | Covers | Acceptance |
|----|-------|--------|------------|--------|------------|
| [T1](T1-the-escape-catalogue.md) | Every BACKLOG section is classified, and every defect found outside is a catalogue entry | pending | none | none — no spec | `node --test tests/escapes.test.mjs`, named tests |
| [T2](T2-the-replay.md) | escapes.mjs reverses each fix in a fresh worktree and says how its own tests respond | pending | T1 | none — no spec | `node --test tests/escapes-replay.test.mjs`, named tests |
| [T3](T3-the-report.md) | One land job runs the replay, and release-evidence prints its count as advice | pending | T2 | none — no spec | `node --test tests/escapes-report.test.mjs`, named tests |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | the escape entry schema and the README classification | T2 | T1 before T2 |
| T2 | `escapes.mjs` and its report | T3 | T2 before T3 |

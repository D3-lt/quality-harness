# ADR-107 Tasks

Implementation tasks for ADR-107: the plugin works the mrw way. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | none |
| 3 | T3 | T1 |
| 4 | T4 | T1, T3 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | The implementing skills teach the mrw way | done | none — no spec | `node --test tests/mrw-way.test.mjs` (named test passes, nothing skipped) |
| T2 | The plugin's own writers refuse an edit that did nothing | pending | none — no spec | human-observed: the audit and each fix's test |
| T3 | A session with mrw on PATH is told it is there | done | none — no spec | `node --test tests/mrw-way.test.mjs` (named test passes, nothing skipped) |
| T4 | A later benchmark stage measures the batching cue | pending | none — no spec | human-observed: the stage's sign-off |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | the `## Read and edit in batches` section | T3, T4 | T1 before T3 |
| T3 | the `mrw`-present line | T4 | T3 before T4 |

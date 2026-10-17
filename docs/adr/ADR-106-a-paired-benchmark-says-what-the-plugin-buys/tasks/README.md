# ADR-106 Tasks

Implementation tasks for ADR-106: measure what the plugin buys with a paired benchmark that hidden tests grade. See the parent
ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T4 | T1 |
| 4 | T3 | T2, T4 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | The paired scorer | done | none — no spec | `node --test tests/eval-paired.test.mjs` (each named test passes once, nothing skipped) |
| T2 | The pilot checks the plumbing, and the pre-registrations are committed | done | none — no spec | human-observed: the pilot's sign-off line |
| T3 | The main run and its verdict | pending | none — no spec | human-observed: the main run's sign-off line |
| T4 | The aggregate verdict file | done | none — no spec | `node --test tests/eval-paired.test.mjs` (the verdict-file test passes once, nothing skipped) |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | the paired-rows format, the pre-registration's fields and the verdict words | T2, T3 | T1 before T2 |
| T2 | `prereg-main-claude-sonnet-5-5.json`, `prereg-main-claude-opus-5-5.json` | T3 | T2 before T3 |
| T4 | `--verdict-out` and the verdict file's keys | T3 | T4 before T3 |

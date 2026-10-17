# ADR-110 Tasks

Implementation tasks for ADR-110: a static core owns the hooks, and the lifecycle is opt-in. See the parent ADR for the
decision.

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
| T1 | qh hook passes every hook golden byte for byte | pending | none — no spec | `QUALITY_HARNESS_HOOK_IMPL=go node --test tests/hook-goldens.test.mjs` (every scenario passes, nothing skipped) |
| T2 | The core is measured against the Node path | pending | none — no spec | human-observed: the numbers in the record's Follow-ups |
| T3 | hooks.json points at qh, and the lifecycle is named where a corpus exists | pending | none — no spec | `node --test tests/hook-goldens.test.mjs tests/core-install.test.mjs` (every scenario passes, nothing skipped) |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `qh hook <event>` passing every golden | T2, T3 | T1 before T2 |
| T2 | the numbers in Follow-ups | T3 | T2 before T3 |

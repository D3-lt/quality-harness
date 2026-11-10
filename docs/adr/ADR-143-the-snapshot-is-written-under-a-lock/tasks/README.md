# ADR-143 Tasks

Implementation tasks for ADR-143: The branch-state snapshot is written under an OS file lock.

**Source of truth:** task-file Depends-on, Produces, Consumes and Covers headers.

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | An OS file lock the kernel releases on death | pending | none — no spec | `node --test tests/core-file-lock.test.mjs` |
| T2 | The snapshot's writers hold the file lock | pending | none — no spec | `node --test tests/branch-state-collect.test.mjs` |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `lockFile(path, wait)`, `unlock` | T2 | The lock before its caller |

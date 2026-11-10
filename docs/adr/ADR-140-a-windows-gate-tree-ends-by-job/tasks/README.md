# ADR-140 Tasks

Implementation tasks for ADR-140: On Windows the core ends a gate's tree through a job object.

**Source of truth:** task-file Depends-on, Produces, Consumes and Covers headers.

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | A platform-neutral job-tree routine with a kernel seam | pending | none — no spec | `node --test tests/core-win-tree.test.mjs` |
| T2 | The shell hook adopts its gate into a job | pending | none — no spec | `node --test tests/core-win-tree.test.mjs tests/shell-hook-native.test.mjs` |
| T3 | run() adopts its command into a job | pending | none — no spec | `node --test tests/core-win-tree.test.mjs tests/core-run-tree.test.mjs` |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `winAdopt(ops, pid)`, `winEnd(ops, tree, pid)`, `winRelease` | T2, T3 | The routine before either caller |

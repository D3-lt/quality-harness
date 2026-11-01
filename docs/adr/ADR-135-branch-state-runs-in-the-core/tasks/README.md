# ADR-135 Tasks

Implementation tasks for ADR-135: Branch state runs in the core.

**Source of truth:** task-file Depends-on, Produces, Consumes and Covers headers.

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | The core's pure branch-state functions answer as Node's do | done | none — no spec | `node --test tests/branch-state-parity.test.mjs` |
| T2 | The core collects the git, release and CI halves under one budget | pending | none — no spec | `go test ./hooks -run BranchStateCollect` |
| T3 | The core serves, suppresses and refreshes branch state inline | pending | none — no spec | `node --test tests/branch-state-native.test.mjs` |
| T4 | The hooks call the core's branch state | pending | none — no spec | `node --test tests/branch-state-native.test.mjs tests/qh-launcher.test.mjs` |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `branchstate.go` pure functions | T2, T3 | Render and keys before collection |
| T2 | `collectBranchState` | T3 | Collection before serving |
| T3 | native `qh bridge branch-state` | T4 | Served and proved before the hooks switch |

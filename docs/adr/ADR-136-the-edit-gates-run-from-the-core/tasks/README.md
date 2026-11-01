# ADR-136 Tasks

Implementation tasks for ADR-136: The edit gates run from the core.

**Source of truth:** task-file Depends-on, Produces, Consumes and Covers headers.

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | The core's shell-hook helpers answer as Node's do | done | none — no spec | `node --test tests/shell-hook-parity.test.mjs` |
| T2 | The core runs post-edit-check as runShellHook does | pending | none — no spec | `node --test tests/shell-hook-native.test.mjs` |
| T3 | The core runs the facts gate as runEditGate does | pending | none — no spec | `node --test tests/shell-hook-native.test.mjs` |
| T4 | The registrations call the core's runner | pending | none — no spec | `node --test tests/shell-hook-native.test.mjs tests/native-observation.test.mjs tests/qh-launcher.test.mjs` |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `shellhook.go` helpers | T2, T3 | Helpers before the runner |
| T2 | native `runShellHook` | T3, T4 | The runner before the edit gate wraps it |
| T3 | native `runEditGate` | T4 | Both registered runs before the switch |

# ADR-137 Tasks

Implementation tasks for ADR-137: The decision-context hook runs in the core.

**Source of truth:** task-file Depends-on, Produces, Consumes and Covers headers.

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | The core's record rules answer as Node's do | done | none — no spec | `node --test tests/decision-context-parity.test.mjs` |
| T2 | The core's decision context matches Node's over real corpora | pending | none — no spec | `node --test tests/decision-context-replay.test.mjs` |
| T3 | PreToolUse asks the core, not Node | pending | none — no spec | `node --test tests/decision-context-replay.test.mjs tests/native-hooks.test.mjs` |
| T4 | The core's decision context answers per platform | pending | none — no spec | `node --test tests/decision-context-parity.test.mjs` |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `decisioncorpus.go` record rules | T2, T4 | Rules before the corpus reader |
| T2 | Go `decisionContext` | T3, T4 | Proved over real corpora before the hook switches |

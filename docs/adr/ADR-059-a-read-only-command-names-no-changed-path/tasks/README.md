# ADR-059 Tasks

Implementation tasks for ADR-059: A read-only command's arguments are not changed paths. See the parent ADR for the decision.

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
| T1 | A channel-free read names no changed path | done | none — no spec | `node --test … tests/read-only-arguments.test.mjs` + `node --test tests/lifecycle.test.mjs tests/advice-accuracy.test.mjs` |
| T2 | A family that can write names no changed path until it uses that channel | pending | none — no spec | `node --test … tests/read-only-arguments.test.mjs` + `node --test tests/lifecycle.test.mjs tests/advice-accuracy.test.mjs` |
| T3 | An assigned path used only by reads is not a changed path | pending | none — no spec | `node --test … tests/read-only-arguments.test.mjs` + `node --test tests/lifecycle.test.mjs tests/advice-accuracy.test.mjs` |

Status: `pending` | `partial` | `blocked` | `done`.

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `READ_ARGUMENT_FAMILIES` table and `readsOnlyItsArguments` | T2, T3 | T1 before T2 and T3 |
| T1 | `tests/read-only-arguments.test.mjs` (file exists) | T2, T3 | serialised so one writer owns the new file |

## Notes

- Test bodies must not contain regex literals with quotes, backticks or parentheses (BACKLOG §212); keep patterns at module scope.
- Every fence runs `tests/advice-accuracy.test.mjs`, so ADR-058 T3 and T5 keep their behaviour through the refactor.

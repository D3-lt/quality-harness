# ADR-059 Tasks

Implementation tasks for ADR-059: A read-only command's arguments are not changed paths. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Wave | Tasks | Depends-on |
|------|-------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | T2 |
| 4 | T4 | T3 |
| 5 | T5 | T4 |
| 6 | T6 | T5 |
| 7 | T7 | T6 |
| 8 | T8 | T7 |

Every task edits `tests/read-only-arguments.test.mjs`, so each wave holds one task.

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | A channel-free read names no changed path | done | none — no spec | `node --test … tests/read-only-arguments.test.mjs` + `node --test tests/lifecycle.test.mjs tests/advice-accuracy.test.mjs` |
| T2 | A family that can write names no changed path until it uses that channel | done | none — no spec | `node --test … tests/read-only-arguments.test.mjs` + `node --test tests/lifecycle.test.mjs tests/advice-accuracy.test.mjs` |
| T3 | An assigned path used only by reads is not a changed path | done | none — no spec | `node --test … tests/read-only-arguments.test.mjs` + `node --test tests/lifecycle.test.mjs tests/advice-accuracy.test.mjs` |
| T4 | A used write channel is a write to the classifier and the guard | done | none — no spec | `node --test … tests/read-only-arguments.test.mjs` + `node --test tests/lifecycle.test.mjs tests/advice-accuracy.test.mjs tests/classify.test.mjs tests/reviewer-guard.test.mjs` |
| T5 | A variable inside a redirect target is still a changed path | done | none — no spec | `node --test … tests/read-only-arguments.test.mjs` + `node --test tests/lifecycle.test.mjs tests/advice-accuracy.test.mjs` |
| T6 | A failed command that also writes is still a write | done | none — no spec | `node --test … tests/read-only-arguments.test.mjs` + `node --test tests/lifecycle.test.mjs tests/advice-accuracy.test.mjs` |
| T7 | An escaped quote does not hide a redirect target | done | none — no spec | `node --test … tests/read-only-arguments.test.mjs` + `node --test tests/lifecycle.test.mjs tests/advice-accuracy.test.mjs` |
| T8 | An escaped character is part of its word in every redirect scan | done | none — no spec | `node --test … tests/read-only-arguments.test.mjs` + `node --test tests/lifecycle.test.mjs tests/advice-accuracy.test.mjs tests/classify.test.mjs tests/reviewer-guard.test.mjs` |

Status: `pending` | `partial` | `blocked` | `done`.

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `READ_ARGUMENT_FAMILIES` table and `readsOnlyItsArguments` | T2, T3 | T1 before T2 and T3 |
| T1 | `tests/read-only-arguments.test.mjs` (file exists) | T2, T3 | serialised so one writer owns the new file |

## Notes

- Test bodies must not contain regex literals with quotes, backticks or parentheses (BACKLOG §212); keep patterns at module scope.
- Every fence runs `tests/advice-accuracy.test.mjs`, so ADR-058 T3 and T5 keep their behaviour through the refactor.

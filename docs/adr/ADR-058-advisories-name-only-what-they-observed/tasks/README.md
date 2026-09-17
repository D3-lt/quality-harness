# ADR-058 Tasks

Implementation tasks for ADR-058: The commit and completion advisories name only what they observed. See the parent ADR for the decision.

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

Every task touches `tests/advice-accuracy.test.mjs`, so each wave holds one task.

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | A timeout-wrapped check is a check | done | none — no spec | `node --test … tests/advice-accuracy.test.mjs` + `node --test tests/classify.test.mjs tests/unread-advice.test.mjs` |
| T2 | mrw read is a read | done | none — no spec | `node --test … tests/advice-accuracy.test.mjs` + `node --test tests/classify.test.mjs tests/reviewer-guard.test.mjs` |
| T3 | Echo and printf arguments are not changed paths | done | none — no spec | `node --test … tests/advice-accuracy.test.mjs` + `node --test tests/lifecycle.test.mjs` |
| T4 | A commit elsewhere does not arm this repository's advisory | done | none — no spec | `node --test … tests/advice-accuracy.test.mjs` + `node --test tests/unread-advice.test.mjs tests/leftovers-after-adr053.test.mjs` |
| T5 | wc, grep, git ls-files and mrw read arguments are not changed paths | done | none — no spec | `node --test … tests/advice-accuracy.test.mjs` + `node --test tests/lifecycle.test.mjs` |
| T6 | A wrapper's file operand is still a changed path | done | none — no spec | `node --test … tests/advice-accuracy.test.mjs` + `node --test tests/advice-accuracy.test.mjs tests/lifecycle.test.mjs` |
| T7 | A nested publish or a repository override still arms the commit advisory | done | none — no spec | `node --test … tests/advice-accuracy.test.mjs` + `node --test tests/advice-accuracy.test.mjs tests/unread-advice.test.mjs` |

Status: `pending` | `partial` | `blocked` | `done`.

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `tests/advice-accuracy.test.mjs` (file exists) | T2, T3, T4, T5, T6, T7 | serialised so one writer owns the new file |

## Notes

- Test bodies must not contain regex literals with quotes, backticks or parentheses: the test-lock hasher does not mask them (BACKLOG §212). Keep patterns at module scope or build them with `new RegExp('…')`.
- Run each check bare — `bash scripts/selftest.sh`, or bounded as `gtimeout 590 bash scripts/selftest.sh` once T1 lands — never behind `;`, a pipe or a redirect (CLAUDE.md §2).
- `adr-lint` advises that ADR-058's `Enforced-by:` names tests that do not exist yet. That is expected until T1–T4 add them to `tests/advice-accuracy.test.mjs`.

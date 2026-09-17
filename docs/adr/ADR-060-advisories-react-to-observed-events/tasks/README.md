# ADR-060 Tasks

Implementation tasks for ADR-060: Advisories react to observed events, not to parsed commands. See the parent ADR for the decision.

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

Every task edits `tests/observed-events.test.mjs` and `plugin/scripts/lifecycle.mjs`, so each wave holds one task.

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | Events are named and the tree is observed | pending | none — no spec | `node --test … tests/observed-events.test.mjs` + `node --test tests/lifecycle.test.mjs` |
| T2 | qh-check writes the check event | pending | none — no spec | `node --test … tests/observed-events.test.mjs` + `node --test tests/gates.test.mjs tests/package.test.mjs` |
| T3 | A read-only role cannot commit or push, and its other changes are reported | pending | none — no spec | `node --test … tests/observed-events.test.mjs` + `node --test tests/reviewer-guard.test.mjs` |
| T4 | A command naming commit or push is warned before it runs | pending | none — no spec | `node --test … tests/observed-events.test.mjs` + `node --test tests/lifecycle.test.mjs …` |
| T5 | Completion rules advise once per rule and evidence | pending | none — no spec | `node --test … tests/observed-events.test.mjs` + `node --test tests/lifecycle.test.mjs tests/claims-rate.test.mjs tests/statusline.test.mjs` |
| T6 | Artifacts and notes read observed changes | pending | none — no spec | `node --test … tests/observed-events.test.mjs` + `node --test tests/lifecycle.test.mjs tests/staged-product.test.mjs` |
| T7 | The command classifiers are deleted | pending | none — no spec | `node --test … tests/observed-events.test.mjs` + `bash scripts/selftest.sh` |

Status: `pending` | `partial` | `blocked` | `done`.

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `observe(cwd)`, the state directory, the session event log and delivery | T2, T3, T4, T5, T6, T7 | T1 first |
| T1 | `tests/observed-events.test.mjs` (file exists) | T2, T3, T4, T5, T6, T7 | one writer creates the file |
| T2 | `checks.jsonl` written by `qh-check` | T3, T4, T5 | T2 before T3, so a reviewer's `qh-check` exists |
| T3 | the word rule, the reviewer deny and R3 | T4, T7 | T3 before T4 |
| T4 | rule P | T5, T6, T7 | T4 before T5 |
| T5 | rules R1, R2 and R4, the ledger and the statusline | T6, T7 | T5 before T6 |
| T6 | rule A, the deletion bases and the observing notes | T7 | T6 before the deletion |

## Notes

- T3 lands before any task names `qh-check` in guidance, so a reviewer is never refused the check it is told to run.
- The old artifact calls stay until T6 replaces them, and the old completion advisories until T5, so no task leaves artifacts unchecked.
- Tasks are not released separately; the release follows T7 and the Codex review in ADR-060's Follow-ups.
- Each task retires or repins the `tests/mutations.json` entries whose `from` lives in code it removes, so no entry stops matching between tasks. Counted 2026-09-17: 22 of 957 entries on `lifecycle.mjs` mention the commit advisory, publish recognition or PreToolUse output.
- T7 deletes only what nothing calls after T3–T6.
- Test bodies must not contain regex literals with quotes, backticks or parentheses (BACKLOG §212). Tests spawn `git` only in directories they create (CLAUDE.md §9).

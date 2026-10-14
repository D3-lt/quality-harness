# ADR-102 Tasks

Implementation tasks for ADR-102: A syntax finding at the edit reaches the agent. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T3 | T1 |
| 3 | T2 | T1, T3 |
| 4 | T4 | T3 |
| 5 | T5 | T1 |
| 6 | T6 | T3, T4, T5 |
| 7 | T7 | T6 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | the post-edit check is quiet on a clean file | done | none — no spec | `node --test tests/post-edit-check.test.mjs` (one named test passes) |
| T2 | a syntax finding at the edit reaches the agent | done | none — no spec | `node --test tests/post-edit-check.test.mjs` (one named test passes) |
| T3 | a finding comes only from the file's own parser | done | none — no spec | `node --test tests/post-edit-check.test.mjs` (one named test passes, nothing skipped) |
| T4 | a finding names the edited file and gives the error alone | done | none — no spec | `node --test tests/post-edit-check.test.mjs` (one named test passes, nothing skipped) |
| T5 | a PHP finding is said once | done | none — no spec | `node --test tests/post-edit-check.test.mjs` (one named test passes, nothing skipped) |
| T6 | JSONC is read as TypeScript reads it, and a silent checker failure is UNRUN | done | none — no spec | `node --test tests/post-edit-check.test.mjs` (two named tests pass, nothing skipped) |
| T7 | a comma with no value before it is not a trailing comma | done | none — no spec | `node --test tests/post-edit-check.test.mjs` (one named test passes, nothing skipped) |

## Contract Coupling

T1 → T2: "stdout is empty for a clean file" (`post-edit-check.sh`). T3 → T2: "a finding is a syntax error from the file's own parser" (`post-edit-check.sh`).

## Notes

- No test was locked on `tests/post-edit-check.test.mjs` when the record was written (`scripts/test-locks.py`, 2026-10-14: 0 locks); T1's evidence locked eight, and T3 retakes that lock map (the Amendment).

# ADR-102 Tasks

Implementation tasks for ADR-102: A syntax finding at the edit reaches the agent. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | the post-edit check is quiet on a clean file | done | none — no spec | `node --test tests/post-edit-check.test.mjs` (one named test passes) |
| T2 | a syntax finding at the edit reaches the agent | pending | none — no spec | `node --test tests/post-edit-check.test.mjs` (one named test passes) |

## Contract Coupling

T1 → T2: "stdout is empty for a clean file" (`post-edit-check.sh`).

## Notes

- No test is locked on `tests/post-edit-check.test.mjs` (`scripts/test-locks.py`, 2026-10-14: 0 locks).

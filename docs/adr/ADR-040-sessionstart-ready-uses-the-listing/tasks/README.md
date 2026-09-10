# ADR-040 Tasks

Implementation tasks for ADR-040: SessionStart ready uses the listing. See the parent ADR for the decision.

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
| T1 | SessionStart inventories ready task dirs from the listing | done | F-1, UC1-S1, UC1-S2, UC1-S3 | `node --test --test-name-pattern 'SessionStart offers ready tasks the listing named\|a disk-only task dir is not in flight\|git cannot list is UNPROVEN, not no ready tasks' tests/lifecycle.test.mjs` |
| T2 | SessionStart corpus existence uses the listing | done | F-2, UC2-S1, UC2-S2, UC2-S3 | `node --test --test-name-pattern 'SessionStart may treat a listing-named corpus dir as a corpus\|a disk-only corpus dir is not a corpus\|git cannot list is UNPROVEN, not no corpus' tests/lifecycle.test.mjs` |

Status: `pending` | `partial` | `blocked` | `done`.

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | listing-shaped `{ look, lines }` from `readyTaskLines` | T2 | T1 before T2 |

## Notes

- Git-fail fixtures corrupt `.git/index` so `rev-parse` succeeds and `ls-files` fails.

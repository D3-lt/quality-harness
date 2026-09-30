# ADR-076 Tasks

Implementation tasks for ADR-076: A recorded mutant runs in a worktree. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | T1 |
| 4 | T4 | T2 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | One worktree module, shipped, with an ownership contract any caller can keep | done | F-8 | `node --test tests/worktree.test.mjs tests/mutate-isolation.test.mjs` (six named tests pass, and the runner exits 0) |
| T2 | adr-verify --mutant runs in a worktree | done | F-2, F-3, F-4, F-5, F-6, F-7, F-8, F-11, F-12, UC1-S1, UC1-S2, UC1-S3, UC1-S4, UC1-S5, UC1-S6 | `node --test tests/adr-verify-isolation.test.mjs` (eight named tests pass, the signal test passes or is the named Windows skip, and the runner exits 0) |
| T3 | unasserted.mjs runs in a worktree | pending | F-9, F-10, F-13, UC2-S1, UC2-S2 | `node --test tests/unasserted-isolation.test.mjs` (five named tests pass, and the runner exits 0) |
| T4 | Paired verdicts over three real task files | pending | F-6 | human-observed: the signed-off pinned replays |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `build`, `remove`, `sweep`, `addOwned` and `owner.json` in `plugin/scripts/worktree.mjs` | T2, T3 | T1 first |
| T2 | `adr-verify --in-place` and its first line | T4 | T2 before T4 |

## Notes

- Every test these tasks turn green was committed as node:test `todo` (the spec binding). Each task's first step removes `todo` from its own tests before recording the red run.
- Every Acceptance carries the runner's exit status through `pipefail` and `&&`, as ADR-075's do.

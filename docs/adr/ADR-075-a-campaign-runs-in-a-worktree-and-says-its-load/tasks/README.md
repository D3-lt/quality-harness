# ADR-075 Tasks

Implementation tasks for ADR-075: A campaign runs in a worktree, and every result says the load it ran under. See the parent ADR for the decision.

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
| T1 | qh-check and a campaign say the load they ran under | pending | F-10, UC2-S1, UC2-S2, UC2-S3 | `node --test tests/qh-check.test.mjs` (three named tests pass) |
| T2 | A campaign runs in a throwaway worktree of the working-tree content | pending | F-1, F-2, F-8, F-9, F-12, F-13, F-14, UC1-S1, UC1-S2, UC1-S3, UC1-S4, UC1-S5 | `node --test tests/mutate-isolation.test.mjs` (seven named tests pass) |
| T3 | A campaign in the checkout names who it exposes | pending | F-11, UC3-S1, UC3-S2, UC3-S3 | `node --test tests/mutate-isolation.test.mjs` (the exposure test passes) |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `loadLine` in `plugin/scripts/load.mjs` | T2 | T1 before T2: the isolated parent prints the line once |
| T2 | `--in-place`, `isolate()` and `QUALITY_HARNESS_CAMPAIGN_CHILD` | T3 | T2 before T3 |

## Notes

- Every test these tasks turn green was committed as node:test `todo` (the spec binding). Each task's first step removes `todo` from its own tests before recording the red run: a todo test passes the suite whatever it asserts, so it cannot be a red.
- The cache crossing the boundary is part of T2, not a task of its own: T2's own Acceptance runs the tests that read the cache a default campaign leaves (the cold review, 2026-09-30).

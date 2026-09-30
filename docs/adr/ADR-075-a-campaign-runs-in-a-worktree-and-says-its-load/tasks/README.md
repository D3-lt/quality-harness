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
| 4 | T4 | T2 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | qh-check and a campaign say the load at their ends | done | F-10, UC2-S1, UC2-S2, UC2-S3, UC2-S4 | `node --test tests/qh-check.test.mjs` (four named tests pass, and the runner exits 0) |
| T2 | A campaign runs in a worktree of the working-tree content, in the git directory | pending | F-1, F-2, F-8, F-9, F-12, F-13, F-14, F-15, F-16, UC1-S1, UC1-S2, UC1-S3, UC1-S4, UC1-S5, UC1-S6, UC1-S7, UC1-S8 | `node --test tests/mutate-isolation.test.mjs` (eleven named tests pass, and the runner exits 0) |
| T3 | A campaign in the checkout names who it exposes | pending | F-11, UC3-S1, UC3-S2, UC3-S3 | `node --test tests/mutate-isolation.test.mjs` (the exposure test passes, and the runner exits 0) |
| T4 | An isolated campaign grades the real catalogue as an in-place one does | pending | F-14, F-15 | `node --test tests/campaign-parity.test.mjs`, and the signed-off real-catalogue runs |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `loadLine` in `plugin/scripts/load.mjs` | T2 | T1 before T2: the isolated parent prints the line once |
| T2 | `--in-place`, `isolate()`, `QUALITY_HARNESS_CAMPAIGN_CHILD` and the "worktree built" line | T3, T4 | T2 before both |

## Notes

- Every test these tasks turn green was committed as node:test `todo` (the spec binding). Each task's first step removes `todo` from its own tests before recording the red run: a todo test passes the suite whatever it asserts, so it cannot be a red.
- Every Acceptance carries the runner's exit status through `pipefail` and `&&`. Wrapping the count in `test "$(…)"` discarded it (Codex's review of the plan, 2026-09-30).
- T4 is the completion criterion: isolation is not the default in a release until T4's real-catalogue runs are signed off with zero mismatches.

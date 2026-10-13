# ADR-100 Tasks

Implementation tasks for ADR-100: A procedure the agent repeats is one command. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | none |
| 3 | T4 | none |
| 4 | T3 | T1 |
| 5 | T5 | T1, T2, T3, T4 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | A Codex review is recorded where release-evidence reads it, and an unreviewed plugin change is refused | done | none — no spec | five named tests in `tests/review-ledger.test.mjs`, the host-review and release-evidence suites, `--range` in the codex-review skill |
| T2 | `qh-check --commit` checks the staged tree and commits it in one call | done | none — no spec | five named tests in `tests/qh-check-commit.test.mjs`, the qh-check suites, `--commit` in the gate's help |
| T3 | `node scripts/release.mjs` runs this repository's release chain, resumably, from what it observes | done | none — no spec | six named tests in `tests/release.test.mjs` |
| T4 | A change only under docs/ runs the tests that read docs/, if a replay of 20 commits says it is faster and agrees | pending | none — no spec | four named tests in `tests/fast-check.test.mjs`; the replay and seeded faults in the sign-off |
| T5 | CLAUDE.md §12 and §13 point at the commands that now carry their procedure | pending | none — no spec | the commands and anchors in CLAUDE.md, and `tests/package.test.mjs` |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `reviews.jsonl` and `release-evidence`'s review question | T3 | T1 before T3 |
| T2 | `qh-check --commit` | T5 | T2 before T5 |
| T3 | `scripts/release.mjs` | T5 | T3 before T5 |
| T4 | `scripts/fast-check.mjs` and its measurement | T5 | T4 before T5; T5 names the lane only if T4 shipped it |

## Notes

- T4's replay is the one costly run in this record: about 20 x (100 s + the lane), priced and run once at a load below the core count.

# ADR-119 Tasks

Implementation tasks for ADR-119: what the backlog still holds after the 2026-10-20 re-check. See the parent ADR for the
decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | none |
| 3 | T3 | T1 |
| 4 | T4 | none |
| 5 | T5 | T1, T2, T3, T4 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| [T1](T1-two-fail-opens.md) | Two fail-opens: a pipe after a group, and an UNPROVEN test demoted for a done claim in a task file | done | none — no spec | `node --test --test-reporter=tap tests/fail-open.test.mjs tests/gates.test.mjs tests/qh-core-parity.test.mjs`, named tests |
| [T2](T2-review-row-pinned-model.md) | A review row says the model the launcher pinned | done | none — no spec | `node --test --test-reporter=tap tests/host-review.test.mjs tests/review-ledger.test.mjs`, named tests |
| [T3](T3-false-stops-and-refusals.md) | Three false stops and refusals | pending | none — no spec | `node --test --test-reporter=tap tests/adr-next.test.mjs tests/foreign-commit.test.mjs tests/log-receipts.test.mjs tests/standalone-link.test.mjs tests/qh-core-parity.test.mjs`, named tests, then the Go core |
| [T4](T4-output-and-blind-spots.md) | Wrong output and the gates' own blind spots | done | none — no spec | `node --test --test-reporter=tap tests/post-edit-check.test.mjs tests/dead-code-scan.test.mjs tests/unused-names.test.mjs tests/review-contract.test.mjs`, named tests |
| [T5](T5-test-hygiene.md) | Test hygiene | pending | none — no spec | `node --test --test-reporter=tap tests/test-hygiene.test.mjs`, named tests, then `node scripts/orphan-sweep.mjs` |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `shellWords()` carrying `\|` and `\|&` after a group | T3 | T1 before T3 |
| T1, T2, T3, T4 | the test files they edit | T5 | T5 last |

## Notes

- Readers change in T1, T3 and T4: an outside run before the release (CLAUDE.md §18).

# ADR-021 Tasks

Implementation tasks for ADR-021: a row removed from an evidence log is a change
to the evidence. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` /
`Covers` headers. This README is a derived index — when it disagrees with a task
file, the task file wins and the README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | Advise when a committed Verification Log row is gone from the file | pending | — | `python3 tests/gate-regressions.py plugin/bin …` |

## Notes

- The record's `Enforced-by` label is created by T1's S5. Until then `adr-lint`
  advises that it names nothing, which is the correct report for a Proposed
  record with no executed tasks.
- The alternative this record rejects — hash-chained rows — was rejected on a
  measurement, not on taste: `check_verification` already calls
  `committed_lines()` two lines above the digest-less notice, so the committed
  rows are in hand where the present rows are read.

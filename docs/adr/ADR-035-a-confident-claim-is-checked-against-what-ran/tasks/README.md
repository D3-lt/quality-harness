# ADR-035 Tasks

Implementation tasks for ADR-035: A confident claim is checked against what ran, and every verdict
is counted. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | T2 |
| 4 | T4 | T1 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | The claim is classified, and a confident one over unverified edits is named | pending | — | `node --test --test-name-pattern 'false success' tests/lifecycle.test.mjs` |
| T2 | Every completion event is written to the machine-local ledger | pending | — | `node --test --test-name-pattern 'claims ledger' tests/lifecycle.test.mjs` |
| T3 | The rate is read with its denominator and its exclusions | pending | — | `node --test tests/claims-rate.test.mjs` |
| T4 | The vocabulary is calibrated on this machine's real final messages | pending | — | human-observed |

Status: `pending` | `partial` | `blocked` | `done`.

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `completionClaim()` | T2, T4 | T1 before T2 and T4 |
| T2 | `claims.jsonl` row schema | T3 | T2 before T3 |

## Notes

- T4 needs real transcripts on the machine that runs it (`~/.claude/projects/*/*.jsonl`); it is the
  pre-registered criterion's own proof and cannot be hermetic. Its sign-off must record the sample
  size, the date, and the precision it measured.
- Nothing here blocks. Every new sentence the Stop hook emits is a `systemMessage`, never a
  refusal (CLAUDE.md §3).

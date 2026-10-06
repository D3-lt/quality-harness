# ADR-089 Tasks

Implementation tasks for ADR-089: corpus-probe says what its diff and attestation could not see.
See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | T2 |
| 4 | T4 | none |
| 5 | T5 | none |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | every diff line is marked, and the skipped fields are compared | pending | none — no spec | `node --test tests/probe-diff-marks.test.mjs` (four named tests) and the diff regression files |
| T2 | a PARTIAL run counts what it read, and the attestation says its look | pending | none — no spec | `node --test tests/probe-attest-partial.test.mjs` (three named tests) and `tests/corpus-probe.test.mjs` |
| T3 | attest-import files the new keys, and release-evidence names them | pending | none — no spec | `node --test tests/attest-look.test.mjs` (three named tests) and the two locked files |
| T4 | an overflowed reader is not "did not start" | pending | none — no spec | `node --test tests/probe-enobufs.test.mjs` (two named tests) |
| T5 | --adopt prints no absolute path and is not said to adopt | pending | none — no spec | `node --test tests/adopt-wording.test.mjs` (two named tests) |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `verdictMoves` returning `{ compared, notCompared, moves }` over a PARTIAL pair | T2 | T1 before T2 |
| T2 | attestation keys `look` and `notCompared` | T3 | T2 before T3 |

## Notes

- T4 and T5 touch none of T1-T3's functions and may run in any order.
- Every task runs `python3 scripts/test-locks.py` on each existing test file it edits, first (CLAUDE.md §2).

# ADR-028 Tasks

Implementation tasks for ADR-028: Bind an ordered step to the run that exercised it. See the parent
ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` headers. This README is
a derived index — when it disagrees with a task file, the task file wins.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | T1 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | [the writer records which steps ran](T1-the-writer-records-which-steps-ran.md) | done | — | `node --test tests/evidence-chain.test.mjs …` |
| T2 | [the reader reports a step no run names](T2-the-reader-reports-a-step-no-run-names.md) | done | — | `node --test tests/gates.test.mjs …` |
| T3 | [the mutation path is not a second grammar](T3-the-mutation-path-is-not-a-second-grammar.md) | done | — | `node --test tests/evidence-chain.test.mjs …` |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | ` · steps:S1,S3` trailing field in a Verification Log entry | T2 | T1 before T2 — T2 reads the field T1 writes, and cannot be shown red until something can write one |
| T1 | the same field, on the `--mutant` path as well | T3 | T1 before T3 — T3 adds no field; it makes the one T1 defined reach the path that was dropping it |

## Notes

- The field is OPTIONAL and TRAILING by design, not by convenience: three gates parse this grammar
  and ADR-021 makes a lost evidence row a change to the evidence. Every entry written before this
  record must stay valid, and T1's fence runs the existing evidence-chain suite to prove it.

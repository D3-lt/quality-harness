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

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | [the writer records which steps ran](T1-the-writer-records-which-steps-ran.md) | pending | — | `node --test tests/evidence-chain.test.mjs …` |
| T2 | [the reader reports a step no run names](T2-the-reader-reports-a-step-no-run-names.md) | pending | — | `node --test tests/gates.test.mjs …` |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | ` · steps:S1,S3` trailing field in a Verification Log entry | T2 | T1 before T2 — T2 reads the field T1 writes, and cannot be shown red until something can write one |

## Notes

- The field is OPTIONAL and TRAILING by design, not by convenience: three gates parse this grammar
  and ADR-021 makes a lost evidence row a change to the evidence. Every entry written before this
  record must stay valid, and T1's fence runs the existing evidence-chain suite to prove it.

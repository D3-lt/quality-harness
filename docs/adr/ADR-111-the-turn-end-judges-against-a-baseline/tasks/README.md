# ADR-111 Tasks

Implementation tasks for ADR-111: the turn end judges the work against a baseline taken at session start. See the parent
ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T4 | none |
| 3 | T2 | T4 |
| 4 | T3 | T2, T4 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | Inference reads pytest's own configuration | pending | none — no spec | `node --test tests/check-inference.test.mjs` (each named test passes once, nothing skipped) |
| T2 | A red check is said as red, and no check is one line | pending | none — no spec | `node --test tests/completion-judgement.test.mjs tests/hook-goldens.test.mjs` (each named test passes once, nothing skipped) |
| T3 | The baseline is taken at session start and read at the turn end | pending | none — no spec | `node --test tests/baseline.test.mjs` (each named test passes once, nothing skipped) |
| T4 | The Go core's missing rules are named, not broken | pending | none — no spec | `node --test tests/qh-core-parity.test.mjs tests/hook-goldens.test.mjs` (each named test passes once, nothing skipped) |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T2 | the red-check lead in R1 | T3 | T2 before T3 |
| T4 | the rules the Go core lacks, named in the parity tests | T2, T3 | T4 before T2 |

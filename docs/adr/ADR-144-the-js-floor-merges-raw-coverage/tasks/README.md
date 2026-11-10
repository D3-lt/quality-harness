# ADR-144 Tasks

Implementation tasks for ADR-144: the JavaScript floor is cut only once a merged raw-V8 measurement equals its serial twin on CI.

**Source of truth:** task-file Depends-on, Produces, Consumes and Covers headers.

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | Five landing runs measure the merged raw-V8 figure, serial and sharded, beside the unchanged floor | pending | none — no spec | `node --test tests/coverage-raw.test.mjs` |
| T2 | The required JavaScript floor runs the sharded raw form with recalibrated floors | pending | none — no spec | `node --test tests/coverage-floor-raw.test.mjs` |

Order: T1, T2.

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `coverage.sh --js --raw <n>`, the five runs' figures in §459 | T2 | T2 waits for T1's verdict and the owner's choice |

# ADR-131 Tasks

Implementation tasks for [ADR-131](../../ADR-131-native-reader-identity-and-measured-cost.md).

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | none |
| 3 | T3 | T1, T2 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | Native source and executed binary identity | done | none — no spec | `node --test --test-concurrency=1 tests/native-release.test.mjs tests/native-provenance.test.mjs tests/native-import.test.mjs tests/native-probe-path.test.mjs` |
| T2 | Native execution and exclusive context observation | done | none — no spec | Focused Go native-trace tests, then native observation, cost, footprint and process-collection Node tests; task fence is authoritative |
| T3 | Paired cost and context proof | pending | none — no spec | Human-observed paired report and adopter sign-off |

## Contract Coupling

T1 produces native provenance for T3. T2 produces trustworthy observations for T3. The task files own those contracts.

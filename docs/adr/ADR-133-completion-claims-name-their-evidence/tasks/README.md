# ADR-133 Tasks

Implementation tasks for ADR-133: Completion claims name their evidence.

**Source of truth:** task-file Depends-on, Produces, Consumes and Covers headers.

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | Select the shared completion contract | done | none — no spec | `node --test tests/completion-report-contract.test.mjs` |
| T2 | Observe reports on frozen misleading-completion cases | pending | none — no spec | human-observed comparison against protocol.md |
| T3 | Measure adopter reporting cost and preserve evidence scope | pending | none — no spec | human-observed private receipts and counts-only report |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | completion-proof-v1 | T2, T3 | Select the reference before observing reports |
| T2 | completion-case-evidence-v1 | T3 | Check bounded claim behavior before interpreting adoption |

## Notes

T1 can be delivered while T2/T3 evidence is pending; report those scopes separately.

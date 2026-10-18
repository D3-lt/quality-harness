# ADR-112 Tasks

Implementation tasks for ADR-112: the plugin is measured where its mechanism can work, against a kill criterion. See the
parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | T2 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | The scorer reads broken tests as an endpoint, and says PAYS or FUTILE at a look | pending | none — no spec | `node --test tests/eval-paired.test.mjs` (each named test passes once, nothing skipped) |
| T2 | The pilot verifies green baselines, and the pre-registrations are committed | pending | none — no spec | human-observed: the pilot's sign-off line |
| T3 | The stage's looks, its verdicts and what they decide | pending | none — no spec | human-observed: the main run's sign-off line |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | the broken-tests endpoint, PAYS and FUTILE at a look | T2, T3 | T1 before T2 |
| T2 | `prereg-<pair>-<model>.json` | T3 | T2 before T3 |

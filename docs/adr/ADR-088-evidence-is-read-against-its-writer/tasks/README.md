# ADR-088 Tasks

Implementation tasks for ADR-088: A row's sha fits its repository, and a publish pass names its ledger record.
See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | none |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | every row reader takes one sha width, keyed to the object format | pending | none — no spec | `node --test tests/vlog-sha-width.test.mjs` (two named tests pass) |
| T2 | the publish verdict counts only check events its ledger holds | pending | none — no spec | `node --test tests/publish-ledger-binding.test.mjs tests/fail-open.test.mjs` (four named tests pass) |

## Contract Coupling

None — T1 and T2 share no symbol and may run in either order.

## Notes

- T2 waits on the owner's approval to relock ADR-066 T1's locked test (ADR-088 Follow-ups). T1 does not.

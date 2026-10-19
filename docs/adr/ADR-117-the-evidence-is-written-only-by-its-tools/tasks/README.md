# ADR-117 Tasks

Implementation tasks for ADR-117: the evidence is written only by its tools. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Wave | Task | Depends-on |
|------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | T2 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | A hook-visible write into the state directory is refused | done | none — no spec | `node --test tests/ledger-writes.test.mjs` and the same under the Go core (each named test passes once, nothing skipped) |
| T2 | Every log row adr-verify writes leaves a receipt, and adr-lint refuses an uncommitted row without one | done | none — no spec | `node --test tests/log-receipts.test.mjs` (each named test passes once, nothing skipped) |
| T3 | The forge's protection of main is said, and every door is caught or named where it closes | done | none — no spec | `node --test tests/door-states.test.mjs` (each named test passes once, nothing skipped) |

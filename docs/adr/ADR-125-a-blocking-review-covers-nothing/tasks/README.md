# ADR-125 Tasks

Implementation tasks for ADR-125: a plugin commit is reviewed only when the newest review covering it did not request
changes. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Task Index

| ID | Title | Status | Depends-on | Covers | Acceptance |
|----|-------|--------|------------|--------|------------|
| [T1](T1-the-newest-review-decides.md) | The newest covering review decides, and a blocking one covers nothing | done | none — no spec | `node --test tests/review-blocking.test.mjs tests/review-ledger.test.mjs`, named tests |

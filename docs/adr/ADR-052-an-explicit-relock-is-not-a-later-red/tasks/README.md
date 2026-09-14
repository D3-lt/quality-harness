# ADR-052 Tasks

Implementation tasks for ADR-052: An explicit relock is not a later red. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | Writer records an explicit relock row | done | none — no spec | `node --test --test-name-pattern 'adr-verify --relock fills unproven the hasher can now see|adr-verify --relock refuses when a hashed body moved' tests/test-lock.test.mjs` |
| T2 | Reader uses the relock map and keeps later-red conflict | done | none — no spec | `node --test --test-name-pattern 'a relock row is the done map and is weaker than first-red|a later red with a different sha and no kind still conflicts after relock' tests/test-lock.test.mjs` |

Status: `pending` | `partial` | `blocked` | `done`.

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | relock kind field + writer row | T2 | T1 before T2 so the reader does not invent a second grammar |

## Notes

- Tests live in `tests/test-lock.test.mjs`.
- Do not bump `TEST_HASH_REQUIRED_FROM`.

# ADR-034 Tasks

Implementation tasks for ADR-034: Let `adr-next` answer for a corpus root instead of reporting it
empty. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` headers. This README is
a derived index — when it disagrees with a task file, the task file wins.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | [a corpus root is enumerated](T1-a-corpus-root-is-enumerated.md) | pending | — | `node --test tests/adr-next.test.mjs …` |

## Contract Coupling

None — one task.

## Notes

- The empty-directory case already behaved correctly and its test passed on the first run. It is kept
  as a regression and the record does not claim it as a fix.
- Only the MESSAGE half of issue #10 is fixed here. The reported exit 0 never reproduced; the issue
  stays open on that half with the confound named.

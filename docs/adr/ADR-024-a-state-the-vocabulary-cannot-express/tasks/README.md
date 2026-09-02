# ADR-024 Tasks

Implementation tasks for ADR-024: Give a name to the two states these gates can see but cannot say.
See the parent ADR for the decision.

**Source of truth:** the task files' headers. This README is a derived index.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | none |

T3 is independent of both — §83's header shares the record's reasoning but none of its code.

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | Say "could not resolve", not "broken", when that is what happened | done | — | `python3 tests/gate-regressions.py …` |
| T2 | Let an author declare a target this repository does not own | done | — | `python3 tests/gate-regressions.py … && node --test tests/gates.test.mjs` |
| T3 | Give a task waiting on an unmade decision a header a tool can read | pending | — | `python3 tests/gate-regressions.py …` |

Status: `pending` | `partial` | `blocked` | `done`.

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | the `UNRESOLVED` verdict word and the kinds it covers | T2 | T1 before T2 — T2 moves a declared row out of the set T1 renamed, so there is nothing to move until the rename exists |

## Notes

- **This corpus exercises none of this**, measured 2026-09-02: `adr-debt docs/adr` reports 0 BROKEN
  rows and no task waits on an unmade decision. Every task therefore asserts on fixtures AND asserts
  the gate can still say the other thing — the §78 shape, and the reason a check with an empty local
  universe is defensible here at all.
- Both features are pre-registered for removal in the parent ADR if ten records pass without a use.

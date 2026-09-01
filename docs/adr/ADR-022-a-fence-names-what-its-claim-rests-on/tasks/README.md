# ADR-022 Tasks

Derived index. Where this file and a task file disagree, the task file wins.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | T1, T2 |
| 4 | T4 | T1 |

T4 depends only on T1 and may be executed at any point after it; it is ordered last because T3 is the
record's `Enforced-by` and is worth landing first.

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | Let a task declare the mechanisms its fence's claim rests on | done | — | `python3 tests/gate-regressions.py …` |
| T2 | Record which declared mechanism a killed mutant bound | pending | — | `python3 tests/gate-regressions.py …` |
| T3 | Report the declared mechanisms no bound mutant has covered | pending | — | `python3 tests/gate-regressions.py …` |
| T4 | Advise on a declaration smaller than the fence's segment count, in the counts observed | pending | — | `python3 tests/gate-regressions.py …` |

Status: `pending` | `partial` | `blocked` | `done`.

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `rests_on()` declaration parser | T2, T3, T4 | T1 before all three |
| T2 | ` · covers:<name>` row field | T3 | T2 before T3 |

## Notes

The record's own argument is that a declaration is safe to hand-write because it can only INCREASE
what a task admits is unproven, while evidence stays tool-written. Nothing in these four tasks may
make a row about a run hand-writable; T2's Invariants carry that line.

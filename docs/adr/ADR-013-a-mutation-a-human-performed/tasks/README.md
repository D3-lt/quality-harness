# ADR-013 tasks — derived index

Three tasks, strictly ordered. This file is DERIVED: where it disagrees with a task file, the task
file wins.

| Order | Task | Depends-on | Status |
|---|---|---|---|
| 1 | T1 | none | pending |
| 2 | T2 | T1 | pending |
| 3 | T3 | T1, T2 | pending |

## Why the order is forced rather than preferred

T2 writes a row that only T1's grammar can accept, and T3 documents a lane that only exists once both
have landed. There is no parallel-safe grouping here — three tasks, one chain.

## Notes

- **The record is `Proposed`.** None of these is a work order until a human accepts it. The decision
  being proposed is whether a human-performed mutation gets a lane at all, and the tasks exist to
  show what accepting it would cost, not to be executed on their own.
- T1 and T2 both touch the evidence grammar, which two gates read. The writer and both readers must
  agree in the same commit — docs/BACKLOG.md §47 and §58 are what happens when they do not.

# ADR-013 tasks — derived index

Three tasks, strictly ordered. This file is DERIVED: where it disagrees with a task file, the task
file wins.

| Order | Task | Depends-on | Status |
|---|---|---|---|
| 1 | T1 | none | done |
| 2 | T2 | T1 | done |
| 3 | T3 | T1, T2 | pending |

## Why the order is forced rather than preferred

T2 writes a row that only T1's grammar can accept, and T3 documents a lane that only exists once both
have landed. There is no parallel-safe grouping here — three tasks, one chain.

## Notes

- **The record is `Accepted`** (2026-08-30). These are work orders. T1 and T2 are done and carry tool-written evidence; T3 is the terminal task.
- T1 and T2 both touch the evidence grammar, which two gates read. The writer and both readers must
  agree in the same commit — docs/BACKLOG.md §47 and §58 are what happens when they do not.

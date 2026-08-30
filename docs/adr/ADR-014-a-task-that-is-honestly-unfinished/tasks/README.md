# ADR-014 tasks — derived index

Three tasks. T1 and T2 are independent; T3 depends on both. This file is DERIVED: where it disagrees
with a task file, the task file wins.

| Order | Task | Depends-on | Status |
|---|---|---|---|
| 1 | T1 | none | pending |
| 1 | T2 | none | pending |
| 2 | T3 | T1, T2 | pending |

## Waves

- **Wave 1** — T1 and T2 in parallel. They touch the same file (`plugin/bin/adr-lint`) but different
  functions, and neither reads the other's output.
- **Wave 2** — T3, which consumes both.

## Notes

- **The record is `Proposed`.** None of these is a work order until a human accepts it. What is being
  proposed is that `partial` becomes a status with obligations and that a task may declare what it
  waits for; the tasks exist to show the cost of accepting, not to be executed.
- T1 changes a vocabulary three tools read. The vocabulary and its readers move together or §58
  happens again.

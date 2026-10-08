# ADR-091 Tasks

Implementation tasks for ADR-091: The mutation catalogue is one file per mutated source.
See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | T1, T2 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | mutate.mjs reads a catalogue directory and refuses a repeated label | done | none — no spec | `node --test tests/mutate-catalogue-dir.test.mjs` (named tests pass) plus the mutate regression files |
| T2 | every other reader reads the directory | pending | none — no spec | `node --test tests/catalogue-readers.test.mjs` (named tests pass) |
| T3 | the catalogue moves in one commit | pending | none — no spec | the union equals the old file, `--stale` is clean, `--case` selects the same labels |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `loadCatalogue(root)` | T2, T3 | T1 before T2 and T3 |
| T2 | every shipped and repository reader reads `tests/mutations/` | T3 | the data moves only after every reader can find it |

## Notes

- T3 waits on the owner: it cannot keep ADR-075 T2's locked test `every shard slice covers the catalogue exactly once` byte-identical.
- A release CI run must not be in flight when T3 is pushed (CLAUDE.md §13.6).

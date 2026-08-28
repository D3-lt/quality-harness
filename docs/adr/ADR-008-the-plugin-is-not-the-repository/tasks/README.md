# ADR-008 Tasks

Implementation tasks for ADR-008: Ship the plugin, not the repository. See the parent ADR for the
decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | find out how a source subdirectory is unpacked | pending | — | `bash docs/adr/ADR-008-the-plugin-is-not-the-repository/tasks/T1-probe.sh` |
| T2 | move the plugin under it, and assert what ships | pending | — | `bash scripts/selftest.sh` |

Status: `pending` | `running` | `blocked` | `done` | `failed`.

## Contract Coupling

T1 produces a verified answer to one question: does `${CLAUDE_PLUGIN_ROOT}` point INSIDE the `source`
directory once it is not `"."`? T2 is the move, and it must not start before that answer exists.

**A negative answer withdraws the record rather than blocking T2.** Twenty skill and hook references
resolve through `${CLAUDE_PLUGIN_ROOT}`, and if the move breaks them, no test in this repository can
see it — they run from a checkout where the paths still work. A 40% download saving does not buy
that risk.

## Why T1 reads `pending` while its log holds evidence

`adr-lint` refused `done` here, and it was right: the record is `Proposed`, and a `done` row asserts
that an unaccepted decision was executed. Both halves of that refusal are true at once —

- T1's work is finished. Its answer is recorded in the task, its acceptance fence has a tool-written
  exit-0 entry, and its Mutation Log holds a killed mutant proving the probe can say no.
- ADR-008 is not accepted. The owner held it deliberately, because T2 moves every file in the
  repository.

So the evidence stands and the index does not claim more than happened. Flipping this row is one
edit once the decision is taken; the probe does not need re-running, and its digest will still match.

## Notes

- The tests must keep reaching into the plugin directory. That is the point of the boundary: they
  check the product from outside it, and they stop being part of it.
- T2's shipped-set check reads `marketplace.json`'s `source` rather than a hardcoded list, so a file
  left behind by the move fails the suite instead of silently ceasing to ship.

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
| T1 | find out how a source subdirectory is unpacked | done | — | `bash docs/adr/ADR-008-the-plugin-is-not-the-repository/tasks/T1-probe.sh` |
| T2 | move the plugin under it, and assert what ships | pending | — | `bash scripts/selftest.sh` |

Status: `pending` | `running` | `blocked` | `done` | `failed`.

## Contract Coupling

T1 produces a verified answer to one question: does `${CLAUDE_PLUGIN_ROOT}` point INSIDE the `source`
directory once it is not `"."`? T2 is the move, and it must not start before that answer exists.

**A negative answer withdraws the record rather than blocking T2.** Twenty skill and hook references
resolve through `${CLAUDE_PLUGIN_ROOT}`, and if the move breaks them, no test in this repository can
see it — they run from a checkout where the paths still work. A 40% download saving does not buy
that risk.

## Notes

- The tests must keep reaching into the plugin directory. That is the point of the boundary: they
  check the product from outside it, and they stop being part of it.
- T2's shipped-set check reads `marketplace.json`'s `source` rather than a hardcoded list, so a file
  left behind by the move fails the suite instead of silently ceasing to ship.

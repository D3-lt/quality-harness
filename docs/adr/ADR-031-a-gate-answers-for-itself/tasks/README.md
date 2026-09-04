# ADR-031 Tasks

Implementation tasks for ADR-031: Make every gate answer `--version` for itself. See the parent ADR
for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` headers. This README is
a derived index — when it disagrees with a task file, the task file wins.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | [a gate answers for itself](T1-a-gate-answers-for-itself.md) | done | — | `node --test tests/gates.test.mjs …` |

## Contract Coupling

None — one task. The record's Inter-task Contracts section records why the drafted T1/T2 split was
withdrawn rather than deleting it.

## Notes

- The `report_version()` block is duplicated in all eleven gates ON PURPOSE, and the record argues
  the count: a shared module would need a `sys.path` insert, `sys.dont_write_bytecode` and the import
  in every gate — more lines per call site than the four it removes.
- The test enumerates `plugin/bin/` rather than listing gate names, so a twelfth gate fails it until
  it answers too.

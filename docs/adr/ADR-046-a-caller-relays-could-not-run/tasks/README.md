# ADR-046 Tasks

Implementation tasks for ADR-046: A caller relays could-not-run as could-not-run. See the parent ADR
for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Wave | Task | Depends-on |
|------|------|------------|
| 1 | T1, T2, T3 | none |

## Waves

- **Wave 1** — the three callers, one each; they share the table of codes and no file.

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | The dispatcher relays a gate's could-not-run code as UNPROVEN | done | — | `node --test --test-name-pattern 'the dispatcher relays a gate that could not run' tests/gates.test.mjs` |
| T2 | qh-mcp relays a reading gate's could-not-run code on the error channel | done | — | `node --test --test-name-pattern 'could-not-run code reaches the client' tests/mcp-server.test.mjs` |
| T3 | The SessionStart orientation says UNPROVEN when adr-next could not run | done | — | `node --test --test-name-pattern 'when adr-next could not run' tests/lifecycle.test.mjs` |

Status: `pending` | `partial` | `blocked` | `done`.

## Contract Coupling

None.

## Notes

- Every task's test runs against a plugin copied WITHOUT `lib/` — the shape that produces the code —
  and beside the real plugin answering with a finding or a ready task.
- The codes come from ADR-045 T4's table, bound to each gate's Exit block by `tests/gates.test.mjs`
  `LIB_ABSENT`; the three callers carry only the gates they run.

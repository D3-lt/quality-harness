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
| 2 | T4, T5, T6, T7 | T1 (T4, T7); T3 (T5); none (T6) |

## Waves

- **Wave 1** — the three callers, one each; they share the table of codes and no file.
- **Wave 2** — the third review's findings on those callers: stderr at `runArtifactGates`, SessionStart cap vs UNPROVEN, the ADR-012 amendment, postmortem-verify in the table.

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | The dispatcher relays a gate's could-not-run code as UNPROVEN | done | — | `node --test --test-name-pattern 'the dispatcher relays a gate that could not run' tests/gates.test.mjs` |
| T2 | qh-mcp relays a reading gate's could-not-run code on the error channel | done | — | `node --test --test-name-pattern 'could-not-run code reaches the client' tests/mcp-server.test.mjs` |
| T3 | The SessionStart orientation says UNPROVEN when adr-next could not run | done | — | `node --test --test-name-pattern 'when adr-next could not run' tests/lifecycle.test.mjs` |
| T4 | runArtifactGates relays UNPROVEN from stderr | pending | — | `node --test --test-name-pattern 'runArtifactGates returns UNPROVEN' tests/lifecycle.test.mjs` |
| T5 | SessionStart surfaces every UNPROVEN and lists directories in posix form | pending | — | `node --test --test-name-pattern 'SessionStart always surfaces an UNPROVEN ready line' tests/lifecycle.test.mjs` |
| T6 | ADR-046 names the ADR-012 §2 amendment | pending | — | `node --test --test-name-pattern 'ADR-046 names the ADR-012' tests/gates.test.mjs && python3 plugin/bin/adr-lint docs/adr/ADR-046-a-caller-relays-could-not-run.md && python3 plugin/bin/adr-lint docs/adr/ADR-045-one-record-grammar.md` |
| T7 | postmortem-verify declares could-not-run and sits in the table | pending | — | `node --test --test-name-pattern 'postmortem-verify on a path it cannot read' tests/gates.test.mjs` |

Status: `pending` | `partial` | `blocked` | `done`.

## Contract Coupling

None.

## Notes

- Every task's test runs against a plugin copied WITHOUT `lib/` — the shape that produces the code —
  and beside the real plugin answering with a finding or a ready task.
- The codes come from ADR-045 T4's table, bound to each gate's Exit block by `tests/gates.test.mjs`
  `LIB_ABSENT`; the three callers carry only the gates they run.

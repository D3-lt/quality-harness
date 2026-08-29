# ADR-012 Tasks

Implementation tasks for ADR-012: Expose the reading gates over MCP, and refuse the two that execute
the corpus. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated. Regenerate rather than hand-edit.

## Execution Order

Four tasks, sequential — each consumes the one before it.

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | T1, T2 |
| 4 | T4 | T1, T2, T3 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | A stdio JSON-RPC core whose read-only annotation cannot disagree with its registration | pending | — | `node --test tests/mcp-server.test.mjs` |
| T2 | Register the five reading gates, and make the two executing ones unregisterable | pending | — | `node --test tests/mcp-server.test.mjs` |
| T3 | A finding is content; the error channel is reserved for a gate that could not run | pending | — | `node --test tests/mcp-server.test.mjs` |
| T4 | Package the server, and measure whether a real Claude Desktop can use it | pending | — | human-observed |

Status: `pending` | `running` | `blocked` | `done` | `failed`.

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `reading_tool()` registrar and the registry it fills | T2, T3 | T1 before T2 and T3 |
| T1 | `dispatch(request)` returning a JSON-RPC response object | T2, T3 | T1 before T2 and T3 |
| T2 | the five tool definitions and their argument schemas | T3, T4 | T2 before T3 |
| T3 | the tool result shape — findings and exit code as content | T4 | T3 before T4 |

## Notes

- **T4 is human-observed and it is the only rung-4 measurement in this record.** Its sign-off must
  record the exact prompt, the tool called, the corpus path, the Desktop version and the date. An
  undated measurement naming no version is unfalsifiable the moment either changes.
- **T4 can fail, and failing is a real outcome.** If Desktop cannot spawn the server, or spawns it
  and never calls a tool, the record is withdrawn rather than softened. Nothing downstream depends on
  it, which is why it is last.
- T4 also takes a measurement another project has had pending for a week — whether Desktop surfaces
  `server.WithInstructions`. Report it back to that corpus whichever way it goes.
- `Governs:` on the parent record is deliberately `None — declared by its tasks` until T1 lands. A
  Proposed record cannot govern a file it has not shipped, and declaring one would resolve to nothing
  for as long as the record is Proposed.

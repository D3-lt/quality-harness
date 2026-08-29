# Task ADR-012-T4: Package the server, and measure whether a real Claude Desktop can use it

**Depends-on:** T1, T2, T3
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** unassigned
**Produces:** none — this is the terminal task
**Consumes:** the tool result shape (T3)
**Data dependency:** needs a real Claude Desktop install, restarted, on the machine running the measurement

## Goal

`qh-mcp` ships like every other gate — forwarder, `.cmd` shim, packaging test — and a real Claude
Desktop, registered against it, answers a question only a gate can answer.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/qh-mcp.cmd` | add | Windows shim; every other bin entry has one and the packaging test requires it |
| `docs/mcp.md` | add | The `claude_desktop_config.json` entry a user copies, and what the client does and does not get |
| `tests/package.test.mjs` | edit | The new bin entry must ship with its shim and its executable bit in git's index |
| `docs/adr/ADR-012-…​.md` | edit | Set `Governs:` to `plugin/bin/qh-mcp` once the path is tracked |

`plugin/scripts/standalone-link.mjs` is deliberately NOT edited: it generates a forwarder for every
entry it finds in `plugin/bin/`, so the new one is picked up by construction. The packaging test is
what proves that actually happened rather than assuming it.

## Ordered Steps

1. Confirm the failing test first — write the RED packaging test asserting `plugin/bin/qh-mcp` and
   its `.cmd` ship, and that the mode in
   **git's index** (`git ls-files -s`) is executable. A Git for Windows checkout reports `0644` for
   everything on disk, so `statSync` answers a question about the checkout rather than the package
   (CLAUDE.md §7). Confirm red before adding the files.
2. Add the `.cmd` shim, matching the existing ones rather than inventing a shape.
3. Write `docs/mcp.md`: the config entry, the five tools, and — plainly — that `adr-verify` and
   `spec-verify` are absent and why. A user who cannot find them must find the reason instead of
   assuming it is an oversight.
4. Register against a real Claude Desktop and restart it. Ask it: *"use the quality-harness tools to
   lint the ADRs in <path> and tell me what they say."* Record the exact prompt, whether a tool was
   called, and the answer.
5. Record the `WithInstructions` observation in the same run — did any of the server's instruction
   text reach the model? This is the measurement agentsmemory's ADR-021 T3 has had pending for a
   week; report it back to that corpus whichever way it goes.
6. Set `Governs:` on the parent record now that `plugin/bin/qh-mcp` is tracked.

## Acceptance

Acceptance is human-observed: a Claude Desktop session, restarted after registration, called at
least one `qh_*` tool and reported the gate's finding. Sign-off records the exact prompt, the tool
called, the corpus path, and whether the server's instruction text was visible to the model.

The automated half — packaging — runs as part of the suite and is not this task's acceptance,
because it cannot answer the question this task exists to ask.

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `what ships is the plugin and nothing else` | `tests/package.test.mjs` | Existing test; the new bin entry and its shim are in the shipped tree | — |
| `every shipped gate carries at least one mutation` | `tests/package.test.mjs` | Existing test; `qh-mcp` is a gate and must be in the campaign | — |
| `a bin entry ships executable in git's index` | `tests/package.test.mjs` | The mode git records, not the mode this checkout has | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | The packaging assertions |
| 2 — something selects it | `standalone-link.mjs` finding the new bin entry, asserted rather than assumed |
| 3 — the caller can discover it | `docs/mcp.md` carries the config entry; the `claude_desktop_config.json` snippet IS the discovery mechanism for this client |
| 4 — it is used | **This task's sign-off is the rung-4 measurement** — the only one in this record, and the reason the acceptance is human-observed |

## Mutation Log

## Invariants

- The shipped tree gains exactly two files under `plugin/`.
- `docs/mcp.md` states which gates are absent and why, not only which are present.

## Risks

- Desktop cannot spawn a Python stdio server from its config. This is the risk the task exists to
  measure; if it materialises the record is WITHDRAWN, not softened.
- The measurement is taken on one machine and one Desktop version. Say so in the sign-off — an
  undated measurement naming no version is unfalsifiable the moment either changes.

## Stop Condition

Stop if Desktop spawns the server but never calls a tool. That is a different finding from "cannot
spawn" — it means the tools are reaching the model and not being chosen — and it needs the prompt and
the tool descriptions examined before anyone concludes the transport is at fault.

## Out of Scope

- Any client other than Claude Desktop. (permanent: §33 is about the client with no shell; every
  other client this project cares about runs Claude Code, which already has the gates.)
- Making the measurement pass. (permanent: the criterion is falsifiable or it is a formality — if
  Desktop cannot use this, that is the answer, and this record says so in its Decision.)

## Verification Log
